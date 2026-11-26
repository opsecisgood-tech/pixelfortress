// Pixel Fortress client entry point: boot, main loop, session management (host / join / dedicated).
import { Renderer } from './render/Renderer.js';
import { AudioEngine } from './audio/Audio.js';
import { Input } from './input/Input.js';
import { TouchControls } from './input/TouchControls.js';
import { UI } from './ui/UI.js';
import { Game } from './Game.js';
import { Profile } from './progression/Profile.js';
import { Auth } from './auth/Auth.js';
import { loadSettings, saveSettings, resolveQuality, isTouchDevice } from './settings.js';
import { HostSession, PeerClient, WSClient, defaultServerUrl } from './net/transports.js';
import { Social } from './social/Social.js';
import { MODES } from '../shared/config/modes.js';
import { validateClasses } from '../shared/config/classes.js';
import { WEAPONS, validateWeapons } from '../shared/config/weapons.js';

const bootBar = document.querySelector('.boot-bar i');
const bootMsg = document.querySelector('.boot-msg');
const step = (pct, msg) => { if (bootBar) bootBar.style.width = `${pct}%`; if (bootMsg && msg) bootMsg.textContent = msg; };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

class App {
  constructor() {
    this.state = 'boot';
    this.game = null;
    this.host = null;
    this.fps = 60;
  }

  async boot() {
    step(10, 'Loading settings…');
    const errs = [...validateClasses(WEAPONS), ...validateWeapons()];
    if (errs.length) console.warn('Config validation:', errs);
    this.settings = loadSettings();
    this.profile = new Profile();
    this.auth = new Auth(this);
    this.social = new Social(this);
    if (this.profile.name && !this.settings.name) this.settings.name = this.profile.name;
    this.isTouch = isTouchDevice();
    const canvas = document.getElementById('view');
    step(25, 'Starting renderer…');
    await nextFrame();
    try {
      this.renderer = new Renderer(canvas, resolveQuality(this.settings));
    } catch (e) {
      bootMsg.textContent = 'WebGL is not available in this browser. Pixel Fortress needs WebGL to run.';
      throw e;
    }
    this.audio = new AudioEngine(this.settings);
    this.input = new Input(canvas, this.settings);
    this.touch = new TouchControls(document.getElementById('touch'), this.settings);
    this.input.touch = this.touch;
    this.touch.setActive(false);
    this.input.onUnlock = () => {
      if (this.state === 'game' && !this.ui.menuOpen && !this.ui.hud.chatOpen && !this.touch.active && !this.ui.resultsEl) this.ui.openPause();
    };
    step(45, 'Painting class portraits…');
    await nextFrame();
    this.icons = this.renderer.generateIcons();
    step(80, 'Building interface…');
    await nextFrame();
    this.ui = new UI(this);
    // unlock audio on first gesture
    const unlock = () => { this.audio.init(); if (this.state === 'menu') this.audio.startMusic('menu'); };
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'game' && !this.ui.menuOpen && !this.ui.hud.chatOpen && this.touch.active) this.ui.openPause();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.input.keys.clear(); });
    this.state = 'menu';
    this.ui.showMainMenu();
    step(100, 'Ready');
    document.getElementById('boot').classList.add('done');
    setTimeout(() => document.getElementById('boot')?.remove(), 600);
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    // dev hook for automated tests
    window.__pf = this;
  }

  loop(t) {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    if (dt > 0) this.fps = this.fps * 0.95 + (1 / dt) * 0.05;
    try {
      if (this.game && (this.state === 'game' || this.state === 'loading')) {
        this.game.frame(dt);
        if (!this.game.map) this.renderer.renderMenu(dt);
      } else if (this.state === 'results' && this.game) {
        this.game.frame(dt); // keep networking alive
        this.renderer.renderMenu(dt);
      } else {
        this.renderer.renderMenu(dt);
      }
    } catch (e) {
      console.error(e);
    }
    requestAnimationFrame((tt) => this.loop(tt));
  }

  applySettings() {
    const q = resolveQuality(this.settings);
    const changed = JSON.stringify(q) !== JSON.stringify(this.renderer.quality);
    this.renderer.setQuality(q);
    this.audio.applyVolumes();
    this.touch.applyLayout();
    if (this.state === 'game') this.updateTouchMode();
    if (changed && this.game && this.game.map) {
      // rebuild map visuals with the new quality
      this.game.mapRenderer.dispose();
      this.game.mapRenderer = new (this.game.mapRenderer.constructor)(this.renderer.scene, q).build(this.game.map);
    }
  }

  updateTouchMode() {
    const on = this.isTouch || this.settings.forceTouch;
    this.touch.setActive(on && this.state === 'game');
  }

  hello() {
    let token = null;
    try { token = sessionStorage.getItem('pf_token'); } catch { /* ignore */ }
    const idToken = this.auth?.user ? this.auth.idToken || undefined : undefined;
    return { idToken, name: this.profile.name || 'Recruit', classId: this.profile.data.selectedClass, loadouts: this.profile.loadoutsPayload(), weapons: this.profile.weaponsPayload(), token, group: this.social?.partyId || undefined };
  }

  beginGame(transport, meta) {
    this.audio.init();
    this.ui.showLoading('Deploying', meta.label || 'Connecting to match');
    this.state = 'loading';
    this.game = new Game(this, transport, this.hello(), meta);
    this.input.enabled = true;
    this.updateTouchMode();
  }

  onGameReady() {
    this.updateTouchMode();
    this.ui.hud.show(true);
    if (!this.touch.active) this.input.requestLock();
  }

  async startHost({ mode, mapId, online, public: isPublic, roomName, botFill, onCode }) {
    this.ui.closeSheet();
    this.ui.showLoading(online ? 'Opening your room' : 'Starting practice', online ? 'Registering with the WebRTC relay…' : 'Spinning up the local server…');
    const host = new HostSession({
      online, public: isPublic,
      game: { mapId, mode, botFill: botFill ?? this.settings.botFill, botDifficulty: this.settings.botDifficulty, maxPlayers: 12, roomName: roomName || `${this.profile.name || 'Recruit'}'s fortress` },
    });
    let announced = false;
    host.onStatus = (s) => {
      if (s.error) this.ui.toast(`Online hosting unavailable: ${s.error}. You can still play with bots.`, 8000);
      if (s.code) this.ui.toast(`Room code <b>${s.code}</b>${s.publicSlot !== undefined ? ' · listed publicly' : ''}`, 9000);
      if (s.code && !announced) { announced = true; this.onJoined({ kind: 'p2p', code: s.code, mode }); onCode?.(s.code); }
    };
    try {
      await host.start();
    } catch (e) {
      this.ui.hideLoading();
      this.ui.toast(`Could not start the server: ${e.message || e}`);
      return;
    }
    this.host = host;
    this.beginGame(host.connectLocal(), { label: online ? 'Hosting' : 'Practice' });
  }

  async joinPeer(code) {
    const c = new PeerClient();
    await c.connect(code);
    this.ui.closeSheet();
    this.beginGame(c, { label: `Room ${code}` });
    this.onJoined({ kind: 'p2p', code });
  }

  async joinServer(ws, req) {
    const res = await ws.request({ t: 'lobby', ...req }, ['joined', 'error']);
    if (res.t === 'error') throw new Error(res.reason);
    this.ui.closeSheet();
    this.beginGame(ws, { label: res.info?.room || 'Dedicated server' });
    this.onJoined({ kind: 'ws', server: ws.url, room: res.room, mode: res.info?.mode, private: !!req.private });
    return res;
  }

  // ---------------------------------------------------------------- friends & parties
  // Where friends can find me, and where my party should follow.
  onJoined(join) {
    this.currentJoin = join;
    this.social.setPresence('game', join.private ? null : join);
    this.social.partyGo(join);
  }

  // The dedicated server address, if one is configured (the GitHub Pages site has none of its own).
  serverUrl() {
    if (this.settings.serverUrl) return this.settings.serverUrl;
    if (/github\.io$/.test(location.hostname) || location.protocol === 'file:') return null;
    return defaultServerUrl();
  }

  // Join a match from a friend / party / challenge description { kind: 'p2p', code } | { kind: 'ws', server, room }.
  async joinFromInfo(join) {
    if (this.game) this.leaveMatch();
    if (join.kind === 'p2p') return this.joinPeer(join.code);
    const ws = new WSClient(join.server);
    await ws.open();
    try { return await this.joinServer(ws, { action: 'join', room: join.room }); } catch (e) { ws.close(); throw e; }
  }

  // Start a 1v1 / 2v2 (or any mode) for me and my party: the dedicated server's matchmaking when one is
  // configured, otherwise a peer-to-peer room hosted in this browser that the party joins by code.
  async queueMode(mode) {
    if (this.game) this.leaveMatch();
    const url = this.serverUrl();
    if (url) {
      const ws = new WSClient(url);
      try {
        await ws.open();
        return await this.joinServer(ws, { action: 'quick', mode, party: this.social.partySize() });
      } catch (e) { ws.close(); this.ui.toast(`Dedicated server unavailable (${e.message || e}). Hosting the match in your browser instead.`, 7000); }
    }
    const duel = MODES[mode]?.duel;
    return this.startHost({ mode, online: true, public: !this.social.party, roomName: `${this.profile.name || 'Recruit'}'s ${MODES[mode]?.short || ''}`.trim(), botFill: duel ? MODES[mode].maxPlayers : undefined });
  }

  // Challenge a friend to a 1v1: open a private duel room, join it, and send them the invite.
  async challengeFriend(uid, name, mode = 'duel1') {
    if (this.game) this.leaveMatch();
    const url = this.serverUrl();
    if (url) {
      const ws = new WSClient(url);
      try {
        await ws.open();
        const res = await this.joinServer(ws, { action: 'create', mode, private: true, name: `${this.profile.name} vs ${name}` });
        await this.social.challenge(uid, { kind: 'ws', server: url, room: res.room, mode });
        this.ui.toast(`Challenge sent to <b>${name}</b>. The duel starts when they join.`, 7000);
        return;
      } catch (e) { ws.close(); this.ui.toast(`Dedicated server unavailable (${e.message || e}). Hosting the duel in your browser instead.`, 7000); }
    }
    await this.startHost({
      mode, online: true, public: false, botFill: 0, roomName: `${this.profile.name} vs ${name}`,
      onCode: (code) => this.social.challenge(uid, { kind: 'p2p', code, mode }).then(() => this.ui.toast(`Challenge sent to <b>${name}</b>. The duel starts when they join.`, 7000)),
    });
  }

  leaveMatch() {
    this.currentJoin = null;
    this.social?.setPresence('menu', null);
    if (this.game) { this.game.dispose(); this.game = null; }
    if (this.host) { this.host.stop(); this.host = null; }
    this.input.enabled = false;
    this.input.exitLock();
    this.touch.setActive(false);
    this.ui.hideLoading();
    this.ui.hideResults();
    this.ui.closeSheet();
    this.ui.hud.show(false);
    this.state = 'menu';
    this.ui.showMainMenu();
  }

  onSessionError(reason) {
    if (!this.game) return;
    const g = this.game;
    this.leaveMatch();
    this.ui.toast(`Left match: ${String(reason || 'connection lost')}`, 7000);
    void g;
  }
}

const app = new App();
app.boot().catch((e) => { console.error(e); const m = document.querySelector('.boot-msg'); if (m) m.textContent = `Failed to start: ${e.message || e}`; });
saveSettings; // eslint-disable-line no-unused-expressions
