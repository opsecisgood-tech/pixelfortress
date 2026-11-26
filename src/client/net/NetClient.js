// Client network session: handshake, server-time sync, input command generation (60 Hz),
// client-side prediction with server reconciliation, and snapshot interpolation for remote entities.
import { CMD_DT, INTERP_DELAY, PROTOCOL_VERSION, BTN, MATCH_STATE } from '../../shared/constants.js';
import { World } from '../../shared/physics.js';
import { getMap } from '../../maps/index.js';
import { getClass, CLASS_IDS } from '../../shared/config/classes.js';
import { WEAPONS } from '../../shared/config/weapons.js';
import { createMoveState, stepMovement, moveParamsFor, MOVE_SYNC_FIELDS } from '../../shared/movement.js';
import { createWeaponState, stepWeapons, unpackWeaponState } from '../../shared/weaponLogic.js';
import { lerp, lerpAngle } from '../../shared/math.js';

export class NetClient {
  constructor(transport, hello) {
    this.t = transport;
    this.hello = hello;
    this.myId = -1;
    this.connected = false;
    this.roster = new Map();
    this.history = new Map();     // playerId -> [{ t, a }]
    this.latest = null;           // latest snapshot (common fields)
    this.me = null;               // latest 'me' block
    this.offset = null;           // serverTime - localTime
    this.seq = 0;
    this.pending = [];
    this.outbox = [];
    this.cmdAcc = 0;
    this.ms = createMoveState();
    this.ws = null;
    this.classId = hello.classId || 'scout';
    this.spawnCount = -1;
    this.smooth = [0, 0, 0];
    this.desiredSlot = 0;
    this.handlers = {};
    this.stats = { rtt: 0, snaps: 0, bytesIn: 0, lastSnapAt: 0 };
    this.results = null;
    t_bind(this);
  }

  on(name, fn) { this.handlers[name] = fn; return this; }
  emit(name, ...a) { const h = this.handlers[name]; if (h) h(...a); }

  start() {
    this.t.send({ t: 'hello', protocol: PROTOCOL_VERSION, ...this.hello });
  }

  now() { return performance.now() / 1000; }
  serverNow() { return this.offset === null ? 0 : this.now() + this.offset; }
  renderTime() { return this.serverNow() - INTERP_DELAY; }

  onMessage(m) {
    switch (m.t) {
      case 'welcome':
      case 'map':
        this.myId = m.id;
        this.mapId = m.mapId;
        this.mode = m.mode;
        this.isHost = m.isHost;
        this.room = m.room;
        this.settings = m.settings;
        this.map = getMap(m.mapId);
        this.world = new World(this.map.boxes, this.map.bounds);
        this.history.clear();
        this.pending = [];
        this.spawnCount = -1;
        this.results = null;
        this.connected = true;
        try { sessionStorage.setItem('pf_token', m.token); } catch { /* ignore */ }
        this.emit(m.t === 'welcome' ? 'welcome' : 'mapchange', m);
        break;
      case 's': this.onSnapshot(m); break;
      case 'e': this.emit('events', m.e); break;
      case 'r':
        this.roster.clear();
        for (const p of m.players) this.roster.set(p.id, p);
        this.rosterMeta = { room: m.room, mapId: m.mapId, mode: m.mode, botFill: m.botFill };
        this.emit('roster', this.roster);
        break;
      case 'res': this.results = m.r; this.emit('results', m.r); break;
      case 'chat': this.emit('chat', m); break;
      case 'notice': this.emit('notice', m); break;
      case 'ping': this.t.send({ t: 'pong', n: m.n }); break;
      case 'error': this.emit('error', m.reason); break;
      default:
    }
  }

  onSnapshot(m) {
    const now = this.now();
    const sample = m.st - now;
    if (this.offset === null || Math.abs(sample - this.offset) > 1) this.offset = sample;
    else if (sample > this.offset) this.offset += (sample - this.offset) * 0.5;
    else this.offset += (sample - this.offset) * 0.03;
    this.stats.snaps++;
    if (this.stats.lastSnapAt) this.stats.snapInterval = now - this.stats.lastSnapAt;
    this.stats.lastSnapAt = now;

    for (const a of m.p) {
      let h = this.history.get(a[0]);
      if (!h) { h = []; this.history.set(a[0], h); }
      h.push({ t: m.st, a });
      while (h.length > 2 && h[1].t < m.st - 1) h.shift();
    }
    // forget players no longer present for a while
    for (const [id, h] of this.history) if (!this.roster.has(id) && h[h.length - 1].t < m.st - 2) this.history.delete(id);
    const prevState = this.latest?.ms;
    this.latest = m;
    this.reconcile(m.me);
    if (prevState !== m.ms) this.emit('matchstate', m.ms, prevState);
    this.emit('snapshot', m);
  }

  reconcile(me) {
    if (!me) return;
    const prevAlive = this.me?.alive;
    this.me = me;
    this.classId = me.cls;
    const cls = getClass(me.cls);
    if (me.sc !== this.spawnCount || !this.ws) {
      // fresh spawn: hard reset prediction
      this.spawnCount = me.sc;
      this.ms = createMoveState();
      this.ws = createWeaponState(cls, 0, me.wp || cls.weapons);
      this.applyServerState(me);
      this.pending = this.pending.filter((c) => c.seq > me.ack);
      this.smooth = [0, 0, 0];
      this.desiredSlot = this.ws.slot;
      this.emit('spawned', me);
      return;
    }
    if (prevAlive && !me.alive) this.emit('died', me);
    const before = [this.ms.x, this.ms.y, this.ms.z];
    this.applyServerState(me);
    this.pending = this.pending.filter((c) => c.seq > me.ack);
    if (me.alive) {
      for (const cmd of this.pending) this.predict(cmd, true);
      const ex = before[0] - this.ms.x, ey = before[1] - this.ms.y, ez = before[2] - this.ms.z;
      const err = Math.hypot(ex, ey, ez);
      if (err > 3) this.smooth = [0, 0, 0];
      else if (err > 0.001) { this.smooth[0] += ex; this.smooth[1] += ey; this.smooth[2] += ez; }
    }
  }

  applyServerState(me) {
    const m = me.m;
    const s = this.ms;
    s.x = m[0]; s.y = m[1]; s.z = m[2]; s.vx = m[3]; s.vy = m[4]; s.vz = m[5];
    s.grounded = !!m[6]; s.crouch = !!m[7]; s.airJumps = m[8]; s.coyote = m[9]; s.jumpBuffer = m[10];
    s.prevButtons = m[11]; s.landTimer = m[12]; s.airTime = m[13]; s.blastJump = m[14] | 0; s.blastLand = m[15] || 0;
    unpackWeaponState(this.ws, me.w);
    void MOVE_SYNC_FIELDS;
  }

  abilityActive(id) {
    if (!this.me) return false;
    return getClass(this.me.cls).ability.id === id && this.me.ab[3] === 1;
  }

  moveParams() {
    const cls = getClass(this.classId);
    const w = this.ws.w[this.ws.slot];
    const def = WEAPONS[w.id];
    let moveMult = 1;
    if (def.spinUp && w.spin > 0) moveMult *= def.spinMoveMult;
    if (def.scope && this.ws.scoped) moveMult *= def.scope.moveMult;
    if (cls.ability.moveMult && this.abilityActive(cls.ability.id)) moveMult *= cls.ability.moveMult;
    if (this.me?.ry > 0) moveMult *= getClass('soldier').ability.rallyMoveMult;
    return moveParamsFor(cls, { moveMult, frozen: this.latest?.ms === MATCH_STATE.PREROUND, canSprint: !(def.spinUp && w.spin > 0) });
  }

  weaponCtx() {
    const cls = getClass(this.classId);
    const st = this.latest?.ms;
    return {
      pid: this.myId, alive: !!this.me?.alive,
      reloadMult: cls.reloadSpeed * (cls.ability.reloadMult && this.abilityActive(cls.ability.id) ? cls.ability.reloadMult : 1),
      explosiveReloadMult: cls.passive.explosiveReloadMult || 1,
      spreadMult: this.abilityActive('suppression') ? cls.ability.spreadMult : 1,
      hspeed: Math.hypot(this.ms.vx, this.ms.vz), grounded: this.ms.grounded, crouch: this.ms.crouch, sprinting: this.ms.sprinting,
      disarmed: st === MATCH_STATE.PREROUND || st === MATCH_STATE.ENDED || !!this.me?.ck?.[1] || this.me?.ck?.[2] > 0,
    };
  }

  predict(cmd, replay) {
    if (!this.world || !this.ws) return [];
    stepMovement(this.ms, cmd, this.world, this.moveParams());
    const evs = stepWeapons(this.ws, cmd, this.weaponCtx());
    return replay ? [] : evs;
  }

  /**
   * Called every render frame with the current input state.
   * input: { buttons, yaw, pitch } ; returns array of { cmd, events, move } produced this frame.
   */
  update(dt, input) {
    const out = [];
    if (!this.connected || !this.world || !this.ws) return out;
    this.cmdAcc += Math.min(dt, 0.1);
    while (this.cmdAcc >= CMD_DT) {
      this.cmdAcc -= CMD_DT;
      const cmd = { seq: ++this.seq, dt: CMD_DT, b: input.buttons, y: input.yaw, p: input.pitch, w: this.desiredSlot, lt: this.renderTime() };
      this.pending.push(cmd);
      if (this.pending.length > 240) this.pending.shift();
      this.outbox.push([cmd.seq, cmd.dt, cmd.b, +cmd.y.toFixed(4), +cmd.p.toFixed(4), cmd.w, +cmd.lt.toFixed(3)]);
      const alive = !!this.me?.alive;
      const events = alive ? this.predict(cmd, false) : [];
      out.push({ cmd, events, jumped: this.ms.jumped, doubleJumped: this.ms.doubleJumped, impact: this.ms.lastImpact, stepUp: this.ms.stepUp });
      if (this.outbox.length >= 2) this.flush();
    }
    // decay smoothing offset
    const k = Math.exp(-dt * 14);
    this.smooth[0] *= k; this.smooth[1] *= k; this.smooth[2] *= k;
    return out;
  }

  flush() {
    if (!this.outbox.length) return;
    this.t.send({ t: 'c', c: this.outbox });
    this.outbox = [];
  }

  selectSlot(slot) {
    if (slot < 0 || slot > 2) return;
    this.desiredSlot = slot;
  }

  renderPos() {
    return [this.ms.x + this.smooth[0], this.ms.y + this.smooth[1], this.ms.z + this.smooth[2]];
  }

  // Interpolated state of a remote player at render time.
  sample(id, rt = this.renderTime()) {
    const h = this.history.get(id);
    if (!h || !h.length) return null;
    let a = h[0], b = null;
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i].t <= rt) { a = h[i]; b = h[i + 1] || null; break; }
    }
    if (!b) {
      const last = h[h.length - 1];
      return { a: last.a, x: last.a[1], y: last.a[2], z: last.a[3], yaw: last.a[4], pitch: last.a[5], stale: rt - last.t };
    }
    const k = Math.min(1, Math.max(0, (rt - a.t) / Math.max(1e-4, b.t - a.t)));
    const A = a.a, B = b.a;
    // snap on teleport (respawn)
    if (Math.hypot(B[1] - A[1], B[3] - A[3]) > 6) return { a: B, x: B[1], y: B[2], z: B[3], yaw: B[4], pitch: B[5], stale: 0 };
    return { a: k < 0.5 ? A : B, x: lerp(A[1], B[1], k), y: lerp(A[2], B[2], k), z: lerp(A[3], B[3], k), yaw: lerpAngle(A[4], B[4], k), pitch: lerp(A[5], B[5], k), stale: 0, vx: (B[1] - A[1]) / (b.t - a.t), vz: (B[3] - A[3]) / (b.t - a.t) };
  }

  send(obj) { this.t.send(obj); }
  requestClass(classId) { if (CLASS_IDS.includes(classId)) this.t.send({ t: 'class', classId }); }
  requestTeam(team) { this.t.send({ t: 'team', team }); }
  chat(text, team) { this.t.send({ t: 'chat', text, team }); }
  host(action, extra = {}) { this.t.send({ t: 'host', action, ...extra }); }
  close() { try { this.t.close(); } catch { /* ignore */ } }
}

function t_bind(nc) {
  nc.t.onmessage = (m) => nc.onMessage(m);
  nc.t.onclose = (reason) => { nc.connected = false; nc.emit('close', reason); };
}

export { BTN };
