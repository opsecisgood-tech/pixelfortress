// In-game HUD: scores/timer, health, ammo, ability cooldown, crosshair, hit feedback, damage direction,
// kill feed, objective status, scope, death/respawn panel, scoreboard, chat and notifications.
import * as THREE from 'three';
import { getClass, CLASSES } from '../../shared/config/classes.js';
import { WEAPONS, ABILITY_SOURCES } from '../../shared/config/weapons.js';
import { MODES } from '../../shared/config/modes.js';
import { MAP_IDS } from '../../maps/index.js';
import { getMap } from '../../maps/index.js';
import { PROJECTILE_KINDS } from '../../server/projectiles.js';
import { PF, MATCH_STATE, FLAG_STATE, FLAG_STATE_NAMES, TEAM_NAMES } from '../../shared/constants.js';

const VERIFIED = '<span class="vcheck" title="Verified account">✓</span>';
const STICKY_KIND = PROJECTILE_KINDS.indexOf('sticky');
const BRIEFCASE = '<svg viewBox="0 0 30 26" aria-hidden="true"><rect x="2" y="7" width="26" height="17" rx="2" fill="#ece3cb" stroke="#2a2420" stroke-width="2"/><path d="M10 7V4h10v3" fill="none" stroke="#ece3cb" stroke-width="3"/><rect x="12" y="13" width="6" height="4" fill="#2a2420"/></svg>';
const CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="#ece3cb" stroke-width="2.4" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class Hud {
  constructor(app, root) {
    this.app = app;
    this.root = h('div', 'hud hidden');
    root.appendChild(this.root);
    this.chatOpen = false;
    this.roster = new Map();
    this.build();
  }

  build() {
    const r = this.root;
    r.innerHTML = `
      <div class="vignette"></div><div class="heal-vignette"></div><div class="focus-tint"></div><div class="cloak-tint"></div>
      <div class="scope hidden"><div class="charge"><i></i></div></div>
      <div class="hx-timer timer-box">${CLOCK}<b class="tm">8:00</b><span class="md"></span></div>
      <div class="hx-obj"></div>
      <div class="flagstrip hidden"></div>
      <div class="flagmarkers"></div>
      <div class="esp-layer"></div>
      <div class="netstat"></div>
      <div class="killfeed"></div>
      <div class="crosshair"></div>
      <div class="hitmarker"></div>
      <div class="dmg-ring"></div>
      <div class="dmg-layer"></div>
      <div class="notices"></div>
      <div class="bigtext"></div>
      <div class="killconfirm"></div>
      <div class="heal-target hidden"></div>
      <div class="preround hidden"></div>
      <div class="death plate hidden"></div>
      <div class="chatbox"></div>
      <div class="mobile-top hidden clickable"><button class="btn ghost m-score">Scores</button><button class="btn ghost m-class">Class</button><button class="btn ghost m-menu">Menu</button></div>
      <div class="hx-health">
        <div class="hx-portrait"><img class="cls-ic" alt=""></div>
        <div class="hx-cross"><div class="fill"></div><div class="lvl"><div class="shape"></div></div><div class="glow"></div><b class="hp-num">125</b></div>
        <div class="hx-fx status-fx"></div>
      </div>
      <div class="hx-slots slots"></div>
      <div class="hx-right">
        <div class="turret-status plate hidden"></div>
        <div class="hx-meter meter-wrap hidden"><span class="mlabel"></span><div class="bar"><i class="meter-fill"></i></div></div>
        <div class="hx-ability ability-plate"><div class="ring"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" fill="none" stroke="#171310" stroke-width="8"/><circle class="arc" cx="32" cy="32" r="27" fill="none" stroke="#ece3cb" stroke-width="8" stroke-dasharray="169.6" stroke-dashoffset="0"/></svg><div class="key">E</div></div><div><div class="nm"></div><div class="cd"></div></div></div>
        <div class="hx-ammo ammo-plate"><span class="rel reload-tag"></span><img class="wimg" alt=""><b class="clip ammo-num">--</b><span class="res"></span><span class="wn hidden"></span></div>
      </div>`;
    const q = (s) => r.querySelector(s);
    this.el = {
      s0: q('.s0'), s1: q('.s1'), tm: q('.tm'), md: q('.md'), timerBox: q('.timer-box'), flagstrip: q('.flagstrip'), flagmarkers: q('.flagmarkers'),
      netstat: q('.netstat'), killfeed: q('.killfeed'), xhair: q('.crosshair'), hit: q('.hitmarker'), ring: q('.dmg-ring'), dmg: q('.dmg-layer'),
      notices: q('.notices'), big: q('.bigtext'), kc: q('.killconfirm'), healT: q('.heal-target'), pre: q('.preround'), death: q('.death'),
      chat: q('.chatbox'), clsIc: q('.cls-ic'), hp: q('.hp-num'), hpBar: q('.hx-cross .lvl'), cross: q('.hx-cross'), fx: q('.status-fx'), ab: q('.ability-plate'), obj: q('.hx-obj'), res: q('.hx-ammo .res'),
      abArc: q('.ability-plate .arc'), abKey: q('.ability-plate .key'), abNm: q('.ability-plate .nm'), abCd: q('.ability-plate .cd'),
      ammo: q('.ammo-num'), wn: q('.wn'), wimg: q('.wimg'), rel: q('.reload-tag'), slots: q('.slots'), meterWrap: q('.meter-wrap'), meter: q('.meter-fill'), mlabel: q('.mlabel'),
      scope: q('.scope'), scopeCharge: q('.scope .charge i'), vig: q('.vignette'), healVig: q('.heal-vignette'), focus: q('.focus-tint'), cloakTint: q('.cloak-tint'), turret: q('.turret-status'), mobile: q('.mobile-top'),
    };
    this.el.mobile.querySelector('.m-score').addEventListener('click', () => this.showScoreboard(!this.sbVisible));
    this.el.mobile.querySelector('.m-class').addEventListener('click', () => this.app.ui.openClassMenu(true));
    this.el.mobile.querySelector('.m-menu').addEventListener('click', () => this.app.ui.openPause());
    this.buildCrosshair();
    this.scoreboard = h('div', 'scoreboard plate hidden');
    document.getElementById('ui').appendChild(this.scoreboard);
  }

  buildCrosshair() {
    const c = this.app.settings.crosshair;
    this.el.xhair.innerHTML = crosshairSVG(c, 0);
    this.crossCfg = JSON.stringify(c);
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
    if (!on) { this.scoreboard.classList.add('hidden'); this.sbVisible = false; }
    this.el.mobile.classList.toggle('hidden', !this.app.input.touchActive());
  }

  setup({ mode, map, room, isHost }) {
    this.mode = mode;
    this.map = map;
    this.room = room;
    this.isHost = isHost;
    this.el.md.textContent = MODES[mode].short;
    this.el.flagstrip.classList.add('hidden');
    const lim = MODES[mode].scoreLimit;
    const side = (t) => mode === 'ctf'
      ? `<div class="team t${t}"><b class="s${t}">0</b><div class="intel i${t}">${BRIEFCASE}<em></em></div></div>`
      : `<div class="team t${t}"><b class="s${t}">0</b><div class="bar"><i class="b${t}" style="width:0"></i></div></div>`;
    this.el.obj.innerHTML = `${side(0)}<span class="lim">of ${lim}</span>${side(1)}`;
    const q = (k) => this.el.obj.querySelector(k);
    Object.assign(this.el, { s0: q('.s0'), s1: q('.s1'), b0: q('.b0'), b1: q('.b1'), i0: q('.i0'), i1: q('.i1') });
    this.scoreLimit = lim;
    this.el.killfeed.innerHTML = '';
    this.el.death.classList.add('hidden');
    if (JSON.stringify(this.app.settings.crosshair) !== this.crossCfg) this.buildCrosshair();
    this.show(true);
  }

  setRoster(roster, myId) {
    this.roster = roster;
    this.myId = myId;
    if (this.sbVisible) this.renderScoreboard();
  }

  // Recon Sweep: a marker on every living enemy (true team, so disguised spies show), through walls.
  // Off-screen enemies get an arrow pinned to the screen edge.
  updateEsp(s, on) {
    const layer = this.root.querySelector('.esp-layer');
    if (!on || !s.rigs || !s.camera) { if (this.espOn) { layer.innerHTML = ''; this.espOn = false; } return; }
    this.espOn = true;
    const myTeam = s.me.team;
    const W = window.innerWidth, H = window.innerHeight;
    const cam = s.camera;
    const v = this.espV || (this.espV = new THREE.Vector3());
    const camPos = cam.position;
    let html = '';
    for (const [id, R] of s.rigs) {
      if (id === s.myId || !R.alive || R.realTeam === myTeam || !R.root.visible) continue;
      v.copy(R.root.position); v.y += 2.15;
      const dist = Math.round(v.distanceTo(camPos));
      v.project(cam);
      const behind = v.z > 1;
      let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      const off = behind || x < 30 || x > W - 30 || y < 30 || y > H - 30;
      if (off) {
        let dx = x - W / 2, dy = y - H / 2;
        if (behind) { dx = -dx; dy = -dy; }
        const k = Math.min((W / 2 - 40) / Math.abs(dx || 1), (H / 2 - 40) / Math.abs(dy || 1));
        x = W / 2 + dx * k; y = H / 2 + dy * k;
        const ang = Math.atan2(dy, dx) * 180 / Math.PI;
        html += `<div class="esp-arrow" style="transform:translate(${x.toFixed(0)}px,${y.toFixed(0)}px) rotate(${ang.toFixed(0)}deg)"></div>`;
      } else {
        const ent = s.roster.get(id);
        html += `<div class="esp-mark t${R.realTeam}" style="transform:translate(${x.toFixed(0)}px,${y.toFixed(0)}px)"><i></i><span>${esc(ent?.name || '')} · ${dist}m</span></div>`;
      }
    }
    layer.innerHTML = html;
  }

  // ---------------------------------------------------------------- per-frame
  update(s) {
    const el = this.el;
    const snap = s.snap;
    const me = s.me;
    if (!snap || !me) return;
    el.s0.textContent = snap.sc[0];
    el.s1.textContent = snap.sc[1];
    if (el.b0) { el.b0.style.width = `${Math.min(100, snap.sc[0] / this.scoreLimit * 100)}%`; el.b1.style.width = `${Math.min(100, snap.sc[1] / this.scoreLimit * 100)}%`; }
    if (el.i0 && snap.fl) for (const f of snap.fl) {
      const box = f[0] === 0 ? el.i0 : el.i1;
      const lbl = f[1] === FLAG_STATE.CARRIED ? 'Taken' : f[1] === FLAG_STATE.DROPPED || f[1] === FLAG_STATE.RETURNING ? 'Dropped' : 'Home';
      if (box.dataset.st !== lbl) { box.dataset.st = lbl; box.querySelector('em').textContent = lbl; box.classList.toggle('away', lbl !== 'Home'); }
    }
    el.tm.textContent = snap.ms === MATCH_STATE.PREROUND ? fmtTime(snap.pt) : snap.ms === MATCH_STATE.WARMUP ? '--:--' : fmtTime(snap.tl);
    el.timerBox.classList.toggle('ot', snap.ms === MATCH_STATE.OVERTIME);
    // preround countdown
    if (snap.ms === MATCH_STATE.PREROUND) { el.pre.classList.remove('hidden'); el.pre.textContent = Math.ceil(snap.pt); }
    else el.pre.classList.add('hidden');
    const cls = getClass(me.cls);
    // health
    if (this.lastCls !== `${me.cls}${me.team}`) {
      this.lastCls = `${me.cls}${me.team}`;
      el.clsIc.src = this.app.icons.portraits[`${me.cls}_${me.team}`] || '';
      el.abNm.textContent = cls.ability.name;
      el.abKey.textContent = 'E';
    }
    const hp = me.alive ? me.hp : 0;
    if (hp !== this.lastHp) {
      this.lastHp = hp;
      el.hp.textContent = hp;
      el.cross.classList.toggle('low', hp > 0 && hp <= me.mhp * 0.3);
      el.cross.classList.toggle('over', hp > me.mhp);
      el.hpBar.style.height = `${Math.min(100, hp / me.mhp * 100)}%`;
      el.vig.style.opacity = hp > 0 && hp <= me.mhp * 0.3 ? 0.6 : 0;
    }
    // status effects
    const myP = snap.p.find((p) => p[0] === s.myId);
    const flags = myP ? myP[7] : 0;
    const fx = [];
    if (flags & PF.BURNING) fx.push('<span class="burn">Burning</span>');
    if (flags & PF.HEALED) fx.push('<span class="heal">Healing</span>');
    if (flags & PF.OVERCHARGED) fx.push('<span class="oc">Overcharged</span>');
    if (flags & PF.REVEALED) fx.push('<span class="rev">Revealed</span>');
    if (flags & PF.SPAWN_PROTECT) fx.push('<span class="prot">Protected</span>');
    if (flags & PF.DISGUISED) fx.push('<span class="rev">Disguised</span>');
    if (flags & PF.CARRIER) fx.push('<span class="oc">Carrying flag</span>');
    if (flags & PF.CLOAKED) fx.push('<span class="rev">Cloaked</span>');
    if (me.sl > 0) fx.push(`<span class="burn">Slowed ${Math.ceil(me.sl)}s</span>`);
    if (me.ry > 0) fx.push(`<span class="heal">Rallied ${Math.ceil(me.ry)}s</span>`);
    const fxs = fx.join('');
    if (fxs !== this.lastFx) { this.lastFx = fxs; el.fx.innerHTML = fxs; }
    el.healVig.style.opacity = flags & PF.HEALED ? 1 : 0;
    el.cloakTint.style.opacity = flags & PF.CLOAKED ? 1 : 0;
    // ability
    const [cd, active, charge, isActive] = me.ab;
    const ab = cls.ability;
    let frac = 1, label = 'Ready';
    if (ab.id === 'overcharge') {
      frac = charge;
      label = isActive ? `${active.toFixed(1)}s` : `${Math.floor(charge * 100)}%`;
    } else if (isActive) { frac = ab.duration ? active / ab.duration : 1; label = `${active.toFixed(1)}s`; }
    else if (cd > 0) { const total = ab.cooldown || 10; frac = 1 - Math.min(1, cd / total); label = `${cd.toFixed(1)}s`; }
    if (ab.id === 'detcharge' && s.snap.ch && s.snap.ch.some((c) => c[0] === s.myId)) label = 'E: detonate';
    el.abArc.style.strokeDashoffset = String(169.6 * (1 - frac));
    el.abCd.textContent = label;
    el.ab.classList.toggle('ready', frac >= 1 && !isActive);
    el.ab.classList.toggle('active', !!isActive);
    el.ab.classList.toggle('hidden', ab.id === 'overcharge');
    el.focus.style.opacity = isActive && ab.id === 'esp' ? 1 : 0;
    this.updateEsp(s, !!isActive && ab.id === 'esp');
    el.focus.classList.toggle('rush', !!isActive && ab.id === 'adrenaline');
    if (isActive && ab.id === 'adrenaline') el.focus.style.opacity = 1;
    // weapon
    const w = s.weapon;
    if (w) {
      if (w.id !== this.lastW) {
        this.lastW = w.id;
        el.wn.textContent = w.def.name;
        el.wimg.src = this.app.icons.weapons[w.id] || '';
        el.slots.innerHTML = w.slots.map((x, i) => `<div data-i="${i}"><img src="${this.app.icons.weapons[x.id] || ''}" alt="">${esc(WEAPONS[x.id].name)}<b>${i + 1}</b></div>`).join('');
      }
      if (w.slot !== this.lastSlotShown) {
        this.lastSlotShown = w.slot;
        el.slots.classList.add('show');
        clearTimeout(this.slotT);
        this.slotT = setTimeout(() => el.slots.classList.remove('show'), 1600);
      }
      [...el.slots.children].forEach((d, i) => d.classList.toggle('on', i === w.slot));
      const melee = w.def.type === 'melee';
      const clipTxt = melee ? '' : w.def.clip < 0 ? '∞' : String(w.clip);
      const resTxt = melee || w.def.clip < 0 ? '' : String(w.reserve);
      if (clipTxt + '|' + resTxt !== this.lastAmmo) { this.lastAmmo = clipTxt + '|' + resTxt; el.ammo.textContent = clipTxt; el.res.textContent = resTxt; }
      el.ammo.style.display = melee ? 'none' : '';
      el.ammo.classList.toggle('empty', w.def.clip > 0 && w.clip === 0);
      el.rel.textContent = w.reloading ? 'Reloading' : (w.def.clip > 0 && w.clip === 0 && w.reserve === 0 ? 'No ammo' : '');
      // meters: spin / scope charge
      let meter = null;
      if (w.def.spinUp) meter = ['Spin', w.spin];
      if (w.def.scope && w.scoped) meter = ['Charge', w.charge];
      if (ab.id === 'overcharge') meter = [isActive ? 'Overcharge active' : charge >= 1 ? 'Overcharge ready · E' : 'Overcharge', charge];
      if (me.ck) meter = [me.ck[1] ? 'Cloaked · right-click to decloak' : me.ck[0] >= cls.cloak.minToCloak ? 'Cloak · right-click' : 'Cloak recharging', me.ck[0]];
      if (w.id === 'stickylauncher') { const n = snap.pr.filter((p) => p[8] === s.myId && p[1] === STICKY_KIND).length; meter = [`Stickies ${n}/8 · right-click detonates`, n / 8, true]; }
      el.meterWrap.classList.toggle('hidden', !meter);
      if (meter) { el.mlabel.textContent = meter[2] ? meter[0] : `${meter[0]} ${Math.floor(meter[1] * 100)}%`; el.meter.style.width = `${meter[1] * 100}%`; el.meterWrap.classList.toggle('full', meter[1] >= 1); }
      el.scopeCharge.style.width = `${w.charge * 100}%`;
      // dynamic crosshair spread
      if (this.app.settings.crosshair.dynamic) {
        const sp = Math.hypot(s.ms.vx, s.ms.vz);
        const spread = (w.def.spread || 0) + (w.def.spreadMove || 0) * Math.min(1, sp / 7) + (s.ms.grounded ? 0 : w.def.spreadAir || 0);
        const gapPx = Math.round(spread * 300);
        if (gapPx !== this.lastGap || w.def.crosshair !== this.lastCrossType) {
          this.lastGap = gapPx; this.lastCrossType = w.def.crosshair;
          el.xhair.innerHTML = crosshairSVG(this.app.settings.crosshair, gapPx, w.def.crosshair);
        }
      }
    }
    el.xhair.style.display = me.alive && !(w && w.scoped) ? '' : 'none';
    // turret status
    if (s.turret) {
      el.turret.classList.remove('hidden');
      el.turret.innerHTML = `Turret <b>${Math.max(0, s.turret.hp)}</b>/${s.turret.maxHp} HP · ${s.turret.ammo} rounds`;
    } else el.turret.classList.add('hidden');
    // death panel respawn timer
    if (!me.alive && this.deathShown) {
      const rs = el.death.querySelector('.rs');
      if (rs) rs.textContent = snap.ms === MATCH_STATE.ENDED ? '' : me.ra > 0 ? `Respawn in ${Math.ceil(me.ra)}` : MODES[this.app.game?.net.mode]?.duel ? 'Out for this round. You return when the next round starts.' : 'Respawning…';
      const nc = el.death.querySelector('.nc');
      if (nc) nc.textContent = me.ncls !== me.cls ? `Next life: ${getClass(me.ncls).displayName}` : '';
    }
    if (me.alive && this.deathShown) { this.deathShown = false; el.death.classList.add('hidden'); }
    // CTF strip + markers
    if (this.mode === 'ctf' && s.flags) this.updateFlags(s);
    // net stats
    const st = this.app.settings;
    if (st.showFps || st.showPing) {
      const parts = [];
      if (st.showFps) parts.push(`${this.app.fps | 0} fps`);
      if (st.showPing) parts.push(`${s.ping | 0} ms`);
      el.netstat.textContent = parts.join('  ');
    } else el.netstat.textContent = '';
    const touch = this.app.input.touchActive();
    this.el.mobile.classList.add('hidden');
    this.root.classList.toggle('touch', touch);
  }

  updateFlags(s) {
    const myTeam = s.me.team;
    const html = s.flags.map((f) => {
      const [team, state, , , , carrier, prog, drop] = f;
      const who = state === FLAG_STATE.CARRIED ? (this.roster.get(carrier)?.name || '?') : '';
      const txt = state === FLAG_STATE.CARRIED ? `Taken by ${esc(who)}` : state === FLAG_STATE.DROPPED ? `Dropped · ${drop}s` : state === FLAG_STATE.RETURNING ? `Returning ${Math.round(prog * 100)}%` : FLAG_STATE_NAMES[state].toLowerCase().replace(/^./, (c) => c.toUpperCase());
      const alert = team === myTeam && state !== FLAG_STATE.AT_BASE ? ' alert' : '';
      return `<div class="flagchip t${team}${alert}"><span class="fi"></span>${team === myTeam ? 'Your flag' : 'Enemy flag'}: ${txt}</div>`;
    }).join('');
    if (html !== this.lastFlagHtml) { this.lastFlagHtml = html; this.el.flagstrip.innerHTML = html; }
    // directional markers projected onto the screen (clamped to edges)
    const cam = s.camera;
    const W = window.innerWidth, H = window.innerHeight;
    let mk = '';
    const placed = [];
    for (const f of s.flags) {
      const [team, state, x, y, z, carrier] = f;
      if (carrier === s.myId) continue;
      const v = new THREE.Vector3(x, y + 2.4, z).project(cam);
      const behind = v.z > 1;
      let sx = (v.x + 1) / 2 * W, sy = (1 - v.y) / 2 * H;
      if (behind) { sx = W - sx; sy = H - 40; }
      sx = Math.max(40, Math.min(W - 40, sx)); sy = Math.max(90, Math.min(H - 60, sy));
      const d = Math.hypot(x - s.ms.x, z - s.ms.z) | 0;
      const label = team === s.me.team ? (state === FLAG_STATE.AT_BASE ? 'Defend' : 'Recover') : (state === FLAG_STATE.CARRIED ? 'Escort' : 'Steal');
      // stack markers that clamp onto the same screen spot
      for (const q of placed) if (Math.abs(q[0] - sx) < 70 && Math.abs(q[1] - sy) < 50) sy = q[1] + 56;
      placed.push([sx, sy]);
      mk += `<div class="flag-marker t${team}" style="left:${sx}px;top:${sy}px"><i></i>${label}<br>${d}m</div>`;
    }
    // own carrier: show where to bring it
    if (s.me.carry >= 0) {
      const base = s.map.flags[s.me.team];
      const v = new THREE.Vector3(base[0], base[1] + 2.4, base[2]).project(cam);
      let sx = (v.x + 1) / 2 * W, sy = (1 - v.y) / 2 * H;
      if (v.z > 1) { sx = W - sx; sy = H - 40; }
      sx = Math.max(40, Math.min(W - 40, sx)); sy = Math.max(90, Math.min(H - 60, sy));
      mk += `<div class="flag-marker t${s.me.team}" style="left:${sx}px;top:${sy}px"><i></i>Capture here</div>`;
    }
    this.el.flagmarkers.innerHTML = mk;
  }

  // ---------------------------------------------------------------- feedback
  hitmarker(kind) {
    const e = this.el.hit;
    e.className = `hitmarker ${kind === 'crit' ? 'crit' : kind === 'kill' ? 'kill' : ''}`;
    void e.offsetWidth;
    e.classList.add('show');
  }

  damageNumber(x, y, amt, crit, label) {
    const d = h('div', `dmg-num${crit ? ' crit' : ''}`, `${amt}${label ? `<em>${label}</em>` : ''}`);
    d.style.left = `${x + (Math.random() - 0.5) * 30}px`;
    d.style.top = `${y}px`;
    this.el.dmg.appendChild(d);
    setTimeout(() => d.remove(), 900);
  }

  healNumber(n) {
    const d = h('div', 'dmg-num', `+${n}`);
    d.style.color = '#7dd36a';
    d.style.left = '50%'; d.style.top = '62%';
    this.el.dmg.appendChild(d);
    setTimeout(() => d.remove(), 900);
  }

  damageTaken(amount, ang) {
    if (ang !== null && ang !== undefined) {
      const i = h('i');
      i.style.transform = `rotate(${-ang}rad)`;
      this.el.ring.appendChild(i);
      setTimeout(() => i.remove(), 1100);
    }
    this.el.vig.style.opacity = 0.7;
    clearTimeout(this.vigT);
    this.vigT = setTimeout(() => { this.lastHp = -1; }, 300);
  }

  killfeed(e) {
    const icons = this.app.icons;
    const name = (p) => p ? `<span class="t${p.team}">${esc(p.name)}</span>` : '';
    const wimg = icons.weapons[e.weaponId] ? `<img class="wpn" src="${icons.weapons[e.weaponId]}" alt="${esc(WEAPONS[e.weaponId]?.name)}" title="${esc(WEAPONS[e.weaponId]?.name)}">` : `<span class="plain">${esc(ABILITY_SOURCES[e.weaponId]?.name || e.weaponId)}</span>`;
    const tags = [(e.flags & 1) ? 'Headshot' : '', (e.flags & 4) ? 'Backstab' : '', (e.flags & 2) ? 'Crit' : ''].filter(Boolean).map((t) => `<span class="tag">${t}</span>`).join('');
    const html = e.killer
      ? `${name(e.killer)}${e.assister ? ` <span class="plain">+</span> ${name(e.assister)}` : ''} ${wimg}${tags} ${name(e.victim)}`
      : `${wimg} ${name(e.victim)}`;
    const d = h('div', `kf${e.involvesMe ? ' me' : ''}`, html);
    this.el.killfeed.appendChild(d);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.firstChild.remove();
    setTimeout(() => d.remove(), 7000);
  }

  killConfirm(name, flags, streak) {
    this.hitmarker('kill');
    this.el.kc.innerHTML = `<span class="x">✖</span> Eliminated ${esc(name)}${streak >= 2 ? ` · streak ${streak}` : ''}`;
    clearTimeout(this.kcT);
    this.kcT = setTimeout(() => { this.el.kc.innerHTML = ''; }, 1800);
  }

  notify(text, kind = 'info') {
    const d = h('div', `notice ${kind === 'short' ? '' : kind}`, esc(text));
    this.el.notices.appendChild(d);
    while (this.el.notices.children.length > 4) this.el.notices.firstChild.remove();
    setTimeout(() => d.remove(), kind === 'short' ? 2200 : 3800);
  }

  flagNotice(text, kind) { this.notify(text, kind); }

  bigText(a, b) {
    this.el.big.innerHTML = `<b>${esc(a)}</b><span>${esc(b || '')}</span>`;
    clearTimeout(this.bigT);
    this.bigT = setTimeout(() => { this.el.big.innerHTML = ''; }, 2600);
  }

  abilityFlash() {
    const e = this.el.ab;
    e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash');
  }

  setScope(on) { this.el.scope.classList.toggle('hidden', !on); }
  // Admin Gun charge meter under the crosshair (0..1; 0 hides it)
  setCharge(k) {
    if (!this.chargeEl) {
      this.chargeEl = document.createElement('div');
      this.chargeEl.className = 'ag-charge';
      this.chargeEl.innerHTML = '<i></i><span></span>';
      this.root.appendChild(this.chargeEl);
    }
    const on = k > 0.001;
    if (on !== this.chargeOn) { this.chargeOn = on; this.chargeEl.style.display = on ? '' : 'none'; }
    if (!on) return;
    this.chargeEl.firstChild.style.width = `${Math.round(k * 100)}%`;
    const txt = k >= 0.999 ? 'FIRE' : `${Math.round(k * 100)}%`;
    if (this.chargeEl.lastChild.textContent !== txt) this.chargeEl.lastChild.textContent = txt;
  }

  setHealTarget(rig, entry) {
    if (!rig || !entry) { this.el.healT.classList.add('hidden'); return; }
    const cls = getClass(entry.cls);
    const hp = rig.hp ?? 0;
    this.el.healT.classList.remove('hidden');
    this.el.healT.innerHTML = `Healing ${esc(entry.name)} · ${hp}/${cls.health}<div class="bar2"><i style="width:${Math.min(100, hp / cls.health * 100)}%"></i></div>`;
  }

  onSpawn() {
    this.deathShown = false;
    this.el.death.classList.add('hidden');
    this.lastHp = -1;
    this.lastW = null;
    this.setScope(false);
  }

  onDeath(info) {
    const el = this.el.death;
    this.deathShown = true;
    el.classList.remove('hidden');
    const icons = this.app.icons;
    let by = 'You were eliminated';
    if (info && info.killerName) {
      const w = WEAPONS[info.weaponId]?.name || ABILITY_SOURCES[info.weaponId]?.name || '';
      by = `${esc(info.killerName)} (${esc(getClass(info.killerClass).displayName)}) got you with the ${esc(w)}${info.killerHp ? ` · they have ${info.killerHp} HP left` : ''}`;
    } else if (info && info.weaponId) by = info.weaponId === 'fall' ? 'You fell too far' : info.weaponId === 'spawnshield' ? 'Enemy spawn shield' : 'Environmental elimination';
    if (info && info.killerName) {
      const kt = this.roster.get(info.killer)?.team ?? 0;
      const w = WEAPONS[info.weaponId]?.name || ABILITY_SOURCES[info.weaponId]?.name || '';
      el.innerHTML = `<div style="display:flex;gap:14px;align-items:center;text-align:left"><img src="${icons.portraits[`${info.killerClass}_${kt}`]}" style="width:84px;height:84px;image-rendering:pixelated;border-radius:6px;background:${kt ? '#3c6c96' : '#9c372f'}" alt=""><div><h3 style="font-size:18px;color:#cfc5ad">You were killed by</h3><div style="font:400 30px/1.05 var(--display);color:${kt ? '#a4cdf5' : '#ff9d8f'}">${esc(info.killerName)}</div><div class="small" style="margin-top:4px">${esc(getClass(info.killerClass).displayName)} · ${esc(w)}${info.killerHp ? ` · <b style="color:#efe6cf">${info.killerHp} HP left</b>` : ''}</div></div></div><div class="rs"></div><div class="small nc" style="margin-top:4px"></div><div class="hint">Press ${esc(keyName(this.app.settings.keys.classmenu))} to change class while you wait</div>`;
      this.setScope(false);
      return;
    }
    el.innerHTML = `<h3>Eliminated</h3>${info && info.killerClass ? `<img src="${icons.portraits[`${info.killerClass}_${this.roster.get(info.killer)?.team ?? 0}`]}" style="width:64px;height:64px;image-rendering:pixelated" alt="">` : ''}<div class="by">${by}</div><div class="rs"></div><div class="small nc" style="margin-top:4px"></div><div class="hint">Press ${esc(keyName(this.app.settings.keys.classmenu))} to change class while you wait</div>`;
    this.setScope(false);
  }

  matchState(st) {
    if (st === MATCH_STATE.PLAYING) this.el.pre.classList.add('hidden');
  }

  // ---------------------------------------------------------------- scoreboard
  showScoreboard(on) {
    this.sbVisible = on;
    this.scoreboard.classList.toggle('hidden', !on);
    if (on) this.renderScoreboard();
  }

  renderScoreboard() {
    const game = this.app.game;
    if (!game) return;
    const n = game.net;
    const players = [...this.roster.values()];
    const snap = n.latest;
    const icons = this.app.icons;
    const team = (t) => {
      const ps = players.filter((p) => p.team === t).sort((a, b) => b.s - a.s || b.k - a.k);
      const rows = ps.map((p) => `<tr class="${p.id === this.myId ? 'me' : ''} ${p.alive ? '' : 'dead'}"><td>${esc(p.name)}${p.v ? VERIFIED : ''}${p.bot ? '<span class="bot">BOT</span>' : ''}${p.host ? '<span class="bot">HOST</span>' : ''}</td><td><img src="${icons.portraits[`${p.cls}_${p.team}`] || ''}" alt="${esc(getClass(p.cls).displayName)}" title="${esc(getClass(p.cls).displayName)}"></td><td>${p.k}</td><td>${p.a}</td><td>${p.d}</td>${this.mode === 'ctf' ? `<td>${p.cap}</td>` : ''}<td>${p.s}</td><td>${p.bot ? '–' : p.ping}</td></tr>`).join('');
      const avg = ps.length ? Math.round(ps.reduce((s, p) => s + p.s, 0) / ps.length) : 0;
      return `<div class="sb-team t${t}"><div class="sb-title"><b>${snap ? snap.sc[t] : 0}</b><h3>${TEAM_NAMES[t]}</h3><span>${ps.length} players · avg score ${avg}</span></div><table><thead><tr><th>Player</th><th>Class</th><th>K</th><th>A</th><th>D</th>${this.mode === 'ctf' ? '<th>Caps</th>' : ''}<th>Score</th><th>Ping</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    };
    const meta = n.rosterMeta || {};
    this.scoreboard.innerHTML = `<div class="sb-head"><h2>${esc(this.room || 'Match')}</h2><span class="muted">${esc(getMap(meta.mapId || n.mapId).name)} · ${esc(MODES[n.mode].name)}</span></div><div class="sb-cols">${team(0)}${team(1)}</div><div class="sb-foot"><span>Score limit ${n.settings?.scoreLimit ?? ''}</span><span>Bots fill to ${meta.botFill ?? '?'}</span><span>${n.t.kind === 'p2p' ? 'Peer-to-peer (WebRTC)' : n.t.kind === 'ws' ? 'Dedicated server' : 'Hosting on this device'}</span></div>`;
  }

  // ---------------------------------------------------------------- chat
  // Big green "CRITICAL HIT!!!" over the target: pops in, floats up, fades.
  critPopup(x, y) {
    const d = h('div', 'crit-pop', 'CRITICAL<br>HIT!!!');
    d.style.left = `${x}px`; d.style.top = `${y}px`;
    this.el.dmg.appendChild(d);
    setTimeout(() => d.remove(), 1300);
  }

  chatMessage(m) {
    const d = h('div', 'chatline', `${m.teamOnly ? '(Team) ' : ''}<b class="t${m.team}">${esc(m.from)}</b>${m.v ? VERIFIED : ''}: ${esc(m.text)}`);
    this.el.chat.appendChild(d);
    while (this.el.chat.children.length > 8) this.el.chat.firstChild.remove();
  }

  openChat(team) {
    if (this.chatOpen) return;
    this.chatOpen = true;
    const inp = h('input', 'input chatinput');
    inp.placeholder = team ? 'Message your team…' : 'Message everyone…';
    inp.maxLength = 120;
    this.el.chat.appendChild(inp);
    this.el.chat.querySelectorAll('.chatline').forEach((c) => c.classList.add('open'));
    this.app.input.exitLock();
    setTimeout(() => inp.focus(), 10);
    const close = (relock = true) => {
      if (!this.chatOpen) return;
      this.chatOpen = false;
      inp.remove();
      this.el.chat.querySelectorAll('.chatline').forEach((c) => c.classList.remove('open'));
      if (relock && !this.app.input.touchActive()) this.app.input.requestLock();
    };
    // clicking back into the game (or anywhere else) closes the chat box; otherwise movement would
    // stay blocked while an unfocused, half-typed message sat on screen
    inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== inp) close(false); }, 0));
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const t = inp.value.trim(); if (t) this.app.game?.net.chat(t, team); close(); }
      else if (e.key === 'Escape') close();
    });
  }
}

export function keyName(code) {
  if (!code) return '?';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('Left', ' L').replace('Right', ' R');
}

export function crosshairSVG(c, extraGap = 0, type = 'cross') {
  const size = 40 * (c.size || 1);
  const half = size / 2;
  const gap = (c.gap ?? 4) + extraGap;
  const len = 7 * (c.size || 1);
  const t = c.thickness || 2;
  const col = c.color || '#7dff6a';
  const out = c.outline ? `stroke="#000" stroke-width="${t + 2}"` : '';
  const S = Math.max(size, (gap + len) * 2 + 8);
  const H = S / 2;
  let body = '';
  const line = (x1, y1, x2, y2) => `${c.outline ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${out} stroke-linecap="square"/>` : ''}<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${t}" stroke-linecap="square"/>`;
  const style = type === 'melee' ? 'dot' : type === 'shotgun' || type === 'circle' || type === 'flame' ? 'circle' : c.style;
  if (style === 'circle') {
    const r = Math.max(6, gap + 4);
    body += c.outline ? `<circle cx="${H}" cy="${H}" r="${r}" fill="none" stroke="#000" stroke-width="${t + 2}"/>` : '';
    body += `<circle cx="${H}" cy="${H}" r="${r}" fill="none" stroke="${col}" stroke-width="${t}"/>`;
  } else if (style !== 'dot') {
    body += line(H, H - gap - len, H, H - gap);
    if (style !== 'tee') body += line(H, H + gap, H, H + gap + len);
    body += line(H - gap - len, H, H - gap, H);
    body += line(H + gap, H, H + gap + len, H);
  }
  if (c.dot || style === 'dot') body += `<rect x="${H - t / 2 - (c.outline ? 1 : 0)}" y="${H - t / 2 - (c.outline ? 1 : 0)}" width="${t + (c.outline ? 2 : 0)}" height="${t + (c.outline ? 2 : 0)}" fill="#000"/><rect x="${H - t / 2}" y="${H - t / 2}" width="${t}" height="${t}" fill="${col}"/>`;
  void half; void MAP_IDS; void CLASSES;
  return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${body}</svg>`;
}
