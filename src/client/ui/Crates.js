// Crate screen and opening show. Keys come from winning matches (server-decided, see shared/rewards.js);
// each crate tier costs keys and lists its exact rarity odds. Opening: the result is rolled and saved
// first (Profile.openCrate), then the 3D stage (render/CrateStage.js) plays the tier's choreography,
// a reel spins down onto the item, and the reveal scales with rarity (rays, sparks, confetti, rainbow).
import { CRATE_TIERS, CRATE_BY_ID, epicPerKey } from '../../shared/config/crates.js';
import { RARITIES, ITEMS_BY_RARITY, SLOT_NAMES } from '../../shared/config/cosmetics.js';
import { KEY_RULES } from '../../shared/rewards.js';
import { getClass } from '../../shared/config/classes.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
export const KEY_SVG = '<svg class="key-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M11 12h11M18 12v4M21 12v3" stroke="currentColor" stroke-width="2.6" fill="none"/></svg>';
const rarityCss = (r) => (RARITIES[r].color === 'rainbow' ? 'linear-gradient(90deg,#ff6a6a,#ffd36a,#6aff8a,#6ad8ff,#b06aff)' : RARITIES[r].color);
const REEL_TIME = { supply: 4.6, armored: 5.6, vault: 6.6 };

export class CrateUI {
  constructor(ui) {
    this.ui = ui;
    this.app = ui.app;
  }

  // ------------------------------------------------------------------ crate screen (sheet)
  render(body) {
    const p = this.app.profile;
    const keys = p.keys;
    body.innerHTML = `
      <div class="cr-top"><div class="cr-keys">${KEY_SVG}<b>${keys}</b><span>${keys === 1 ? 'key' : 'keys'}</span></div>
        <p class="note cr-how">Earn keys by <b>winning a match with ${KEY_RULES.TEAM_KILLS_REQUIRED}+ team kills on real players</b> (bots don't count). Each eligible winner gets 1 key, +1 if the team reached ${KEY_RULES.BONUS_TEAM_KILLS} kills, +1 for ${KEY_RULES.PERSONAL_KILLS}+ kills of your own (max ${KEY_RULES.MAX_KEYS} per match).</p></div>
      <div class="cr-tiers">${CRATE_TIERS.map((t) => `
        <div class="cr-tier cr-${t.id}">
          <div class="cr-art"><i class="cr-box"></i></div>
          <div class="cr-name">${esc(t.name)}</div>
          <div class="cr-tag note">${esc(t.tagline)}</div>
          <div class="cr-odds">${t.odds.map((o, r) => (o > 0 ? `<div class="cr-odd"><span class="cr-dot" style="background:${rarityCss(r)}"></span><span>${RARITIES[r].name}</span><b>${o < 1 ? o.toFixed(1) : o % 1 ? o.toFixed(1) : o}%</b></div>` : '')).join('')}</div>
          <div class="cr-value note">${epicPerKey(t).toFixed(1)}% Epic or better per key</div>
          <button class="btn ${keys >= t.cost ? 'primary' : ''} cr-open" data-t="${t.id}" ${keys >= t.cost ? '' : 'disabled'}>Open · ${t.cost} ${KEY_SVG}</button>
        </div>`).join('')}</div>
      <div class="cr-note note">Duplicates are skipped: you get something new from that rarity or higher; if you already own all of it, you get keys back. Results are saved the moment you open a crate.</div>
      ${p.data.crateLog.length ? `<h3 class="cr-h">Recent unboxings</h3><div class="cr-log">${p.data.crateLog.slice(0, 8).map((l) => this.logRow(l)).join('')}</div>` : ''}`;
    body.querySelectorAll('.cr-open').forEach((b) => b.addEventListener('click', () => this.open(b.dataset.t)));
  }

  logRow(l) {
    const it = l.item ? this.ui.armory && this.app.profile && this.itemOf(l.item) : null;
    const name = it ? esc(it.name) : `Refund +${l.refund}`;
    return `<div class="cr-logrow"><span class="cr-dot" style="background:${rarityCss(l.rarity)}"></span><span>${name}</span><span class="note">${esc(CRATE_BY_ID[l.tier]?.name || '')}</span></div>`;
  }
  itemOf(id) { for (const list of ITEMS_BY_RARITY) { const it = list.find((x) => x.id === id); if (it) return it; } return null; }

  // ------------------------------------------------------------------ opening show
  open(tierId) {
    if (this.show) return;
    const res = this.app.profile.openCrate(tierId);
    if (!res) { this.ui.toast('Not enough keys.'); return; }
    this.ui.closeSheet();
    this.play(res);
  }

  play(res) {
    const tier = res.tier, rarity = res.rarity;
    const audio = this.app.audio;
    const stage = this.app.renderer.crateStage;
    const el = h('div', `crate-show cs-${tier.id}`);
    el.innerHTML = `
      <div class="cs-head"><div class="cs-title">${esc(tier.name)}</div><div class="cs-sub note">Opening…</div></div>
      <button class="btn ghost cs-skip">Skip</button>
      <div class="cs-reelwrap"><div class="cs-marker"></div><div class="cs-reel"></div></div>
      <div class="cs-reveal hidden"></div>`;
    this.ui.root.appendChild(el);
    this.show = { el, res, done: false };
    this.ui.menuEl?.classList.add('cs-hide');
    const reel = el.querySelector('.cs-reel');
    const STEP = 148, WIN = 38, N = 46;
    const cards = [];
    for (let i = 0; i < N; i++) {
      let it, r;
      if (i === WIN) { it = res.item; r = rarity; } else { r = this.fillerRarity(tier); const pool = ITEMS_BY_RARITY[r]; it = pool[Math.floor(Math.random() * pool.length)]; }
      cards.push(`<div class="cs-card ${i === WIN ? 'win' : ''}" style="--rc:${RARITIES[r].color === 'rainbow' ? '#ff6ad5' : RARITIES[r].color}">${it ? this.ui.armory.thumb(it, it.classes?.[0]) : `<div class="cs-refund">${KEY_SVG}+${res.refund}</div>`}<span>${esc(it ? it.name : 'Key refund')}</span></div>`);
    }
    reel.innerHTML = cards.join('');
    const finish = () => this.reveal();
    stage.start(tier.id, rarity, RARITIES[rarity].color === 'rainbow' ? 'rainbow' : RARITIES[rarity].color, {
      onLand: () => audio.crate?.('thud', tier.id),
      onOpen: () => {
        audio.crate?.('burst', tier.id);
        el.querySelector('.cs-sub').textContent = 'Spinning…';
        el.classList.add('reel-on');
        // spin down onto the winning card (with a random landing spot inside it for suspense)
        const wrapW = el.querySelector('.cs-reelwrap').clientWidth;
        const target = WIN * STEP + STEP / 2 - wrapW / 2 + (Math.random() - 0.5) * (STEP - 30);
        const dur = REEL_TIME[tier.id] * 1000, t0 = performance.now();
        let lastIdx = -1;
        const ease = (x) => 1 - Math.pow(1 - x, 4);
        const step = (now) => {
          if (!this.show || this.show.done) return;
          const k = Math.min(1, (now - t0) / dur);
          const x = target * ease(k);
          reel.style.transform = `translateX(${-x}px)`;
          const idx = Math.floor((x + wrapW / 2) / STEP);
          if (idx !== lastIdx) { lastIdx = idx; audio.crate?.('tick', tier.id); }
          if (k < 1) requestAnimationFrame(step); else { this.show.reelX = target; setTimeout(finish, 350); }
        };
        requestAnimationFrame(step);
        this.show.skipTo = () => { reel.style.transform = `translateX(${-target}px)`; };
      },
    });
    audio.crate?.('start', tier.id);
    el.querySelector('.cs-skip').addEventListener('click', () => {
      if (!this.show || this.show.done) { this.close(); return; }
      if (stage.phase === 'drop' || stage.phase === 'shake') stage.open();
      this.show.skipTo?.();
      finish();
    });
  }

  // Filler cards follow the tier's odds (so the reel shows what the crate can really give)
  fillerRarity(tier) {
    let r = Math.random() * 100;
    for (let i = 0; i < tier.odds.length; i++) { r -= tier.odds[i]; if (r < 0 && tier.odds[i] > 0) return i; }
    return tier.odds.findIndex((o) => o > 0);
  }

  reveal() {
    const S = this.show;
    if (!S || S.done) return;
    S.done = true;
    const { res, el } = S;
    const r = res.rarity, R = RARITIES[r];
    this.app.renderer.crateStage.reveal();
    this.app.audio.crate?.('reveal', res.tier.id, r);
    el.classList.add('revealed', `rv-r${r}`);
    el.querySelector('.cs-sub').textContent = 'Unboxed!';
    el.querySelector('.cs-skip').textContent = 'Close';
    const it = res.item;
    const cls = it?.classes?.[0];
    const rv = el.querySelector('.cs-reveal');
    rv.innerHTML = `
      <div class="rv-rays"></div>
      <div class="rv-card" style="--rc:${R.color === 'rainbow' ? '#ff6ad5' : R.color}">
        <div class="rv-rarity">${esc(R.name)}</div>
        <div class="rv-icon">${it ? this.ui.armory.thumb(it, cls) : `<div class="cs-refund big">${KEY_SVG}+${res.refund}</div>`}</div>
        <div class="rv-name">${esc(it ? it.name : 'Key refund')}</div>
        <div class="rv-meta note">${it ? `${esc(SLOT_NAMES[it.slot] || it.slot)}${cls ? ` · ${esc(getClass(cls).displayName)} only` : ''}` : 'You already own everything this crate could give at that rarity.'}</div>
        <div class="row-btns"><button class="btn primary rv-again">${this.app.profile.keys >= res.tier.cost ? `Open another · ${res.tier.cost} ${KEY_SVG}` : 'Back to crates'}</button>${it ? '<button class="btn rv-equip">Go to loadout</button>' : ''}<button class="btn ghost rv-done">Done</button></div>
      </div>
      ${r >= 3 ? '<div class="rv-confetti"></div>' : ''}`;
    rv.classList.remove('hidden');
    if (r >= 3) this.confetti(rv.querySelector('.rv-confetti'), r);
    rv.querySelector('.rv-done').addEventListener('click', () => this.close());
    rv.querySelector('.rv-equip')?.addEventListener('click', () => { this.close(true); this.ui.openSheet('loadout'); });
    rv.querySelector('.rv-again').addEventListener('click', () => {
      const tierId = res.tier.id;
      const can = this.app.profile.keys >= res.tier.cost;
      this.close(true);
      if (can) this.open(tierId); else this.ui.openSheet('crates');
    });
    this.ui.renderProfileCard?.();
  }

  confetti(host, r) {
    const cols = r >= 6 ? ['#ff6a6a', '#ffd36a', '#6aff8a', '#6ad8ff', '#b06aff'] : r >= 5 ? ['#6fe6ff', '#ffffff', '#b8f6ff'] : r >= 4 ? ['#f2c22e', '#fff1b0', '#ffffff'] : ['#a65df2', '#ffffff', '#d8b8ff'];
    const n = [0, 0, 0, 40, 70, 90, 120][r];
    for (let i = 0; i < n; i++) {
      const c = h('i');
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = cols[i % cols.length];
      c.style.animationDelay = `${Math.random() * 0.6}s`;
      c.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
      c.style.setProperty('--dx', `${(Math.random() - 0.5) * 160}px`);
      host.appendChild(c);
    }
  }

  close(quiet = false) {
    if (!this.show) return;
    this.show.done = true;
    this.show.el.remove();
    this.show = null;
    this.app.renderer.crateStage.stop();
    this.ui.menuEl?.classList.remove('cs-hide');
    this.ui.renderProfileCard?.();
    if (!quiet) this.ui.openSheet('crates');
  }
}
