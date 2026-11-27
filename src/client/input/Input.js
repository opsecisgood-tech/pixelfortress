// Desktop input: rebindable keyboard, pointer-locked mouse look, mouse buttons and wheel.
// Produces the same abstract state (buttons bitmask + look deltas + actions) as touch controls.
import { BTN } from '../../shared/constants.js';

export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.keys = new Set();
    this.mouse = 0;
    this.lookDX = 0;
    this.lookDY = 0;
    this.frameDX = 0;
    this.frameDY = 0;
    this.actions = [];
    this.enabled = false;
    this.locked = false;
    this.touch = null;     // TouchControls instance
    this.onUnlock = () => {};
    this.bind();
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
      const k = this.settings.keys;
      if (this.enabled && (e.code === k.scoreboard || e.code === 'Space' || e.code === 'Tab')) e.preventDefault();
      if (this.keys.has(e.code)) return;
      this.keys.add(e.code);
      if (!this.enabled) return;
      if (e.code === k.primary) this.actions.push({ type: 'slot', slot: 0 });
      else if (e.code === k.secondary) this.actions.push({ type: 'slot', slot: 1 });
      else if (e.code === k.melee) this.actions.push({ type: 'slot', slot: 2 });
      else if (e.code === k.lastweapon) this.actions.push({ type: 'lastslot' });
      else if (e.code === k.scoreboard) this.actions.push({ type: 'scoreboard', on: true });
      else if (e.code === k.classmenu) this.actions.push({ type: 'classmenu' });
      else if (e.code === k.chat) { e.preventDefault(); this.actions.push({ type: 'chat', team: false }); }
      else if (e.code === k.teamchat) { e.preventDefault(); this.actions.push({ type: 'chat', team: true }); }
      else if (e.code === 'Comma') this.actions.push({ type: 'teammenu' });
      // Soul-Stealer minions: K back, L forward, J free
      else if (e.code === (k.minionPrev || 'KeyK')) this.actions.push({ type: 'minion', a: 'prev' });
      else if (e.code === (k.minionNext || 'KeyL')) this.actions.push({ type: 'minion', a: 'next' });
      else if (e.code === (k.minionFree || 'KeyJ')) this.actions.push({ type: 'minion', a: 'free' });
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (this.enabled && e.code === this.settings.keys.scoreboard) this.actions.push({ type: 'scoreboard', on: false });
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse = 0; });
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && !this.touchActive()) { this.requestLock(); return; }
      this.mouse |= 1 << e.button;
    });
    window.addEventListener('mouseup', (e) => { this.mouse &= ~(1 << e.button); });
    window.addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });
    window.addEventListener('wheel', (e) => {
      if (!this.enabled || !this.locked) return;
      this.actions.push({ type: 'cycle', dir: e.deltaY > 0 ? 1 : -1 });
    }, { passive: true });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // clamp absurd spikes some browsers produce on lock
      const dx = Math.max(-300, Math.min(300, e.movementX || 0));
      const dy = Math.max(-300, Math.min(300, e.movementY || 0));
      this.lookDX += dx; this.lookDY += dy;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.mouse = 0; this.onUnlock(); }
    });
  }

  touchActive() { return !!(this.touch && this.touch.active); }

  requestLock() {
    if (this.touchActive()) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch { /* ignore */ } });
    } catch { try { this.canvas.requestPointerLock(); } catch { /* ignore */ } }
  }

  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  // Build the per-frame input state.
  sample() {
    const k = this.settings.keys;
    const has = (c) => this.keys.has(c);
    let b = 0;
    if (this.enabled) {
      if (has(k.forward) || has('ArrowUp')) b |= BTN.FORWARD;
      if (has(k.back) || has('ArrowDown')) b |= BTN.BACK;
      if (has(k.left) || has('ArrowLeft')) b |= BTN.LEFT;
      if (has(k.right) || has('ArrowRight')) b |= BTN.RIGHT;
      if (has(k.jump)) b |= BTN.JUMP;
      if (has(k.sprint) || has('ShiftRight')) b |= BTN.SPRINT;
      if (has(k.crouch) || has('ControlLeft')) b |= BTN.CROUCH;
      if (has(k.reload)) b |= BTN.RELOAD;
      if (has(k.ability)) b |= BTN.ABILITY;
      if (this.locked) {
        if (this.mouse & 1) b |= BTN.FIRE;
        if (this.mouse & 4) b |= BTN.ALT;
      }
    }
    let dx = this.lookDX, dy = this.lookDY;
    this.lookDX = 0; this.lookDY = 0;
    if (this.touch && this.touch.active) {
      const t = this.touch.sample();
      b |= t.buttons;
      dx += t.lookDX; dy += t.lookDY;
      for (const a of t.actions) this.actions.push(a);
    }
    this.frameDX = dx; this.frameDY = dy;
    const actions = this.actions;
    this.actions = [];
    return { buttons: b, lookDX: dx, lookDY: dy, actions };
  }
}
