// Pixel Fortress client entry point: boot, main loop, session management (host / join / dedicated).
import { Renderer } from './render/Renderer.js';
import { AudioEngine } from './audio/Audio.js';
import { Input } from './input/Input.js';
import { TouchControls } from './input/TouchControls.js';
import { UI } from './ui/UI.js';
import { Game } from './Game.js';
import { Profile } from './progression/Profile.js';
import { loadSettings, saveSettings, resolveQuality, isTouchDevice } from './settings.js';
import { HostSession, PeerClient } from './net/transports.js';
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
    return { name: this.profile.name || 'Recruit', classId: this.profile.data.selectedClass, loadouts: this.profile.loadoutsPayload(), weapons: this.profile.weaponsPayload(), token };
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

  async startHost({ mode, mapId, online, public: isPublic, roomName }) {
    this.ui.closeSheet();
    this.ui.showLoading(online ? 'Opening your room' : 'Starting practice', online ? 'Registering with the WebRTC relay…' : 'Spinning up the local server…');
    const host = new HostSession({
      online, public: isPublic,
      game: { mapId, mode, botFill: this.settings.botFill, botDifficulty: this.settings.botDifficulty, maxPlayers: 12, roomName: roomName || `${this.profile.name || 'Recruit'}'s fortress` },
    });
    host.onStatus = (s) => {
      if (s.error) this.ui.toast(`Online hosting unavailable: ${s.error}. You can still play with bots.`, 8000);
      if (s.code) this.ui.toast(`Room code <b>${s.code}</b>${s.publicSlot !== undefined ? ' · listed publicly' : ''}`, 9000);
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
  }

  async joinServer(ws, req) {
    const res = await ws.request({ t: 'lobby', ...req }, ['joined', 'error']);
    if (res.t === 'error') throw new Error(res.reason);
    this.ui.closeSheet();
    this.beginGame(ws, { label: res.info?.room || 'Dedicated server' });
  }

  leaveMatch() {
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
