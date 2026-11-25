// Mobile touch controls: floating movement joystick (left), drag-to-look area (right), and a set of
// repositionable / resizable action buttons. Includes an in-place layout editor.
import { BTN } from '../../shared/constants.js';
import { DEFAULT_MOBILE_LAYOUT, saveSettings } from '../settings.js';

const LABELS = { fire: 'FIRE', jump: 'JUMP', reload: 'R', ability: 'E', crouch: 'C', weapon: '⇄', alt: 'ALT', sprint: 'RUN' };

export class TouchControls {
  constructor(root, settings) {
    this.root = root;
    this.settings = settings;
    this.active = false;
    this.stick = { id: null, x: 0, y: 0, cx: 0, cy: 0 };
    this.look = { id: null, x: 0, y: 0 };
    this.held = new Set();
    this.lookDX = 0; this.lookDY = 0;
    this.actions = [];
    this.editing = false;
    this.sprintToggle = false;
    this.build();
  }

  build() {
    this.root.innerHTML = '';
    this.root.classList.add('touch-root');
    this.lookPad = el('div', 'touch-look');
    this.joy = el('div', 'touch-joy');
    this.knob = el('div', 'touch-knob');
    this.joy.appendChild(this.knob);
    this.root.append(this.lookPad, this.joy);
    this.buttons = {};
    for (const id of Object.keys(LABELS)) {
      const b = el('div', `touch-btn tb-${id}`);
      b.textContent = LABELS[id];
      b.dataset.id = id;
      this.buttons[id] = b;
      this.root.appendChild(b);
    }
    this.editBar = el('div', 'touch-editbar');
    this.editBar.innerHTML = '<span>Drag buttons to move · pinch slider to resize</span><input type="range" min="0.6" max="1.8" step="0.05" class="te-size"><button class="te-reset">Reset</button><button class="te-done">Done</button>';
    this.root.appendChild(this.editBar);
    this.applyLayout();
    this.attach();
  }

  applyLayout() {
    const L = this.settings.mobile.layout;
    const op = this.settings.mobile.opacity ?? 0.55;
    for (const [id, b] of Object.entries(this.buttons)) {
      const p = L[id] || DEFAULT_MOBILE_LAYOUT[id];
      const size = 64 * p.s;
      b.style.left = `calc(${p.x * 100}% - ${size / 2}px)`;
      b.style.top = `calc(${p.y * 100}% - ${size / 2}px)`;
      b.style.width = b.style.height = `${size}px`;
      b.style.opacity = op + 0.25;
    }
    const j = L.joystick || DEFAULT_MOBILE_LAYOUT.joystick;
    const js = 140 * j.s;
    this.joy.style.width = this.joy.style.height = `${js}px`;
    this.joy.style.left = `calc(${j.x * 100}% - ${js / 2}px)`;
    this.joy.style.top = `calc(${j.y * 100}% - ${js / 2}px)`;
    this.joy.style.opacity = op;
  }

  attach() {
    const opts = { passive: false };
    this.root.addEventListener('touchstart', (e) => this.onStart(e), opts);
    this.root.addEventListener('touchmove', (e) => this.onMove(e), opts);
    this.root.addEventListener('touchend', (e) => this.onEnd(e), opts);
    this.root.addEventListener('touchcancel', (e) => this.onEnd(e), opts);
    this.editBar.querySelector('.te-done').addEventListener('click', () => this.setEditing(false));
    this.editBar.querySelector('.te-reset').addEventListener('click', () => { this.settings.mobile.layout = structuredClone(DEFAULT_MOBILE_LAYOUT); saveSettings(this.settings); this.applyLayout(); });
    this.editBar.querySelector('.te-size').addEventListener('input', (e) => {
      if (!this.selected) return;
      const L = this.settings.mobile.layout;
      L[this.selected] = { ...L[this.selected], s: +e.target.value };
      saveSettings(this.settings);
      this.applyLayout();
    });
  }

  setActive(on) {
    this.active = on;
    this.root.style.display = on ? 'block' : 'none';
  }

  setEditing(on) {
    this.editing = on;
    this.root.classList.toggle('editing', on);
    if (on) this.setActive(true);
  }

  onStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const target = document.elementFromPoint(t.clientX, t.clientY);
      const btn = target && target.closest && target.closest('.touch-btn');
      const W = window.innerWidth, H = window.innerHeight;
      if (this.editing) {
        const id = btn ? btn.dataset.id : (target === this.joy || target === this.knob ? 'joystick' : null);
        if (id) {
          this.drag = { id, t: t.identifier };
          this.selected = id;
          const L = this.settings.mobile.layout;
          this.editBar.querySelector('.te-size').value = (L[id] || DEFAULT_MOBILE_LAYOUT[id]).s;
          for (const b of Object.values(this.buttons)) b.classList.toggle('sel', b.dataset.id === id);
        }
        continue;
      }
      if (btn) {
        const id = btn.dataset.id;
        btn.classList.add('down');
        btn.dataset.touch = t.identifier;
        this.held.add(id);
        if (id === 'weapon') this.actions.push({ type: 'cycle', dir: 1 });
        if (id === 'sprint') this.sprintToggle = !this.sprintToggle;
        // fire button doubles as a look pad
        if (id === 'fire' && this.look.id === null) { this.look = { id: t.identifier, x: t.clientX, y: t.clientY }; }
        continue;
      }
      if (t.clientX < W * 0.42 && this.stick.id === null) {
        this.stick = { id: t.identifier, cx: t.clientX, cy: t.clientY, x: 0, y: 0 };
        const r = this.joy.getBoundingClientRect();
        this.joy.style.left = `${t.clientX - r.width / 2}px`;
        this.joy.style.top = `${t.clientY - r.height / 2}px`;
        this.joy.classList.add('live');
      } else if (this.look.id === null) {
        this.look = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
      void H;
    }
  }

  onMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.editing && this.drag && this.drag.t === t.identifier) {
        const L = this.settings.mobile.layout;
        const id = this.drag.id;
        L[id] = { ...(L[id] || DEFAULT_MOBILE_LAYOUT[id]), x: t.clientX / window.innerWidth, y: t.clientY / window.innerHeight };
        this.applyLayout();
        continue;
      }
      if (t.identifier === this.stick.id) {
        const r = this.joy.getBoundingClientRect().width / 2;
        let dx = t.clientX - this.stick.cx, dy = t.clientY - this.stick.cy;
        const l = Math.hypot(dx, dy);
        if (l > r) { dx *= r / l; dy *= r / l; }
        this.stick.x = dx / r; this.stick.y = dy / r;
        this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      }
      if (t.identifier === this.look.id) {
        const s = 2.2 * (this.settings.mobile.lookSens || 1);
        this.lookDX += (t.clientX - this.look.x) * s;
        this.lookDY += (t.clientY - this.look.y) * s;
        this.look.x = t.clientX; this.look.y = t.clientY;
      }
    }
  }

  onEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.drag && this.drag.t === t.identifier) { saveSettings(this.settings); this.drag = null; }
      if (t.identifier === this.stick.id) {
        this.stick = { id: null, x: 0, y: 0, cx: 0, cy: 0 };
        this.knob.style.transform = '';
        this.joy.classList.remove('live');
        this.applyLayout();
      }
      if (t.identifier === this.look.id) this.look = { id: null, x: 0, y: 0 };
      for (const b of Object.values(this.buttons)) {
        if (b.dataset.touch === String(t.identifier)) { b.classList.remove('down'); this.held.delete(b.dataset.id); b.dataset.touch = ''; }
      }
    }
  }

  sample() {
    let b = 0;
    const js = this.settings.mobile.joySens || 1;
    const x = this.stick.x * js, y = this.stick.y * js;
    if (y < -0.3) b |= BTN.FORWARD;
    if (y > 0.3) b |= BTN.BACK;
    if (x < -0.3) b |= BTN.LEFT;
    if (x > 0.3) b |= BTN.RIGHT;
    if (y < -0.92 || this.sprintToggle) b |= BTN.SPRINT;
    if (this.held.has('fire')) b |= BTN.FIRE;
    if (this.held.has('jump')) b |= BTN.JUMP;
    if (this.held.has('reload')) b |= BTN.RELOAD;
    if (this.held.has('ability')) b |= BTN.ABILITY;
    if (this.held.has('crouch')) b |= BTN.CROUCH;
    if (this.held.has('alt')) b |= BTN.ALT;
    const out = { buttons: b, lookDX: this.lookDX, lookDY: this.lookDY, actions: this.actions };
    this.lookDX = 0; this.lookDY = 0; this.actions = [];
    return out;
  }
}

function el(tag, cls) { const e = document.createElement(tag); e.className = cls; return e; }
