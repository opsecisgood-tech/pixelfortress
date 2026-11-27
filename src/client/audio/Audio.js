// Procedural audio engine. Every sound in Pixel Fortress is synthesized at runtime with WebAudio
// (original sound identity, zero external assets): weapons, footsteps, voices, abilities, objectives,
// UI, map ambience and a chiptune music sequencer. 3D sounds use HRTF panners with distance attenuation;
// interiors add a reverb send.

const WEAPON_SOUNDS = {
  scattershot: { kind: 'shotgun', f: 900, dur: 0.32, thump: 70, vol: 1.0 },
  breacher: { kind: 'shotgun', f: 700, dur: 0.38, thump: 60, vol: 1.05 },
  sidekick: { kind: 'pistol', f: 2200, dur: 0.12, thump: 140, vol: 0.7 },
  silencedpistol: { kind: 'silenced', f: 1400, dur: 0.1, thump: 0, vol: 0.45 },
  revolver: { kind: 'pistol', f: 1500, dur: 0.28, thump: 90, vol: 1.0 },
  longshot: { kind: 'sniper', f: 2600, dur: 0.6, thump: 60, vol: 1.15 },
  compactsmg: { kind: 'pistol', f: 2800, dur: 0.07, thump: 160, vol: 0.55 },
  rivetgun: { kind: 'pneumatic', f: 1800, dur: 0.07, thump: 0, vol: 0.5 },
  constructor: { kind: 'zap', f: 900, dur: 0.08, vol: 0.35 },
  syringelauncher: { kind: 'pneumatic', f: 1200, dur: 0.06, thump: 0, vol: 0.45 },
  medbeam: { kind: 'none' },
  cyclone: { kind: 'rotary', f: 1900, dur: 0.06, thump: 110, vol: 0.55 },
  thermal: { kind: 'none' },
  flarelauncher: { kind: 'launcher', f: 600, dur: 0.3, thump: 200, vol: 0.8 },
  blastcaster: { kind: 'launcher', f: 380, dur: 0.45, thump: 80, vol: 1.0 },
  chargelauncher: { kind: 'launcher', f: 500, dur: 0.3, thump: 120, vol: 0.85 },
  skyhopper: { kind: 'launcher', f: 520, dur: 0.35, thump: 100, vol: 0.85 },
  stickylauncher: { kind: 'launcher', f: 420, dur: 0.28, thump: 140, vol: 0.8 },
  sapper: { kind: 'zap', f: 1400, dur: 0.06, vol: 0.3 },
  // alternates
  kickback: { kind: 'shotgun', f: 800, dur: 0.36, thump: 60, vol: 1.1 },
  peashooter: { kind: 'pistol', f: 2600, dur: 0.09, thump: 170, vol: 0.55 },
  derringer: { kind: 'pistol', f: 1300, dur: 0.22, thump: 80, vol: 0.9 },
  longsix: { kind: 'pistol', f: 1250, dur: 0.34, thump: 70, vol: 1.05 },
  longbow: { kind: 'pneumatic', f: 500, dur: 0.12, thump: 0, vol: 0.5 },
  scrubcarbine: { kind: 'pistol', f: 2300, dur: 0.09, thump: 140, vol: 0.65 },
  pumpgun: { kind: 'shotgun', f: 750, dur: 0.36, thump: 62, vol: 1.05 },
  crossbow: { kind: 'pneumatic', f: 700, dur: 0.1, thump: 0, vol: 0.55 },
  rapidmender: { kind: 'none' },
  brassthunder: { kind: 'rotary', f: 1500, dur: 0.07, thump: 95, vol: 0.62 },
  slugthrower: { kind: 'shotgun', f: 600, dur: 0.4, thump: 55, vol: 1.1 },
  backdraft: { kind: 'none' },
  pinpoint: { kind: 'launcher', f: 450, dur: 0.38, thump: 90, vol: 1.0 },
  trenchmortar: { kind: 'launcher', f: 320, dur: 0.4, thump: 70, vol: 1.0 },
};

const SURFACE = {
  metal: ['metalfloor', 'grate', 'metalstair', 'metal', 'darkmetal', 'steel', 'flatcar', 'conveyor', 'rustmetal', 'diamondplate'],
  wood: ['woodplank', 'crate', 'plank', 'pallet', 'woodfloor', 'woodwall'],
  soft: ['sand', 'snow', 'grass', 'dirt', 'moss', 'carpet'],
};

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.loops = new Map();
    this.musicOn = false;
    this.interior = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.connect(this.master);
    this.ui = ctx.createGain(); this.ui.connect(this.master);
    this.amb = ctx.createGain(); this.amb.connect(this.master);
    // reverb send for interiors
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(1.1, 2.6);
    this.verbSend = ctx.createGain(); this.verbSend.gain.value = 0;
    this.verbSend.connect(this.verb); this.verb.connect(this.master);
    this.noiseBuf = this.makeNoise(2);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.masterVolume;
    this.sfx.gain.value = s.effectsVolume;
    this.music.gain.value = s.musicVolume * 0.5;
    this.ui.gain.value = s.effectsVolume * 0.7;
    this.amb.gain.value = s.effectsVolume * 0.5;
  }

  makeNoise(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  impulse(sec, decay) {
    const len = this.ctx.sampleRate * sec;
    const b = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }

  // Listener follows the camera
  setListener(pos, fwd) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(pos.x, t, 0.02); L.positionY.setTargetAtTime(pos.y, t, 0.02); L.positionZ.setTargetAtTime(pos.z, t, 0.02);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.02); L.forwardY.setTargetAtTime(fwd.y, t, 0.02); L.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
  }

  setInterior(v) {
    if (!this.ctx) return;
    this.interior = v;
    this.verbSend.gain.setTargetAtTime(v ? 0.22 : 0.03, this.ctx.currentTime, 0.3);
  }

  // Output node for a sound: positional panner or plain gain.
  out(pos, vol = 1, bus = this.sfx) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = vol;
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = this.settings.hrtf === false ? 'equalpower' : 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 3; p.maxDistance = 120; p.rolloffFactor = 1.15;
      if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; } else p.setPosition(pos[0], pos[1], pos[2]);
      g.connect(p); p.connect(bus);
      g._panner = p;
      if (this.interior) p.connect(this.verbSend);
    } else {
      g.connect(bus);
      g.connect(this.verbSend);
    }
    return g;
  }

  noise(dest, t, dur, { type = 'bandpass', f = 1000, q = 1, f2 = null, vol = 1, attack = 0.002 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loopStart = Math.random();
    const flt = ctx.createBiquadFilter();
    flt.type = type; flt.frequency.setValueAtTime(f, t); flt.Q.value = q;
    if (f2) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  tone(dest, t, dur, { type = 'sine', f = 440, f2 = null, vol = 0.5, attack = 0.005, curve = 'exp' }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    else g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  ready() { return this.ctx && this.ctx.state === 'running'; }

  // ------------------------------------------------------------------ weapons
  weaponFire(weaponId, pos, local) {
    if (!this.ready()) return;
    const p = WEAPON_SOUNDS[weaponId];
    if (!p || p.kind === 'none') return;
    const t = this.ctx.currentTime;
    const v = (local ? 0.75 : 1) * (p.vol || 1);
    const d = this.out(local ? null : pos, v);
    const pitch = 0.94 + Math.random() * 0.12;
    switch (p.kind) {
      case 'shotgun':
        this.noise(d, t, p.dur, { type: 'lowpass', f: p.f * 3 * pitch, f2: 300, vol: 0.9 });
        this.noise(d, t, 0.05, { type: 'highpass', f: 2500, vol: 0.5 });
        this.tone(d, t, 0.18, { type: 'sine', f: p.thump * 2, f2: p.thump * 0.6, vol: 0.9 });
        this.noise(d, t + 0.28, 0.08, { type: 'bandpass', f: 2200, q: 6, vol: 0.12 }); // pump clack
        this.noise(d, t + 0.38, 0.06, { type: 'bandpass', f: 1800, q: 6, vol: 0.12 });
        break;
      case 'pistol':
        this.noise(d, t, p.dur, { type: 'bandpass', f: p.f * pitch, q: 0.8, f2: p.f * 0.3, vol: 0.85 });
        this.tone(d, t, 0.08, { type: 'square', f: p.thump * 2, f2: p.thump, vol: 0.25 });
        break;
      case 'silenced':
        this.noise(d, t, p.dur, { type: 'bandpass', f: p.f * pitch, q: 1.5, f2: 500, vol: 0.5 });
        this.noise(d, t + 0.02, 0.04, { type: 'highpass', f: 4000, vol: 0.15 });
        break;
      case 'sniper':
        this.noise(d, t, 0.06, { type: 'highpass', f: 3000, vol: 0.9 });
        this.noise(d, t, p.dur, { type: 'lowpass', f: 2600 * pitch, f2: 200, vol: 0.8 });
        this.tone(d, t, 0.25, { type: 'sine', f: 120, f2: 40, vol: 0.8 });
        this.noise(d, t + 0.75, 0.12, { type: 'bandpass', f: 1500, q: 5, vol: 0.12 }); // bolt
        this.noise(d, t + 0.95, 0.1, { type: 'bandpass', f: 1900, q: 5, vol: 0.12 });
        break;
      case 'rotary':
        this.noise(d, t, p.dur, { type: 'bandpass', f: p.f * pitch, q: 1, vol: 0.6 });
        this.tone(d, t, 0.05, { type: 'square', f: p.thump * 2, f2: p.thump, vol: 0.2 });
        break;
      case 'pneumatic':
        this.noise(d, t, p.dur, { type: 'highpass', f: p.f * pitch, vol: 0.4 });
        this.tone(d, t, 0.05, { type: 'triangle', f: 900 * pitch, f2: 300, vol: 0.2 });
        break;
      case 'zap':
        this.tone(d, t, p.dur, { type: 'sawtooth', f: p.f * pitch, f2: p.f * 1.5, vol: 0.12 });
        break;
      case 'launcher':
        this.noise(d, t, p.dur, { type: 'bandpass', f: p.f * pitch, q: 0.7, f2: 2000, vol: 0.8 });
        this.tone(d, t, 0.2, { type: 'sine', f: p.thump, f2: 40, vol: 0.9 });
        break;
      default:
    }
  }

  dryFire(local = true) {
    if (!this.ready()) return;
    const d = this.out(null, 0.5);
    this.noise(d, this.ctx.currentTime, 0.03, { type: 'bandpass', f: 3500, q: 8, vol: 0.5 });
  }

  reload(mode, pos, local) {
    if (!this.ready()) return;
    const d = this.out(local ? null : pos, local ? 0.55 : 0.7);
    const t = this.ctx.currentTime;
    this.noise(d, t, 0.05, { type: 'bandpass', f: 1800, q: 6, vol: 0.5 });
    if (mode !== 'single') { this.noise(d, t + 0.35, 0.06, { type: 'bandpass', f: 1200, q: 5, vol: 0.5 }); this.noise(d, t + 0.7, 0.05, { type: 'bandpass', f: 2600, q: 8, vol: 0.5 }); }
  }
  shellIn(local = true) {
    if (!this.ready()) return;
    const d = this.out(null, 0.4);
    this.noise(d, this.ctx.currentTime, 0.05, { type: 'bandpass', f: 2200, q: 7, vol: 0.5 });
  }
  equip() {
    if (!this.ready()) return;
    const d = this.out(null, 0.35);
    const t = this.ctx.currentTime;
    this.noise(d, t, 0.12, { type: 'bandpass', f: 900, q: 3, f2: 2800, vol: 0.4 });
    this.noise(d, t + 0.12, 0.04, { type: 'bandpass', f: 3000, q: 8, vol: 0.3 });
  }
  swing(pos, local, heavy) {
    if (!this.ready()) return;
    const d = this.out(local ? null : pos, 0.5);
    this.noise(d, this.ctx.currentTime, heavy ? 0.3 : 0.2, { type: 'bandpass', f: heavy ? 500 : 900, q: 1.5, f2: heavy ? 1500 : 2600, vol: 0.5 });
  }
  meleeHit(kind, pos) {
    if (!this.ready()) return;
    const d = this.out(pos, 0.9);
    const t = this.ctx.currentTime;
    if (kind === 2) { this.tone(d, t, 0.15, { type: 'sine', f: 160, f2: 60, vol: 0.9 }); this.noise(d, t, 0.1, { type: 'lowpass', f: 900, vol: 0.6 }); }
    else if (kind === 3) { this.tone(d, t, 0.25, { type: 'square', f: 1300, f2: 1250, vol: 0.12 }); this.noise(d, t, 0.05, { type: 'highpass', f: 3000, vol: 0.4 }); }
    else if (kind === 1) { this.tone(d, t, 0.2, { type: 'triangle', f: 700, f2: 500, vol: 0.25 }); this.noise(d, t, 0.06, { type: 'bandpass', f: 2000, vol: 0.5 }); }
  }
  impact(kind, pos) {
    if (!this.ready()) return;
    const d = this.out(pos, 0.35);
    const t = this.ctx.currentTime;
    if (kind === 'flesh') this.noise(d, t, 0.06, { type: 'lowpass', f: 700, vol: 0.5 });
    else this.noise(d, t, 0.05, { type: 'bandpass', f: 2500 + Math.random() * 1500, q: 3, vol: 0.4 });
  }
  explosion(pos, radius = 3.5) {
    if (!this.ready()) return;
    const d = this.out(pos, 1.3);
    const t = this.ctx.currentTime;
    this.noise(d, t, 1.2, { type: 'lowpass', f: 1800, f2: 120, vol: 1 });
    this.tone(d, t, 0.6, { type: 'sine', f: 90, f2: 25, vol: 1 });
    this.noise(d, t, 0.08, { type: 'highpass', f: 1500, vol: 0.6 });
    void radius;
  }

  // Continuous loops (flame, beam, rotary spin, repair arc). key per entity.
  loop(key, kind, pos, on) {
    if (!this.ready()) return;
    let L = this.loops.get(key);
    if (!on) {
      if (L) { L.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); setTimeout(() => { try { L.srcs.forEach((s) => s.stop()); } catch { /* ignore */ } }, 300); this.loops.delete(key); }
      return;
    }
    if (!L) {
      const ctx = this.ctx;
      const d = this.out(pos === null ? null : pos, 1);
      const g = ctx.createGain(); g.gain.value = 0; g.connect(d);
      const srcs = [];
      if (kind === 'flame') {
        const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
        const f2 = ctx.createBiquadFilter(); f2.type = 'peaking'; f2.frequency.value = 300; f2.gain.value = 8;
        n.connect(f); f.connect(f2); f2.connect(g); n.start(); srcs.push(n);
        g.gain.setTargetAtTime(0.6, ctx.currentTime, 0.05);
      } else if (kind === 'beam') {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 330;
        const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 495;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 6; const lg = ctx.createGain(); lg.gain.value = 12;
        lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
        const og = ctx.createGain(); og.gain.value = 0.12;
        o.connect(og); o2.connect(og); og.connect(g);
        o.start(); o2.start(); lfo.start(); srcs.push(o, o2, lfo);
        g.gain.setTargetAtTime(0.5, ctx.currentTime, 0.1);
      } else if (kind === 'spin') {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
        const og = ctx.createGain(); og.gain.value = 0.18;
        o.connect(f); f.connect(og); og.connect(g); o.start(); srcs.push(o);
        o.frequency.setTargetAtTime(140, ctx.currentTime, 0.3);
        g.gain.setTargetAtTime(0.5, ctx.currentTime, 0.1);
      } else if (kind === 'arc') {
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 120;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 23; const lg = ctx.createGain(); lg.gain.value = 60;
        lfo.connect(lg); lg.connect(o.frequency);
        const og = ctx.createGain(); og.gain.value = 0.05;
        o.connect(og); og.connect(g); o.start(); lfo.start(); srcs.push(o, lfo);
        g.gain.setTargetAtTime(0.5, ctx.currentTime, 0.05);
      }
      L = { g, srcs, d };
      this.loops.set(key, L);
    }
    if (pos && L.d && L.d._panner) {
      const p = L.d._panner, t = this.ctx.currentTime;
      if (p.positionX) { p.positionX.setTargetAtTime(pos[0], t, 0.03); p.positionY.setTargetAtTime(pos[1], t, 0.03); p.positionZ.setTargetAtTime(pos[2], t, 0.03); }
    }
  }

  stopLoops() { for (const k of [...this.loops.keys()]) this.loop(k, null, null, false); }

  // ------------------------------------------------------------------ characters
  footstep(mat, pos, local, volMul = 1, heavy = false) {
    if (!this.ready()) return;
    const d = this.out(local ? null : pos, (local ? 0.18 : 0.35) * volMul);
    const t = this.ctx.currentTime;
    const metal = SURFACE.metal.includes(mat), wood = SURFACE.wood.includes(mat), soft = SURFACE.soft.includes(mat);
    const f = metal ? 2400 : wood ? 900 : soft ? 600 : 1300;
    this.noise(d, t, soft ? 0.09 : 0.05, { type: 'bandpass', f: f * (0.9 + Math.random() * 0.2) * (heavy ? 0.7 : 1), q: metal ? 4 : 1.2, vol: 0.6 });
    if (metal) this.tone(d, t, 0.08, { type: 'triangle', f: 1800 + Math.random() * 400, vol: 0.05 });
    if (heavy) this.tone(d, t, 0.1, { type: 'sine', f: 90, f2: 50, vol: 0.4 });
  }
  jump(local, pos, double) {
    if (!this.ready()) return;
    const d = this.out(local ? null : pos, 0.3);
    const t = this.ctx.currentTime;
    if (double) { this.noise(d, t, 0.18, { type: 'bandpass', f: 600, f2: 2400, q: 2, vol: 0.5 }); this.tone(d, t, 0.12, { type: 'square', f: 440, f2: 880, vol: 0.06 }); }
    else this.noise(d, t, 0.06, { type: 'lowpass', f: 800, vol: 0.4 });
  }
  land(local, impact) {
    if (!this.ready()) return;
    const d = this.out(null, Math.min(0.6, impact / 25));
    this.noise(d, this.ctx.currentTime, 0.1, { type: 'lowpass', f: 500, vol: 0.7 });
  }
  voice(classId, kind, pos, local) {
    if (!this.ready()) return;
    const base = { scout: 300, spy: 200, marksman: 180, mechanic: 190, doctor: 220, juggernaut: 110, incinerator: 160, demolitionist: 150, soldier: 140 }[classId] || 200;
    const d = this.out(local ? null : pos, local ? 0.35 : 0.6);
    const t = this.ctx.currentTime;
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 6;
    const g = ctx.createGain();
    o.connect(f1); f1.connect(g); g.connect(d);
    const dur = kind === 'death' ? 0.55 : 0.18;
    o.frequency.setValueAtTime(base * (kind === 'death' ? 1.2 : 1.1), t);
    o.frequency.exponentialRampToValueAtTime(base * (kind === 'death' ? 0.5 : 0.8), t + dur);
    f1.frequency.setValueAtTime(kind === 'death' ? 700 : 900, t);
    f1.frequency.exponentialRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
  }
  ability(id, pos, local) {
    if (!this.ready()) return;
    const d = this.out(local ? null : pos, 0.7);
    const t = this.ctx.currentTime;
    switch (id) {
      case 'disguise': this.noise(d, t, 0.5, { type: 'bandpass', f: 400, f2: 3000, q: 3, vol: 0.5 }); [880, 1100, 1320].forEach((f, i) => this.tone(d, t + i * 0.06, 0.2, { type: 'sine', f, vol: 0.12 })); break;
      case 'adrenaline': this.tone(d, t, 0.25, { type: 'sawtooth', f: 220, f2: 880, vol: 0.12 }); this.noise(d, t, 0.35, { type: 'bandpass', f: 800, f2: 4000, q: 2, vol: 0.3 }); [0.08, 0.2].forEach((o) => this.tone(d, t + o, 0.1, { type: 'square', f: 1320, vol: 0.06 })); break;
      case 'groundslam': this.tone(d, t, 0.6, { type: 'sine', f: 70, f2: 28, vol: 0.9 }); this.noise(d, t, 0.7, { type: 'lowpass', f: 500, f2: 120, vol: 0.8 }); this.noise(d, t + 0.05, 0.4, { type: 'bandpass', f: 1800, q: 1, vol: 0.2 }); break;
      case 'clusterbomb': this.noise(d, t, 0.25, { type: 'bandpass', f: 900, f2: 300, q: 2, vol: 0.35 }); this.tone(d, t, 0.15, { type: 'square', f: 300, f2: 180, vol: 0.06 }); break;
      case 'rally': [0, 0.14, 0.28].forEach((o, i) => this.tone(d, t + o, 0.22, { type: 'square', f: [392, 523, 659][i], vol: 0.09 })); this.tone(d, t + 0.42, 0.5, { type: 'square', f: 784, vol: 0.1 }); this.noise(d, t, 0.3, { type: 'lowpass', f: 500, vol: 0.25 }); break;
      case 'cloak': this.tone(d, t, 0.45, { type: 'sine', f: 900, f2: 120, vol: 0.12 }); this.noise(d, t, 0.4, { type: 'highpass', f: 3000, f2: 800, vol: 0.12 }); break;
      case 'decloak': this.tone(d, t, 0.35, { type: 'sine', f: 140, f2: 1000, vol: 0.12 }); this.noise(d, t + 0.1, 0.25, { type: 'highpass', f: 900, f2: 3500, vol: 0.12 }); break;
      case 'sapzap': this.noise(d, t, 0.07, { type: 'bandpass', f: 3200, q: 4, vol: 0.18 }); this.tone(d, t, 0.06, { type: 'square', f: 120, f2: 60, vol: 0.05 }); break;
      case 'stickydet': this.tone(d, t, 0.08, { type: 'square', f: 1600, vol: 0.08 }); this.tone(d, t + 0.09, 0.08, { type: 'square', f: 2000, vol: 0.08 }); break;
      case 'esp': this.tone(d, t, 0.6, { type: 'sine', f: 1200, f2: 300, vol: 0.12 }); [0.05, 0.35].forEach((o) => this.noise(d, t + o, 0.25, { type: 'bandpass', f: 2400, q: 8, vol: 0.18 })); [0, 0.5].forEach((o) => { this.tone(d, t + o, 0.14, { type: 'sine', f: 70, f2: 45, vol: 0.8 }); this.tone(d, t + o + 0.16, 0.12, { type: 'sine', f: 65, f2: 45, vol: 0.6 }); }); break;
      case 'turret': for (let i = 0; i < 5; i++) this.noise(d, t + i * 0.12, 0.05, { type: 'bandpass', f: 1500 + i * 200, q: 6, vol: 0.5 }); this.tone(d, t + 0.7, 0.3, { type: 'square', f: 660, f2: 990, vol: 0.08 }); break;
      case 'overcharge': [523, 659, 784, 1047].forEach((f, i) => this.tone(d, t + i * 0.07, 0.6, { type: 'triangle', f, vol: 0.18 })); this.noise(d, t, 0.8, { type: 'bandpass', f: 1000, f2: 5000, q: 2, vol: 0.2 }); break;
      case 'suppression': this.tone(d, t, 0.3, { type: 'square', f: 90, f2: 60, vol: 0.3 }); this.noise(d, t, 0.15, { type: 'bandpass', f: 1200, q: 4, vol: 0.5 }); break;
      case 'thermalburst': this.noise(d, t, 0.6, { type: 'lowpass', f: 2500, f2: 150, vol: 1 }); this.tone(d, t, 0.4, { type: 'sine', f: 140, f2: 40, vol: 0.8 }); break;
      case 'detcharge': this.noise(d, t, 0.1, { type: 'bandpass', f: 1200, vol: 0.5 }); [0.15, 0.3].forEach((o) => this.tone(d, t + o, 0.06, { type: 'square', f: 1760, vol: 0.12 })); break;
      default:
    }
  }
  turretFire(pos) {
    if (!this.ready()) return;
    const d = this.out(pos, 0.5);
    this.noise(d, this.ctx.currentTime, 0.06, { type: 'bandpass', f: 2600, q: 1.5, vol: 0.6 });
  }
  turretAlert(pos) {
    if (!this.ready()) return;
    const d = this.out(pos, 0.5);
    const t = this.ctx.currentTime;
    this.tone(d, t, 0.1, { type: 'square', f: 1200, vol: 0.12 }); this.tone(d, t + 0.12, 0.1, { type: 'square', f: 1600, vol: 0.12 });
  }

  // ------------------------------------------------------------------ feedback & UI
  hitmarker(crit, headshot, kill) {
    if (!this.ready() || this.settings.hitSound === false) return;
    const d = this.out(null, 0.5, this.ui);
    const t = this.ctx.currentTime;
    if (kill) { this.tone(d, t, 0.12, { type: 'square', f: 880, vol: 0.12 }); this.tone(d, t + 0.09, 0.2, { type: 'square', f: 1320, vol: 0.12 }); return; }
    this.tone(d, t, 0.06, { type: 'triangle', f: headshot ? 1800 : crit ? 1500 : 1100, vol: 0.25 });
    if (crit || headshot) this.tone(d, t + 0.05, 0.1, { type: 'triangle', f: 2400, vol: 0.18 });
  }
  hurt() {
    if (!this.ready()) return;
    const d = this.out(null, 0.4);
    this.noise(d, this.ctx.currentTime, 0.1, { type: 'lowpass', f: 400, vol: 0.6 });
  }
  pickup(kind) {
    if (!this.ready()) return;
    const d = this.out(null, 0.4, this.ui);
    const t = this.ctx.currentTime;
    const fs = kind === 'health' ? [660, 880] : [440, 550];
    fs.forEach((f, i) => this.tone(d, t + i * 0.06, 0.12, { type: 'square', f, vol: 0.08 }));
  }
  uiHover() { if (!this.ready()) return; this.tone(this.out(null, 0.15, this.ui), this.ctx.currentTime, 0.04, { type: 'square', f: 1400, vol: 0.06 }); }
  // Crate show sounds. kind: start | thud | burst | tick | reveal; tier: supply | armored | vault
  crate(kind, tier = 'supply', rarity = 0) {
    if (!this.ready()) return;
    const d = this.out(null, 0.6, this.ui), t = this.ctx.currentTime;
    const big = tier === 'vault' ? 2 : tier === 'armored' ? 1 : 0;
    switch (kind) {
      case 'start': if (big === 2) this.tone(d, t, 1.6, { type: 'sine', f: 110, f2: 330, vol: 0.12 }); else this.noise(d, t, 0.4, { type: 'bandpass', f: 600, f2: 1600, q: 2, vol: 0.15 }); break;
      case 'thud': this.tone(d, t, 0.25, { type: 'sine', f: 90 - big * 15, f2: 40, vol: 0.5 }); this.noise(d, t, 0.18, { type: 'lowpass', f: 700, vol: 0.4 }); if (big === 1) [0.05, 0.12, 0.2].forEach((o) => this.noise(d, t + o, 0.06, { type: 'bandpass', f: 3200, q: 6, vol: 0.12 })); break;
      case 'burst':
        this.noise(d, t, 0.35 + big * 0.2, { type: 'bandpass', f: 900 + big * 500, f2: 3000, q: 1.5, vol: 0.45 });
        this.tone(d, t, 0.3, { type: 'square', f: 220 + big * 110, f2: 660 + big * 220, vol: 0.08 });
        if (big === 2) [0, 0.08, 0.16, 0.24].forEach((o, i) => this.tone(d, t + o, 0.3, { type: 'triangle', f: [523, 659, 784, 1047][i], vol: 0.09 }));
        break;
      case 'tick': this.tone(d, t, 0.03, { type: 'square', f: 1800 + big * 200, vol: 0.05 }); break;
      case 'reveal': {
        const notes = [[392, 523], [440, 554, 659], [523, 659, 784], [523, 659, 784, 1047], [587, 740, 880, 1175], [659, 831, 988, 1319], [523, 659, 784, 1047, 1319, 1568]][rarity] || [523];
        notes.forEach((f, i) => this.tone(d, t + i * 0.09, 0.5 + rarity * 0.08, { type: rarity >= 4 ? 'triangle' : 'square', f, vol: 0.08 }));
        if (rarity >= 4) this.noise(d, t, 1.2, { type: 'highpass', f: 5000, vol: 0.12 });
        break;
      }
      default:
    }
  }
  uiClick() { if (!this.ready()) return; const d = this.out(null, 0.3, this.ui); const t = this.ctx.currentTime; this.tone(d, t, 0.05, { type: 'square', f: 700, vol: 0.12 }); this.tone(d, t + 0.04, 0.06, { type: 'square', f: 1050, vol: 0.1 }); }
  levelUp() { if (!this.ready()) return; const d = this.out(null, 0.5, this.ui); const t = this.ctx.currentTime; [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(d, t + i * 0.09, 0.3, { type: 'square', f, vol: 0.1 })); }

  jingle(kind) {
    if (!this.ready()) return;
    const d = this.out(null, 0.6, this.ui);
    const t = this.ctx.currentTime;
    const seqs = {
      start: [[392, 0], [392, 0.15], [523, 0.3], [784, 0.5]],
      overtime: [[880, 0], [660, 0.2], [880, 0.4], [660, 0.6], [880, 0.8]],
      pickup: [[523, 0], [659, 0.08], [784, 0.16]],
      enemyPickup: [[392, 0], [330, 0.1], [262, 0.2]],
      drop: [[440, 0], [349, 0.12]],
      return: [[523, 0], [784, 0.1], [659, 0.2]],
      capture: [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.3], [784, 0.45], [1047, 0.6]],
      enemyCapture: [[349, 0], [294, 0.15], [262, 0.3], [196, 0.5]],
      victory: [[523, 0], [523, 0.15], [523, 0.3], [659, 0.45], [784, 0.7], [659, 0.9], [784, 1.05], [1047, 1.3]],
      defeat: [[392, 0], [370, 0.3], [349, 0.6], [262, 0.95]],
      killstreak: [[784, 0], [988, 0.08], [1175, 0.16]],
    };
    for (const [f, o] of seqs[kind] || []) this.tone(d, t + o, 0.22, { type: kind === 'defeat' ? 'triangle' : 'square', f, vol: 0.1 });
  }

  // The Titan's gem powers. pos = world position (null = non-positional, e.g. your own gems).
  titan(kind, pos, o = {}) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const d = this.out(pos, kind === 'snap' || kind === 'stone' ? 0.9 : 0.75);
    const T = (dt, dur, opt) => this.tone(d, t + dt, dur, opt);
    const N = (dt, dur, opt) => this.noise(d, t + dt, dur, opt);
    switch (kind) {
      case 'transform':
        T(0, 1.4, { type: 'sawtooth', f: 55, f2: 110, vol: 0.22, attack: 0.05 }); T(0, 1.4, { type: 'square', f: 82, f2: 165, vol: 0.08, attack: 0.08 });
        N(0, 1.2, { f: 300, f2: 2400, q: 0.8, vol: 0.35, attack: 0.1 }); [261, 392, 523, 784].forEach((f, i) => T(0.5 + i * 0.12, 0.6, { type: 'triangle', f, vol: 0.12 }));
        break;
      case 'revert': N(0, 0.8, { f: 2400, f2: 200, q: 0.8, vol: 0.3 }); T(0, 0.8, { type: 'sine', f: 330, f2: 110, vol: 0.2 }); break;
      case 'stone': {
        // a bright chime per gem: each gem has its own pitch
        const base = [392, 262, 523, 330, 440, 294][o.idx ?? 0];
        [1, 1.5, 2, 3].forEach((m, i) => T(i * 0.07, 1.2 - i * 0.15, { type: 'sine', f: base * m, vol: 0.18 / (i + 1) }));
        T(0, 1.4, { type: 'triangle', f: base / 2, vol: 0.15, attack: 0.02 });
        N(0, 0.6, { type: 'highpass', f: 5000, vol: 0.12, attack: 0.01 });
        break;
      }
      case 'time': {
        const up = (o.val ?? 1) > 1;
        T(0, 0.9, { type: 'sine', f: up ? 300 : 900, f2: up ? 1200 : 220, vol: 0.2 }); T(0.05, 0.9, { type: 'triangle', f: up ? 450 : 1300, f2: up ? 1800 : 330, vol: 0.1 });
        for (let i = 0; i < 6; i++) N(i * (up ? 0.08 : 0.16), 0.03, { type: 'highpass', f: 6000, vol: 0.1 });
        break;
      }
      case 'mind': T(0, 1.1, { type: 'sine', f: 520, f2: 260, vol: 0.18, attack: 0.05 }); T(0, 1.1, { type: 'sine', f: 527, f2: 263, vol: 0.18, attack: 0.05 }); N(0, 0.9, { f: 1200, q: 6, vol: 0.12 }); break;
      case 'punch': N(0, 0.35, { type: 'lowpass', f: 900, f2: 90, vol: 0.9 }); T(0, 0.4, { type: 'sine', f: 120, f2: 35, vol: 0.6 }); T(0.02, 0.5, { type: 'sawtooth', f: 220, f2: 60, vol: 0.12 }); break;
      case 'grab': T(0, 0.6, { type: 'sawtooth', f: 90, f2: 140, vol: 0.12 }); N(0, 0.5, { f: 800, f2: 1600, q: 3, vol: 0.2 }); break;
      case 'throw': N(0, 0.4, { f: 400, f2: 2000, q: 1, vol: 0.4 }); T(0, 0.3, { type: 'sine', f: 180, f2: 60, vol: 0.4 }); break;
      case 'drop': N(0, 0.2, { f: 600, vol: 0.15 }); break;
      case 'sample': T(0, 0.25, { type: 'square', f: 880, f2: 1320, vol: 0.06 }); T(0.08, 0.25, { type: 'square', f: 1320, f2: 1760, vol: 0.05 }); break;
      case 'illusion': T(0, 0.6, { type: 'sine', f: 660, f2: 220, vol: 0.14 }); N(0, 0.4, { f: 3000, q: 4, vol: 0.12 }); break;
      case 'shatter': N(0, 0.6, { type: 'highpass', f: 2500, vol: 0.5 }); for (let i = 0; i < 5; i++) T(i * 0.04, 0.2, { type: 'triangle', f: 1800 + Math.random() * 2000, vol: 0.08 }); T(0, 0.4, { type: 'sine', f: 200, f2: 60, vol: 0.3 }); break;
      case 'portal': N(0, 0.9, { f: 200, f2: 1400, q: 2, vol: 0.3, attack: 0.1 }); T(0, 0.9, { type: 'sine', f: 110, f2: 220, vol: 0.2 }); break;
      case 'warp': N(0, 0.45, { f: 3000, f2: 300, q: 1.5, vol: 0.45 }); T(0, 0.45, { type: 'sine', f: 880, f2: 110, vol: 0.2 }); break;
      case 'soul': T(0, 2.0, { type: 'sine', f: 65, f2: 55, vol: 0.4, attack: 0.05 }); [196, 247, 294, 392].forEach((f, i) => T(0.1, 1.6, { type: 'triangle', f, vol: 0.07, attack: 0.25 + i * 0.05 })); N(0, 1.5, { f: 600, f2: 3000, q: 0.7, vol: 0.2, attack: 0.2 }); break;
      case 'snapwind': T(0, 2.0, { type: 'sawtooth', f: 60, f2: 240, vol: 0.15, attack: 0.3 }); T(0, 2.0, { type: 'sine', f: 120, f2: 960, vol: 0.12, attack: 0.5 }); N(0, 1.9, { f: 400, f2: 6000, q: 0.6, vol: 0.2, attack: 0.6 }); break;
      case 'snap': N(0, 0.06, { type: 'highpass', f: 3000, vol: 1.0, attack: 0.001 }); T(0, 0.08, { type: 'square', f: 2400, f2: 900, vol: 0.25 }); N(0.08, 2.5, { f: 2000, f2: 150, q: 0.5, vol: 0.35, attack: 0.05 }); T(0.1, 3, { type: 'sine', f: 55, f2: 30, vol: 0.4 }); break;
      case 'dust': N(0, 1.6, { f: 3000, f2: 600, q: 0.4, vol: 0.25, attack: 0.2 }); break;
      default:
    }
  }

  announce(text) {
    if (!this.settings.announcer || typeof speechSynthesis === 'undefined') return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05; u.pitch = 0.8; u.volume = Math.min(1, this.settings.effectsVolume * this.settings.masterVolume * 1.2);
      speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }

  // ------------------------------------------------------------------ ambience
  startAmbience(kind) {
    if (!this.ctx) return;
    this.stopAmbience();
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0; g.connect(this.amb);
    const srcs = [];
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const f = ctx.createBiquadFilter();
    const cfg = { desert: [350, 0.5, 0.12], snow: [500, 0.8, 0.16], factory: [180, 3, 0.1], city: [260, 0.6, 0.12], jungle: [1800, 0.3, 0.05], fortress: [420, 0.5, 0.1] }[kind] || [400, 0.5, 0.1];
    f.type = 'bandpass'; f.frequency.value = cfg[0]; f.Q.value = cfg[1];
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08; const lg = ctx.createGain(); lg.gain.value = cfg[0] * 0.4;
    lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    n.connect(f); f.connect(g); n.start();
    srcs.push(n, lfo);
    if (kind === 'factory') {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 50;
      const of = ctx.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 150;
      const og = ctx.createGain(); og.gain.value = 0.15;
      o.connect(of); of.connect(og); og.connect(g); o.start(); srcs.push(o);
    }
    if (kind === 'city') {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 60;
      const og = ctx.createGain(); og.gain.value = 0.05; o.connect(og); og.connect(g); o.start(); srcs.push(o);
    }
    g.gain.setTargetAtTime(cfg[2] * 3, ctx.currentTime, 1.5);
    this.ambience = { g, srcs, kind };
    this.ambTimer = setInterval(() => this.ambientOneShot(kind), 2500);
  }

  ambientOneShot(kind) {
    if (!this.ready() || Math.random() < 0.45) return;
    const d = this.out(null, 0.2, this.amb);
    const t = this.ctx.currentTime;
    switch (kind) {
      case 'jungle': for (let i = 0; i < 3; i++) this.tone(d, t + i * 0.12, 0.08, { type: 'sine', f: 2500 + Math.random() * 1500, f2: 3500 + Math.random() * 1000, vol: 0.06 }); break;
      case 'desert': this.noise(d, t, 1.6, { type: 'bandpass', f: 300, f2: 900, q: 1, vol: 0.15, attack: 0.6 }); break;
      case 'snow': this.noise(d, t, 2.2, { type: 'bandpass', f: 700, f2: 300, q: 2, vol: 0.18, attack: 0.8 }); break;
      case 'factory': this.noise(d, t, 0.12, { type: 'bandpass', f: 900 + Math.random() * 600, q: 8, vol: 0.18 }); this.noise(d, t + 0.3, 0.4, { type: 'highpass', f: 3000, vol: 0.05, attack: 0.1 }); break;
      case 'city': this.tone(d, t, 0.5, { type: 'square', f: 300 + Math.random() * 100, f2: 280, vol: 0.02 }); break;
      case 'fortress': this.noise(d, t, 1.2, { type: 'bandpass', f: 500, f2: 1200, q: 1.5, vol: 0.1, attack: 0.5 }); break;
      default:
    }
  }

  stopAmbience() {
    clearInterval(this.ambTimer);
    if (this.ambience) {
      const A = this.ambience;
      A.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      setTimeout(() => A.srcs.forEach((s) => { try { s.stop(); } catch { /* ignore */ } }), 1200);
      this.ambience = null;
    }
  }

  // ------------------------------------------------------------------ music sequencer (chiptune)
  startMusic(track = 'menu') {
    if (!this.ctx) return;
    if (this.musicOn && this.track === track) return;
    this.stopMusic();
    this.musicOn = true;
    this.track = track;
    const bpm = track === 'menu' ? 112 : 128;
    const step = 60 / bpm / 4;
    // original progression: Am - F - C - G (menu), Dm - Bb - F - C (results)
    const prog = track === 'menu' ? [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]] : [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]];
    const lead = track === 'menu'
      ? [76, -1, 74, 72, 69, -1, 72, -1, 74, -1, 72, 69, 67, -1, 69, -1, 72, -1, 71, 72, 74, -1, 76, -1, 79, -1, 76, 74, 72, -1, 74, -1]
      : [74, -1, 72, 69, 70, -1, 69, 67, 65, -1, 67, 69, 72, -1, -1, -1];
    let i = 0;
    let next = this.ctx.currentTime + 0.1;
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const tick = () => {
      if (!this.musicOn) return;
      while (next < this.ctx.currentTime + 0.2) {
        const bar = Math.floor(i / 16) % prog.length;
        const chord = prog[bar];
        const s = i % 16;
        const dest = this.music;
        if (s % 4 === 0) this.tone(dest, next, step * 3.5, { type: 'triangle', f: mtof(chord[0] - 12), vol: 0.22, curve: 'lin' });
        if (s % 2 === 1) this.tone(dest, next, step * 0.9, { type: 'square', f: mtof(chord[(s >> 1) % 3] + 12), vol: 0.035 });
        const ln = lead[i % lead.length];
        if (ln > 0) this.tone(dest, next, step * 1.8, { type: 'square', f: mtof(ln), vol: 0.05 });
        if (s % 4 === 0) this.noise(dest, next, 0.08, { type: 'lowpass', f: 180, vol: 0.4 });
        if (s % 8 === 4) this.noise(dest, next, 0.1, { type: 'bandpass', f: 1800, q: 0.8, vol: 0.18 });
        if (s % 2 === 0) this.noise(dest, next, 0.03, { type: 'highpass', f: 7000, vol: 0.06 });
        next += step;
        i++;
      }
      this.musicTimer = setTimeout(tick, 50);
    };
    tick();
  }

  stopMusic() {
    this.musicOn = false;
    clearTimeout(this.musicTimer);
  }
}
