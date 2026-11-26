// Menus and screens: main menu with 3D showcase, play (practice / host / join / browse / dedicated),
// class select, loadout & cosmetics, profile, statistics & achievements, settings, pause, team menu,
// results/MVP screen and loading overlay.
import { Hud, keyName, crosshairSVG } from './Hud.js';
import { CLASS_IDS, CLASSES, getClass } from '../../shared/config/classes.js';
import { WEAPONS } from '../../shared/config/weapons.js';
import { MODES } from '../../shared/config/modes.js';
import { ACHIEVEMENTS, levelFromXp } from '../../shared/config/progression.js';
import { getItem } from '../../shared/config/cosmetics.js';
import { Armory } from './Armory.js';
import { bannerCSS } from '../render/ItemIcons.js';
import { mapList, MAP_IDS, getMap } from '../../maps/index.js';
import { TEAM_NAMES, GAME_VERSION } from '../../shared/constants.js';
import { saveSettings, resolveQuality, KEY_LABELS, DEFAULT_KEYS, CROSSHAIRS } from '../settings.js';
import { browsePublicRooms, WSClient, defaultServerUrl } from '../net/transports.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = { skull: '☠', hands: '✋', flag: '⚑', shield: '⛨', cross: '✚', gear: '⚙', scope: '◎', bolt: '⚡', knife: '🗡', medal: '🎖', trophy: '🏆', star: '★' };
const SVG = (() => {
  const w = (d) => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  return {
    chat: w('<path d="M5 7h16v11H11l-5 4v-4H5z"/><path d="M24 12h3v10h-2v3l-4-3h-7"/>'),
    find: w('<circle cx="16" cy="16" r="10"/><path d="M16 3v6M16 23v6M3 16h6M23 16h6"/><circle cx="16" cy="16" r="2.5" fill="currentColor"/>'),
    power: w('<path d="M16 4v11"/><path d="M9 8.5a10 10 0 1 0 14 0"/>'),
    gear: w('<circle cx="16" cy="16" r="4.5"/><path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.8 6.8l2.8 2.8M22.4 22.4l2.8 2.8M6.8 25.2l2.8-2.8M22.4 9.6l2.8-2.8"/>'),
    keyboard: w('<rect x="3" y="9" width="26" height="15" rx="2"/><path d="M8 14h1M12 14h1M16 14h1M20 14h1M24 14h1M9 19h14"/>'),
    trophy: w('<path d="M10 5h12v6a6 6 0 0 1-12 0z"/><path d="M10 7H5v2a4 4 0 0 0 5 4M22 7h5v2a4 4 0 0 1-5 4M16 17v5M11 27h10M12 22h8v5h-8z"/>'),
    user: w('<circle cx="16" cy="11" r="5"/><path d="M6 27c1.5-6 5-8 10-8s8.5 2 10 8"/>'),
    target: w('<circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="6"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/>'),
    server: w('<rect x="5" y="4" width="22" height="8" rx="1.5"/><rect x="5" y="14" width="22" height="8" rx="1.5"/><path d="M9 8h2M9 18h2M16 22v5M10 27h12"/>'),
    antenna: w('<path d="M16 14v14M11 28h10"/><circle cx="16" cy="11" r="2.5"/><path d="M10.5 5.5a8 8 0 0 0 0 11M21.5 5.5a8 8 0 0 1 0 11M7 2.5a13 13 0 0 0 0 17M25 2.5a13 13 0 0 1 0 17"/>'),
    key: w('<circle cx="10" cy="16" r="5.5"/><path d="M15.5 16H28M23 16v4.5M27 16v3"/>'),
    globe: w('<circle cx="16" cy="16" r="12"/><path d="M4 16h24M16 4c4 4 4 20 0 24M16 4c-4 4-4 20 0 24"/>'),
    helmet: w('<path d="M5 20a11 11 0 0 1 22 0z"/><path d="M3 20h26v4H3zM16 9v11"/>'),
  };
})();
const MODE_ART = {
  tdm: 'repeating-linear-gradient(90deg, rgba(0,0,0,.18) 0 8px, transparent 8px 16px), linear-gradient(90deg, #d8473b 0 50%, #3f7fd6 50%)',
  ctf: 'repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0 8px, transparent 8px 16px), linear-gradient(135deg, #d8473b 0 30%, #e9e2d0 30% 34%, #3a4048 34% 66%, #e9e2d0 66% 70%, #3f7fd6 70%)',
};
const TIPS = [
  'Scouts can jump a second time in mid-air — and steer while doing it.',
  'Medical Beam healing builds Overcharge. Pop it with E when your patient is under fire.',
  'A Spy disguise breaks when you attack or take 20+ damage. Strike from behind.',
  'Juggernaut Suppression Mode trades mobility for a 35% damage reduction.',
  'Thermal Burst destroys enemy projectiles — save it for incoming blast shells.',
  'Wrench hits repair your turret and refill its ammo.',
  'Scoped Longshot shots charge up to 150 damage. Headshots double it.',
  'In Capture the Flag you can only score while your own flag is at home.',
  'Resupply cabinets in your spawn room refill health and ammo.',
  'Detonation charges stick to walls. Press E again to blow them.',
];

export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.hud = new Hud(app, this.root);
    this.menuOpen = false;
    this.screen = null;
    this.sheet = null;
    this.toasts = h('div', 'toast-stack');
    this.root.appendChild(this.toasts);
    this.previewTeam = 0;
    this.armory = new Armory(this);
  }

  sfx(kind) { if (kind === 'hover') this.app.audio.uiHover(); else this.app.audio.uiClick(); }
  wireSounds(root) {
    root.querySelectorAll('button, .class-card, .mode-card, .map-card, .cos').forEach((b) => {
      b.addEventListener('mouseenter', () => this.sfx('hover'));
      b.addEventListener('click', () => this.sfx('click'));
    });
  }

  toast(html, ms = 4000) {
    const t = h('div', 'toast plate', html);
    this.toasts.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  // ================================================================ MAIN MENU
  // Layout after the TF2-style reference: top bar (fullscreen, settings, class slots, Find Game), profile
  // panel, recent-match list, two large buttons and a featured-map banner on the left; class card top right.
  // Flat square panels, no borders and no text effects.
  showMainMenu() {
    this.closeSheet();
    this.hud.show(false);
    if (this.menuEl) this.menuEl.remove();
    const p = this.app.profile;
    const m = h('div', 'tm');
    const maps = mapList();
    const featured = maps[Math.floor(Date.now() / 86400000) % maps.length];
    m.innerHTML = `
      <div class="tm-top">
        <button class="tm-quit" aria-label="Toggle fullscreen" title="Toggle fullscreen">${SVG.power}</button>
        <button class="tm-gear" data-go="settings" aria-label="Settings" title="Settings">${SVG.gear}</button>
        <div class="tm-slots" role="toolbar" aria-label="Class select"></div>
        <span class="tm-grow"></span>
        <button class="tm-icon" data-go="stats" aria-label="Statistics" title="Statistics & badges">${SVG.trophy}</button>
        <button class="tm-find" data-go="play">${SVG.find}<span>Find game</span></button>
      </div>
      <div class="tm-left">
        <div class="tm-logo">Pixel Fortress</div>
        <div class="tm-panel tm-profile" role="button" tabindex="0" title="Profile"></div>
        <div class="tm-panel tm-recent"></div>
        <div class="tm-bigbtns">
          <button class="tm-big" data-go="loadout">Loadout</button>
          <button class="tm-big" data-go="stats">Achievements</button>
        </div>
        <button class="tm-news" title="Play ${esc(featured.name)} against bots">
          <span class="art">${featured.preview.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
          <span class="txt"><small>Featured map</small><b>${esc(featured.name)}</b></span>
        </button>
      </div>
      <div class="tm-panel tm-classcard" role="button" tabindex="0" title="Class details"></div>
      <div class="tm-status">v${GAME_VERSION} · ${navigator.onLine ? 'Online' : 'Offline, practice only'}</div>`;
    this.root.appendChild(m);
    this.menuEl = m;
    m.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => this.openSheet(b.dataset.go)));
    m.querySelector('.tm-classcard').addEventListener('click', () => this.openSheet('class'));
    m.querySelector('.tm-profile').addEventListener('click', () => this.openSheet('profile'));
    m.querySelector('.tm-news').addEventListener('click', () => this.app.startHost({ mode: featured.modes[0], mapId: featured.id, online: false }));
    m.querySelector('.tm-quit').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); });
    this.renderClassBar();
    this.renderProfileCard();
    this.renderRecent();
    this.renderShowcaseLabel();
    this.wireSounds(m);
    this.updateShowcase();
    this.screen = 'menu';
    this.app.audio.startMusic('menu');
    if (!p.name) setTimeout(() => this.promptName(), 300);
  }

  hideMainMenu() { if (this.menuEl) { this.menuEl.remove(); this.menuEl = null; } }

  updateShowcase(offsetX) {
    const p = this.app.profile;
    const cos = { ...p.cosmetics(), ...(this.previewCos || {}) };
    const sc = this.app.renderer.showcase;
    sc.setCharacters([{ classId: p.data.selectedClass, team: this.previewTeam, cosmetics: cos, weaponId: this.previewWeapon || getClass(p.data.selectedClass).weapons[0], skin: cos.weaponSkin }]);
    // main menu: hero character stands to the right of the panels, turned toward them
    sc.offsetX = offsetX ?? (window.innerWidth > 760 ? 1.45 : 0);
    sc.heroYaw = offsetX === undefined ? -1.0 : 0;
    sc.zoom = offsetX === undefined && window.innerWidth > 760 ? 0.92 : 1;
  }

  renderClassBar() {
    if (!this.menuEl) return;
    const bar = this.menuEl.querySelector('.tm-slots');
    const cur = this.app.profile.data.selectedClass;
    bar.innerHTML = CLASS_IDS.map((id) => `<button class="${id === cur ? 'on' : ''}" data-c="${id}" title="${esc(CLASSES[id].displayName)}" aria-label="${esc(CLASSES[id].displayName)}"><img src="${this.app.icons.portraits[`${id}_${this.previewTeam}`]}" alt=""></button>`).join('');
    bar.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
      this.app.profile.data.selectedClass = b.dataset.c; this.app.profile.save();
      this.previewWeapon = null;
      this.renderClassBar(); this.renderShowcaseLabel(); this.renderProfileCard(); this.updateShowcase();
      this.sfx('click');
    }));
  }

  renderShowcaseLabel() {
    if (!this.menuEl) return;
    const p = this.app.profile;
    const cls = getClass(p.data.selectedClass);
    const cs = p.data.stats.classStats[cls.id] || { matches: 0, kills: 0, deaths: 0 };
    const kd = cs.deaths ? (cs.kills / cs.deaths).toFixed(2) : cs.kills ? cs.kills.toFixed(2) : '0.00';
    const el = this.menuEl.querySelector('.tm-classcard');
    el.innerHTML = `<b>${esc(cls.displayName)}</b><div class="role">${esc(cls.role)}</div>
      <div class="st"><span>Matches played: <em>${cs.matches}</em></span><span>Eliminations: <em>${cs.kills}</em></span><span>K/D: <em>${kd}</em></span></div>`;
  }

  renderProfileCard() {
    if (!this.menuEl) return;
    const p = this.app.profile;
    const L = p.levelInfo();
    const cls = getClass(p.data.selectedClass);
    const s = p.data.stats;
    const segs = 10, on = Math.floor((L.into / L.need) * segs);
    const rank = L.level < 5 ? 'Recruit' : L.level < 10 ? 'Private' : L.level < 20 ? 'Corporal' : L.level < 35 ? 'Sergeant' : 'Veteran';
    const card = this.menuEl.querySelector('.tm-profile');
    card.innerHTML = `
      <img class="av" src="${this.app.icons.portraits[`${cls.id}_${this.previewTeam}`]}" alt="">
      <div class="who">
        <small>${rank}</small>
        <b>${esc(p.name || 'Recruit')}</b>
        <div class="xp">${Array.from({ length: segs }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</div>
        <div class="row"><span>${s.wins} wins</span><span>Level ${L.level}</span></div>
      </div>
      <div class="nums"><span>Matches <em>${s.matches}</em></span><span>Kills <em>${s.kills}</em></span><span>Damage <em>${s.damage.toLocaleString()}</em></span><span>Healing <em>${s.healing.toLocaleString()}</em></span></div>`;
  }

  renderRecent() {
    if (!this.menuEl) return;
    const el = this.menuEl.querySelector('.tm-recent');
    const rec = this.app.profile.data.recent.slice(0, 6);
    if (!rec.length) { el.innerHTML = '<div class="empty">No matches yet. Press <b>Find game</b> to host, join or practise against bots. Your last six results show up here.</div>'; return; }
    el.innerHTML = rec.map((r) => `<div class="row"><img src="${this.app.icons.portraits[`${r.cls}_0`]}" alt=""><div><b>${esc(getMap(r.map).name)}</b><span class="${r.won ? 'w' : r.draw ? 'd' : 'l'}">${r.won ? 'Victory' : r.draw ? 'Stalemate' : 'Defeat'} · ${r.k}/${r.d}/${r.a} · +${r.xp} xp</span></div></div>`).join('');
  }

  promptName() {
    const wrap = h('div', 'sheet-wrap');
    wrap.innerHTML = `<div class="sheet plate stripe-edge" style="width:min(460px,100%)"><div class="sheet-head"><h2>Who's fighting?</h2></div><div class="sheet-body"><div class="field"><label>Callsign shown to other players</label><input class="input" maxlength="16" placeholder="Callsign"></div><div class="row-btns"><button class="btn primary">Enlist</button></div></div></div>`;
    this.root.appendChild(wrap);
    const inp = wrap.querySelector('input');
    inp.value = `Recruit${Math.floor(1000 + Math.random() * 9000)}`;
    inp.select();
    const done = () => { const v = inp.value.replace(/[^\w \-.[\]]/g, '').trim().slice(0, 16) || 'Recruit'; this.app.profile.name = v; wrap.remove(); this.renderProfileCard(); };
    wrap.querySelector('button').addEventListener('click', done);
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(); });
    setTimeout(() => inp.focus(), 50);
  }

  // ================================================================ SHEETS
  openSheet(kind, opts = {}) {
    this.closeSheet();
    const wrap = h('div', `sheet-wrap${kind === 'loadout' ? ' right' : ''}`);
    if (kind === 'loadout') { wrap.style.placeItems = 'center end'; wrap.style.background = 'linear-gradient(90deg, transparent 25%, rgba(10,12,15,.75) 45%)'; }
    const sheet = h('div', 'sheet plate stripe-edge');
    if (kind === 'loadout') sheet.style.width = 'min(780px, 100%)';
    wrap.appendChild(sheet);
    this.root.appendChild(wrap);
    this.sheet = wrap;
    this.sheetKind = kind;
    this.menuOpen = true;
    this.app.touch?.setActive(false);
    const titles = { play: 'Play', class: 'Choose your class', loadout: 'Loadout', profile: 'Profile', stats: 'Statistics', settings: 'Settings', pause: 'Paused', team: 'Choose team' };
    sheet.innerHTML = `<div class="sheet-head"><h2>${titles[kind] || ''}</h2><button class="btn ghost close-x" aria-label="Close">✕</button></div><div class="sheet-body"></div>`;
    const body = sheet.querySelector('.sheet-body');
    sheet.querySelector('.close-x').addEventListener('click', () => this.closeSheet(true));
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) this.closeSheet(true); });
    const fn = { play: () => this.renderPlay(body), class: () => this.renderClass(body, opts), loadout: () => this.armory.renderLoadout(body), profile: () => this.renderProfile(body), stats: () => this.renderStats(body), settings: () => this.renderSettings(body), pause: () => this.renderPause(body), team: () => this.renderTeam(body) }[kind];
    if (fn) fn();
    this.wireSounds(sheet);
    if (kind === 'loadout') this.updateShowcase(-1.6);
    this.menuEl?.classList.toggle('ar-open', kind === 'loadout');
    if (this.menuEl) this.menuEl.querySelectorAll('.nav .btn').forEach((b) => b.classList.toggle('active', b.dataset.go === kind));
    this.onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); this.closeSheet(true); } };
    window.addEventListener('keydown', this.onKey);
  }

  closeSheet(user = false) {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    if (this.classKeys) { window.removeEventListener('keydown', this.classKeys); this.classKeys = null; }
    if (this.sheet) { this.sheet.remove(); this.sheet = null; }
    const wasKind = this.sheetKind;
    this.sheetKind = null;
    this.menuOpen = false;
    if (this.menuEl) {
      this.menuEl.classList.remove('ar-open');
      this.menuEl.querySelectorAll('.nav .btn').forEach((b) => b.classList.remove('active'));
      if (wasKind === 'loadout' || wasKind === 'class') { this.previewWeapon = null; this.previewCos = null; this.updateShowcase(); this.renderClassBar(); }
    }
    if (this.app.state === 'game' && !this.resultsEl) this.app.updateTouchMode?.();
    if (user && this.app.game && this.app.state === 'game' && !this.resultsEl) {
      if (!this.app.input.touchActive()) this.app.input.requestLock();
    }
  }

  // ---------------------------------------------------------------- PLAY
  renderPlay(body) {
    const st = this.app.settings;
    const maps = mapList();
    this.playSel = this.playSel || { mode: st.lastMode || 'tdm', map: st.lastMap || 'dusty_depot', tab: 'practice' };
    const sel = this.playSel;
    body.innerHTML = `
      <div class="mode-grid">${Object.values(MODES).map((m) => `<button class="mode-card ${sel.mode === m.id ? 'sel' : ''}" data-mode="${m.id}"><div class="art" style="background:${MODE_ART[m.id]}"><b>${esc(m.name)}</b></div><div class="info">${esc(m.description)}<div class="meta"><span>Up to ${m.maxPlayers} players</span><span>${m.duration / 60} min</span><span>${m.id === 'tdm' ? `First to ${m.scoreLimit}` : `First to ${m.scoreLimit} captures`}</span><span style="color:var(--good)">Available</span></div></div></button>`).join('')}</div>
      <h3 style="margin:18px 0 10px">Map</h3>
      <div class="map-grid">${maps.map((m) => `<button class="map-card ${sel.map === m.id ? 'sel' : ''}" data-map="${m.id}"><span class="sw">${m.preview.map((c) => `<i style="background:${c}"></i>`).join('')}</span><span class="nm">${esc(m.name)}</span><span class="th">${esc(m.theme)}</span></button>`).join('')}</div>
      <div class="play-cols">
        <div>
          <div class="tabs" style="margin-bottom:14px">
            <button class="btn ${sel.tab === 'practice' ? 'active' : ''}" data-tab="practice">Practice with bots</button>
            <button class="btn ${sel.tab === 'host' ? 'active' : ''}" data-tab="host">Host online</button>
            <button class="btn ${sel.tab === 'join' ? 'active' : ''}" data-tab="join">Join with code</button>
            <button class="btn ${sel.tab === 'browse' ? 'active' : ''}" data-tab="browse">Public matches</button>
            <button class="btn ${sel.tab === 'server' ? 'active' : ''}" data-tab="server">Dedicated server</button>
          </div>
          <div class="tab-body"></div>
        </div>
        <div class="map-info plate thin" style="padding:16px"></div>
      </div>`;
    const info = body.querySelector('.map-info');
    const renderInfo = () => {
      const m = getMap(sel.map);
      info.innerHTML = `<h3>${esc(m.name)}</h3><p class="note" style="margin:8px 0 12px">${esc(m.description)}</p><div class="note">${m.spawns.length / 2} spawn points per team · ${m.pickups.length} supply pickups · ${MODES[sel.mode].name}: ${MODES[sel.mode].description}</div>`;
    };
    renderInfo();
    body.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { sel.mode = b.dataset.mode; this.renderPlay(body); this.wireSounds(body); }));
    body.querySelectorAll('[data-map]').forEach((b) => b.addEventListener('click', () => { sel.map = b.dataset.map; this.renderPlay(body); this.wireSounds(body); }));
    body.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { sel.tab = b.dataset.tab; this.renderPlay(body); this.wireSounds(body); }));
    const tb = body.querySelector('.tab-body');
    const botField = `<div class="field"><label>Fill empty slots with bots: <b class="bf">${st.botFill}</b> players total</label><input type="range" min="0" max="16" step="2" value="${st.botFill}" class="botfill"></div>
      <div class="field"><label>Bot skill: <b class="bd">${Math.round(st.botDifficulty * 100)}%</b></label><input type="range" min="0.15" max="1" step="0.05" value="${st.botDifficulty}" class="botdiff"></div>`;
    const status = '<div class="status-line"></div>';
    const bindBots = () => {
      const bf = tb.querySelector('.botfill'); const bd = tb.querySelector('.botdiff');
      if (bf) bf.addEventListener('input', () => { st.botFill = +bf.value; tb.querySelector('.bf').textContent = st.botFill; saveSettings(st); });
      if (bd) bd.addEventListener('input', () => { st.botDifficulty = +bd.value; tb.querySelector('.bd').textContent = Math.round(st.botDifficulty * 100) + '%'; saveSettings(st); });
    };
    const setStatus = (t, cls = '') => { const s = tb.querySelector('.status-line'); if (s) { s.className = `status-line ${cls}`; s.textContent = t; } };
    const remember = () => { st.lastMode = sel.mode; st.lastMap = sel.map; saveSettings(st); };
    if (sel.tab === 'practice') {
      tb.innerHTML = `<p class="note">Runs the full authoritative server on this device. Bots play every class and both objectives. Works offline.</p>${botField}<button class="btn primary big go">Start practice</button>${status}`;
      bindBots();
      tb.querySelector('.go').addEventListener('click', () => { remember(); this.app.startHost({ mode: sel.mode, mapId: sel.map, online: false }); });
    } else if (sel.tab === 'host') {
      tb.innerHTML = `<p class="note">Your browser becomes the server. Friends join with the room code over a direct peer-to-peer connection. Keep this tab open while hosting.</p>
        <div class="field"><label>Room name</label><input class="input rn" maxlength="28" value="${esc((this.app.profile.name || 'Recruit') + "'s fortress")}"></div>
        <label class="note" style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><input type="checkbox" class="pub" checked style="width:20px;height:20px;accent-color:var(--hazard)"> List in public matches</label>
        ${botField}<button class="btn primary big go">Host match</button>${status}`;
      bindBots();
      tb.querySelector('.go').addEventListener('click', () => { remember(); this.app.startHost({ mode: sel.mode, mapId: sel.map, online: true, public: tb.querySelector('.pub').checked, roomName: tb.querySelector('.rn').value.slice(0, 28) }); });
    } else if (sel.tab === 'join') {
      tb.innerHTML = `<p class="note">Enter the five-character code shown on the host's screen.</p><div class="field"><input class="input code-input" maxlength="5" placeholder="ABCDE"></div><button class="btn primary big go">Join match</button>${status}`;
      const inp = tb.querySelector('input');
      inp.addEventListener('keydown', (e) => e.stopPropagation());
      const go = async () => {
        const code = inp.value.trim().toUpperCase();
        if (code.length !== 5) { setStatus('Room codes are five characters long.', 'err'); return; }
        setStatus('Connecting to host…');
        try { await this.app.joinPeer(code); } catch (e) { setStatus(String(e.message || e), 'err'); }
      };
      tb.querySelector('.go').addEventListener('click', go);
      inp.addEventListener('keyup', (e) => { if (e.key === 'Enter') go(); });
    } else if (sel.tab === 'browse') {
      tb.innerHTML = `<p class="note">Matches hosted by other players who chose to list them publicly.</p><div class="row-btns" style="margin-bottom:12px"><button class="btn refresh">Refresh list</button></div><div class="room-list"><div class="note">Press refresh to search.</div></div>${status}`;
      const list = tb.querySelector('.room-list');
      const refresh = async () => {
        list.innerHTML = '<div class="note">Searching for public matches (up to 10 seconds)…</div>';
        try {
          const rooms = await browsePublicRooms();
          if (!rooms.length) { list.innerHTML = '<div class="note">No public matches right now. Host one from the Host online tab.</div>'; return; }
          list.innerHTML = '';
          for (const r of rooms) {
            const row = h('div', 'room', `<div><b>${esc(r.name || r.room)}</b><div class="note">${esc(getMap(r.mapId).name)} · ${esc(MODES[r.mode]?.name)}</div></div><span class="note">${r.players}/${r.maxPlayers} players</span><button class="btn primary">Join</button>`);
            row.querySelector('button').addEventListener('click', async () => { setStatus('Connecting…'); try { await this.app.joinPeer(r.code); } catch (e) { setStatus(String(e.message || e), 'err'); } });
            list.appendChild(row);
          }
        } catch (e) { list.innerHTML = ''; setStatus(`Could not reach the matchmaking relay: ${e.message || e}`, 'err'); }
      };
      tb.querySelector('.refresh').addEventListener('click', refresh);
      refresh();
    } else if (sel.tab === 'server') {
      const url = st.serverUrl || defaultServerUrl();
      tb.innerHTML = `<p class="note">Connect to a Node.js dedicated server (run <code>npm start</code> in the repository).</p>
        <div class="field"><label>Server address</label><input class="input su" value="${esc(url)}"></div>
        <div class="row-btns" style="margin-bottom:12px"><button class="btn list">List rooms</button><button class="btn primary quick">Quick play</button><button class="btn create">Create room</button></div>
        <div class="room-list"></div>${status}`;
      const su = tb.querySelector('.su');
      su.addEventListener('keydown', (e) => e.stopPropagation());
      su.addEventListener('change', () => { st.serverUrl = su.value.trim(); saveSettings(st); });
      const list = tb.querySelector('.room-list');
      const withWs = async (fn) => {
        setStatus('Connecting…');
        const ws = new WSClient(su.value.trim());
        try { await ws.open(); await fn(ws); } catch (e) { ws.close(); setStatus(String(e.message || e), 'err'); }
      };
      tb.querySelector('.list').addEventListener('click', () => withWs(async (ws) => {
        const r = await ws.request({ t: 'lobby', action: 'list' }, ['rooms']);
        ws.close();
        setStatus(`${r.rooms.length} room(s)`, 'ok');
        list.innerHTML = '';
        for (const room of r.rooms) {
          const row = h('div', 'room', `<div><b>${esc(room.room)}</b><div class="note">${esc(getMap(room.mapId).name)} · ${esc(MODES[room.mode]?.name)} · ${esc(room.state)}</div></div><span class="note">${room.players}/${room.maxPlayers} · ${room.bots} bots</span><button class="btn primary">Join</button>`);
          row.querySelector('button').addEventListener('click', () => withWs((ws2) => this.app.joinServer(ws2, { action: 'join', room: room.id })));
          list.appendChild(row);
        }
      }));
      tb.querySelector('.quick').addEventListener('click', () => withWs((ws) => this.app.joinServer(ws, { action: 'quick', mode: sel.mode, mapId: sel.map })));
      tb.querySelector('.create').addEventListener('click', () => withWs((ws) => this.app.joinServer(ws, { action: 'create', mode: sel.mode, mapId: sel.map, botFill: st.botFill, name: `${this.app.profile.name}'s room` })));
    }
  }

  // ---------------------------------------------------------------- CLASS SELECT
  renderClass(body, opts) {
    const inGame = !!opts.inGame;
    const p = this.app.profile;
    const icons = this.app.icons;
    const team = inGame && this.app.game?.net.me ? this.app.game.net.me.team : this.previewTeam;
    let cur = inGame && this.app.game?.net.me ? this.app.game.net.me.ncls : p.data.selectedClass;
    const roster = inGame ? [...(this.app.game?.net.roster.values() || [])] : [];
    const render = () => {
      const cls = getClass(cur);
      body.innerHTML = `<div class="class-grid">${CLASS_IDS.map((id, i) => {
        const c = CLASSES[id];
        const count = roster.filter((r) => r.team === team && r.cls === id).length;
        const full = inGame && c.limit && count >= c.limit && id !== this.app.game?.net.me?.cls;
        return `<button class="class-card t${team} ${id === cur ? 'sel' : ''}" data-c="${id}"><span class="key">${i + 1}</span>${full ? '<span class="full">Full</span>' : ''}<img class="portrait" src="${icons.portraits[`${id}_${team}`]}" alt=""><span class="nm">${esc(c.displayName)}</span><span class="rl">${esc(c.role)}</span><span class="bars"><span class="bar">Health<i style="--v:${c.health / 300 * 100}%"></i></span><span class="bar">Speed<i style="--v:${(c.speed - 0.6) / 0.6 * 100}%"></i></span><span class="bar">Difficulty<i style="--v:${c.difficulty / 4 * 100}%"></i></span></span></button>`;
      }).join('')}</div>
      <div class="class-detail"><div><img src="${icons.portraits[`${cls.id}_${team}`]}" alt=""><div class="row-btns" style="margin-top:10px"><button class="btn primary big pick" style="width:100%">${inGame ? 'Deploy as ' : 'Select '}${esc(cls.displayName)}</button></div></div>
      <div><h3>${esc(cls.displayName)} <span class="muted small" style="font-family:var(--ui)">${esc(cls.role)}</span></h3><p class="note" style="margin:6px 0 0;font-size:14px">${esc(cls.description)}</p>
      <div class="note" style="margin-top:8px">Health <b style="color:var(--bone)">${cls.health}</b> · Speed <b style="color:var(--bone)">${Math.round(cls.speed * 100)}%</b> · Difficulty <b style="color:var(--bone)">${esc(cls.difficultyLabel)}</b></div>
      <div class="ab"><b>${esc(cls.ability.name)}</b> — ${esc(cls.ability.description)}<br><span class="note"><b>${esc(cls.passive.name)}:</b> ${esc(cls.passive.description)}</span></div>
      <div class="weap-row">${cls.weapons.map((w) => { const d = WEAPONS[w]; return `<div class="weap"><img src="${icons.weapons[w]}" alt=""><div class="nm">${esc(d.name)}</div><div class="d">${esc(d.description)}</div></div>`; }).join('')}</div></div></div>`;
      body.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { cur = b.dataset.c; render(); this.wireSounds(body); if (!inGame) { p.data.selectedClass = cur; p.save(); this.previewWeapon = null; this.updateShowcase(); this.renderShowcaseLabel(); this.renderProfileCard(); } }));
      body.querySelector('.pick').addEventListener('click', () => {
        p.data.selectedClass = cur; p.save();
        if (inGame) { this.app.game?.net.requestClass(cur); this.closeSheet(true); }
        else { this.closeSheet(); this.updateShowcase(); this.renderShowcaseLabel(); this.renderProfileCard(); }
      });
    };
    render();
    this.classKeys = (e) => { const n = parseInt(e.key, 10); if (n >= 1 && n <= 8 && this.sheetKind === 'class') { cur = CLASS_IDS[n - 1]; render(); } };
    window.addEventListener('keydown', this.classKeys, { once: false });
    const prevClose = this.closeSheet.bind(this);
    void prevClose;
  }

  openClassMenu(inGame) {
    this.app.input.exitLock();
    this.openSheet('class', { inGame });
  }
  openPause() { this.app.input.exitLock(); this.openSheet('pause'); }
  openTeamMenu() { this.app.input.exitLock(); this.openSheet('team'); }

  // ---------------------------------------------------------------- LOADOUT
  // ---------------------------------------------------------------- PROFILE
  renderProfile(body) {
    const p = this.app.profile;
    const L = p.levelInfo();
    const fav = getClass(p.favoriteClass());
    const s = p.data.stats;
    body.innerHTML = `
      <div class="play-cols" style="margin-top:0">
        <div>
          <div class="field"><label>Callsign</label><input class="input nm" maxlength="16" value="${esc(p.name)}"></div>
          <div class="idcard plate" style="background:${bannerCSS(getItem(p.loadout().banner))};background-blend-mode:multiply"><div class="row"><img class="avatar" src="${this.app.icons.portraits[`${fav.id}_0`]}" alt=""><div><div class="name">${esc(p.name)}</div><div class="lvl"><b>${L.level}</b><span class="muted small">${L.into} / ${L.need} XP to level ${L.level + 1}</span></div></div></div><div class="xpbar"><i style="width:${L.into / L.need * 100}%"></i></div></div>
          <p class="note">Favorite class: <b style="color:var(--bone)">${esc(fav.displayName)}</b> · Total XP ${p.data.xp} · ${s.wins} wins / ${s.losses} losses / ${s.draws} draws</p>
        </div>
        <div><h3 style="margin-bottom:8px">Recent matches</h3>${p.data.recent.length ? `<table class="tbl"><thead><tr><th>Result</th><th>Map</th><th>Class</th><th class="num">K/D/A</th><th class="num">XP</th></tr></thead><tbody>${p.data.recent.map((r) => `<tr><td style="color:${r.won ? 'var(--good)' : r.draw ? 'var(--bone)' : 'var(--bad)'}">${r.won ? 'Win' : r.draw ? 'Draw' : 'Loss'}</td><td>${esc(getMap(r.map).name)} <span class="muted small">${esc(MODES[r.mode]?.short)}</span></td><td>${esc(getClass(r.cls).displayName)}</td><td class="num">${r.k}/${r.d}/${r.a}</td><td class="num">+${r.xp}</td></tr>`).join('')}</tbody></table>` : '<p class="note">Play a match to see it here.</p>'}</div>
      </div>`;
    const nm = body.querySelector('.nm');
    nm.addEventListener('keydown', (e) => e.stopPropagation());
    nm.addEventListener('change', () => { p.name = nm.value.replace(/[^\w \-.[\]]/g, '').trim().slice(0, 16) || p.name; this.renderProfileCard(); });
  }

  // ---------------------------------------------------------------- STATISTICS
  renderStats(body) {
    const p = this.app.profile;
    const s = p.data.stats;
    const tot = [['Matches', s.matches], ['Wins', s.wins], ['Eliminations', s.kills], ['Assists', s.assists], ['Deaths', s.deaths], ['Captures', s.captures], ['Flag returns', s.returns], ['Healing', s.healing], ['Damage', s.damage], ['Headshot kills', s.headshotKills], ['Back attacks', s.backstabs], ['Turrets built', s.turretsBuilt], ['Best streak', s.bestStreak], ['Awards', s.awards]];
    body.innerHTML = `
      <div class="statgrid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr));margin-top:0">${tot.map(([k, v]) => `<div class="stat"><b>${v.toLocaleString()}</b><span>${k}</span></div>`).join('')}</div>
      <h3 style="margin:20px 0 8px">By class</h3>
      <table class="tbl"><thead><tr><th>Class</th><th class="num">Matches</th><th class="num">Eliminations</th><th class="num">Deaths</th><th class="num">Assists</th><th class="num">Damage</th><th class="num">Healing</th></tr></thead><tbody>${CLASS_IDS.map((id) => { const c = s.classStats[id]; return `<tr><td>${esc(CLASSES[id].displayName)}</td><td class="num">${c.matches}</td><td class="num">${c.kills}</td><td class="num">${c.deaths}</td><td class="num">${c.assists}</td><td class="num">${c.damage}</td><td class="num">${c.healing}</td></tr>`; }).join('')}</tbody></table>
      <h3 style="margin:20px 0 8px">Achievements · ${p.data.achievements.length}/${ACHIEVEMENTS.length}</h3>
      <div class="ach-grid">${ACHIEVEMENTS.map((a) => { const pr = p.achievementProgress(a); return `<div class="ach ${pr.done ? 'done' : ''}"><div class="ic">${ICON[a.icon] || '★'}</div><div><b>${esc(a.name)}</b><div class="note">${esc(a.desc)}</div><div class="pg"><i style="width:${pr.pct * 100}%"></i></div><div class="note small">${Math.min(pr.value, a.goal).toLocaleString()} / ${a.goal.toLocaleString()}</div></div></div>`; }).join('')}</div>`;
  }

  // ---------------------------------------------------------------- SETTINGS
  renderSettings(body) {
    const st = this.app.settings;
    this.setTab = this.setTab || 'controls';
    const tabs = [['controls', 'Controls'], ['graphics', 'Graphics'], ['audio', 'Audio'], ['crosshair', 'Crosshair'], ['mobile', 'Touch'], ['access', 'Accessibility'], ['network', 'Network']];
    body.innerHTML = `<div class="tabs" style="margin-bottom:14px">${tabs.map(([k, l]) => `<button class="btn ${k === this.setTab ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div class="set-body"></div>`;
    body.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.setTab = b.dataset.tab; this.renderSettings(body); this.wireSounds(body); }));
    const sb = body.querySelector('.set-body');
    const save = () => { saveSettings(st); this.app.applySettings(); };
    const rows = [];
    const range = (label, get, set, min, max, step, fmt = (v) => v) => rows.push({ label, html: `<div><input type="range" min="${min}" max="${max}" step="${step}" value="${get()}"><div class="val">${fmt(get())}</div></div>`, bind: (el) => { const i = el.querySelector('input'); i.addEventListener('input', () => { set(+i.value); el.querySelector('.val').textContent = fmt(+i.value); save(); }); } });
    const check = (label, get, set) => rows.push({ label, html: `<input type="checkbox" ${get() ? 'checked' : ''}>`, bind: (el) => { const i = el.querySelector('input'); i.addEventListener('change', () => { set(i.checked); save(); }); } });
    const select = (label, get, set, opts) => rows.push({ label, html: `<select class="input">${opts.map(([v, l]) => `<option value="${v}" ${String(get()) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`, bind: (el) => { const i = el.querySelector('select'); i.addEventListener('change', () => { set(i.value); save(); }); } });
    const pct = (v) => `${Math.round(v * 100)}%`;
    const ov = (k, def) => st.overrides[k] ?? resolveQuality({ ...st, overrides: {} })[k] ?? def;
    switch (this.setTab) {
      case 'controls':
        range('Mouse sensitivity', () => st.sensitivity, (v) => { st.sensitivity = v; }, 0.1, 4, 0.05, (v) => v.toFixed(2));
        range('Horizontal multiplier', () => st.sensX, (v) => { st.sensX = v; }, 0.25, 2, 0.05, (v) => v.toFixed(2));
        range('Vertical multiplier', () => st.sensY, (v) => { st.sensY = v; }, 0.25, 2, 0.05, (v) => v.toFixed(2));
        check('Invert vertical look', () => st.invertY, (v) => { st.invertY = v; });
        range('Field of view', () => st.fov, (v) => { st.fov = v; }, 70, 110, 1, (v) => `${v}°`);
        for (const [k, label] of Object.entries(KEY_LABELS)) rows.push({ label, html: `<button class="btn keybind">${esc(keyName(st.keys[k]))}</button>`, bind: (el) => { const b = el.querySelector('button'); b.addEventListener('click', () => { b.classList.add('wait'); b.textContent = 'Press a key…'; const on = (e) => { e.preventDefault(); e.stopPropagation(); window.removeEventListener('keydown', on, true); if (e.code !== 'Escape') { st.keys[k] = e.code; save(); } b.classList.remove('wait'); b.textContent = keyName(st.keys[k]); }; window.addEventListener('keydown', on, true); }); } });
        rows.push({ label: 'Restore default keys', html: '<button class="btn">Reset</button>', bind: (el) => el.querySelector('button').addEventListener('click', () => { st.keys = { ...DEFAULT_KEYS }; save(); this.renderSettings(body); }) });
        break;
      case 'graphics':
        select('Quality preset', () => st.quality, (v) => { st.quality = v; st.overrides = {}; this.renderSettings(body); }, [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']]);
        range('Resolution scale', () => st.resolutionScale, (v) => { st.resolutionScale = v; }, 0.5, 1.5, 0.05, pct);
        check('Shadows', () => ov('shadows'), (v) => { st.overrides.shadows = v; });
        select('Shadow resolution', () => ov('shadowSize'), (v) => { st.overrides.shadowSize = +v; }, [[512, '512'], [1024, '1024'], [2048, '2048'], [4096, '4096']]);
        range('Particle density', () => ov('particleMult'), (v) => { st.overrides.particleMult = v; }, 0.2, 1.5, 0.05, pct);
        range('Dynamic lights', () => ov('maxLights'), (v) => { st.overrides.maxLights = v; }, 0, 12, 1);
        check('Weather effects', () => ov('weather'), (v) => { st.overrides.weather = v; });
        check('Impact decals', () => ov('decals'), (v) => { st.overrides.decals = v; st.overrides.maxDecals = v ? 60 : 0; });
        check('Anti-aliasing (reload required)', () => ov('antialias'), (v) => { st.overrides.antialias = v; });
        range('View distance', () => ov('fogMult'), (v) => { st.overrides.fogMult = v; }, 0.6, 1.6, 0.05, pct);
        check('Show FPS', () => st.showFps, (v) => { st.showFps = v; });
        rows.push({ label: 'Map changes apply on next load', html: '<span class="note">Some options reload the map</span>', bind: () => {} });
        break;
      case 'audio':
        range('Master volume', () => st.masterVolume, (v) => { st.masterVolume = v; }, 0, 1, 0.05, pct);
        range('Music volume', () => st.musicVolume, (v) => { st.musicVolume = v; }, 0, 1, 0.05, pct);
        range('Effects volume', () => st.effectsVolume, (v) => { st.effectsVolume = v; }, 0, 1, 0.05, pct);
        check('Announcer voice', () => st.announcer, (v) => { st.announcer = v; });
        check('Hit sounds', () => st.hitSound, (v) => { st.hitSound = v; });
        check('3D positional audio (HRTF)', () => st.hrtf, (v) => { st.hrtf = v; });
        break;
      case 'crosshair': {
        const c = st.crosshair;
        select('Style', () => c.style, (v) => { c.style = v; refreshCh(); }, CROSSHAIRS.map((x) => [x, x[0].toUpperCase() + x.slice(1)]));
        rows.push({ label: 'Colour', html: '<input type="color" class="input" style="height:40px;padding:2px">', bind: (el) => { const i = el.querySelector('input'); i.value = c.color; i.addEventListener('input', () => { c.color = i.value; save(); refreshCh(); }); } });
        range('Size', () => c.size, (v) => { c.size = v; refreshCh(); }, 0.5, 2, 0.05, (v) => v.toFixed(2));
        range('Gap', () => c.gap, (v) => { c.gap = v; refreshCh(); }, 0, 14, 1);
        range('Thickness', () => c.thickness, (v) => { c.thickness = v; refreshCh(); }, 1, 5, 1);
        check('Centre dot', () => c.dot, (v) => { c.dot = v; refreshCh(); });
        check('Outline', () => c.outline, (v) => { c.outline = v; refreshCh(); });
        check('Dynamic spread', () => c.dynamic, (v) => { c.dynamic = v; });
        rows.push({ label: 'Preview', html: '<div class="ch-preview" style="display:grid;place-items:center"></div>', bind: (el) => { this.chPrev = el.querySelector('.ch-preview'); } });
        var refreshCh = () => { if (this.chPrev) this.chPrev.innerHTML = crosshairSVG(c); this.app.ui.hud.buildCrosshair(); };
        setTimeout(refreshCh, 0);
        break;
      }
      case 'mobile':
        check('Use touch controls', () => st.forceTouch || this.app.isTouch, (v) => { st.forceTouch = v; });
        range('Look sensitivity', () => st.mobile.lookSens, (v) => { st.mobile.lookSens = v; }, 0.2, 3, 0.05, (v) => v.toFixed(2));
        range('Joystick sensitivity', () => st.mobile.joySens, (v) => { st.mobile.joySens = v; }, 0.5, 2, 0.05, (v) => v.toFixed(2));
        range('Button opacity', () => st.mobile.opacity, (v) => { st.mobile.opacity = v; this.app.touch.applyLayout(); }, 0.2, 1, 0.05, pct);
        rows.push({ label: 'Button layout', html: '<button class="btn">Edit layout</button>', bind: (el) => el.querySelector('button').addEventListener('click', () => { this.closeSheet(); this.app.touch.setEditing(true); }) });
        break;
      case 'access':
        check('Reduce motion (minimal bob, sprint FOV, shake)', () => st.reduceMotion, (v) => { st.reduceMotion = v; });
        range('Camera shake', () => st.cameraShake, (v) => { st.cameraShake = v; }, 0, 1.5, 0.05, pct);
        range('Weapon bob', () => st.viewBob, (v) => { st.viewBob = v; }, 0, 1.5, 0.05, pct);
        check('Damage numbers', () => st.damageNumbers, (v) => { st.damageNumbers = v; });
        check('Show player names', () => st.showNames, (v) => { st.showNames = v; });
        break;
      case 'network':
        check('Show ping', () => st.showPing, (v) => { st.showPing = v; });
        rows.push({ label: 'Dedicated server address', html: `<input class="input" value="${esc(st.serverUrl || defaultServerUrl())}">`, bind: (el) => { const i = el.querySelector('input'); i.addEventListener('keydown', (e) => e.stopPropagation()); i.addEventListener('change', () => { st.serverUrl = i.value.trim(); save(); }); } });
        rows.push({ label: 'Browser hosting uses WebRTC via the public PeerJS signalling service; gameplay traffic flows directly between players.', html: '', bind: () => {} });
        break;
      default:
    }
    const grid = h('div', 'set-grid');
    for (const r of rows) {
      const el = h('div', 'set-row', `<span>${esc(r.label)}</span>${r.html}`);
      grid.appendChild(el);
      r.bind(el);
    }
    sb.appendChild(grid);
  }

  // ---------------------------------------------------------------- PAUSE / TEAM
  renderPause(body) {
    const g = this.app.game;
    const host = g?.net.isHost;
    const code = this.app.host?.code;
    this.sheet.querySelector('.sheet').classList.add('pause');
    body.innerHTML = `
      ${code ? `<div class="note">Room code — share it with friends</div><div class="codebox">${esc(code)}</div>` : this.app.host ? '<div class="note">Hosting offline practice match</div>' : ''}
      <button class="btn primary resume">Resume</button>
      <button class="btn cls">Change class</button>
      <button class="btn team">Change team</button>
      <button class="btn sb">Scoreboard</button>
      <button class="btn set">Settings</button>
      ${host ? `<div class="host-tools"><div class="note">Host controls</div>
        <div class="row-btns"><select class="input hm" style="flex:1">${MAP_IDS.map((id) => `<option value="${id}" ${id === g.net.mapId ? 'selected' : ''}>${esc(getMap(id).name)}</option>`).join('')}</select><select class="input hmo" style="width:120px">${Object.values(MODES).map((m) => `<option value="${m.id}" ${m.id === g.net.mode ? 'selected' : ''}>${m.short}</option>`).join('')}</select></div>
        <button class="btn chmap">Change map / mode</button>
        <div class="field" style="margin:0"><label>Bots: <b class="bv">${g.net.rosterMeta?.botFill ?? 0}</b></label><input type="range" min="0" max="16" step="1" value="${g.net.rosterMeta?.botFill ?? 0}" class="bots"></div>
        <div class="row-btns"><button class="btn restart">Restart match</button><button class="btn end">End match now</button></div></div>` : ''}
      <button class="btn red leave">Leave match</button>`;
    body.querySelector('.resume').addEventListener('click', () => this.closeSheet(true));
    body.querySelector('.cls').addEventListener('click', () => this.openClassMenu(true));
    body.querySelector('.team').addEventListener('click', () => this.openTeamMenu());
    body.querySelector('.sb').addEventListener('click', () => { this.closeSheet(); this.hud.showScoreboard(true); setTimeout(() => this.hud.showScoreboard(false), 4000); });
    body.querySelector('.set').addEventListener('click', () => this.openSheet('settings'));
    body.querySelector('.leave').addEventListener('click', () => this.app.leaveMatch());
    if (host) {
      body.querySelector('.chmap').addEventListener('click', () => { g.net.host('map', { mapId: body.querySelector('.hm').value, mode: body.querySelector('.hmo').value }); this.closeSheet(true); });
      body.querySelector('.restart').addEventListener('click', () => { g.net.host('restart'); this.closeSheet(true); });
      body.querySelector('.end').addEventListener('click', () => { g.net.host('end'); this.closeSheet(); });
      const bots = body.querySelector('.bots');
      bots.addEventListener('input', () => { body.querySelector('.bv').textContent = bots.value; });
      bots.addEventListener('change', () => g.net.host('bots', { count: +bots.value }));
    }
  }

  renderTeam(body) {
    const g = this.app.game;
    const roster = [...(g?.net.roster.values() || [])];
    const c = [0, 1].map((t) => roster.filter((p) => p.team === t).length);
    body.innerHTML = `<p class="note">Switching teams eliminates you. Teams must stay balanced.</p><div class="row-btns"><button class="btn red big" data-t="0">Join RED <span class="sub">${c[0]} players</span></button><button class="btn blue big" data-t="1">Join BLUE <span class="sub">${c[1]} players</span></button></div>`;
    body.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { g?.net.requestTeam(+b.dataset.t); this.closeSheet(true); }));
  }

  // ================================================================ LOADING
  showLoading(title, sub) {
    this.hideLoading();
    const el = h('div', 'loading', `<div><h2>${esc(title)}</h2><div class="muted">${esc(sub || '')}</div><div class="spinner"></div><p class="tip">${esc(TIPS[Math.floor(Math.random() * TIPS.length)])}</p><button class="btn ghost cancel" style="margin-top:16px">Cancel</button></div>`);
    el.querySelector('.cancel').addEventListener('click', () => this.app.leaveMatch());
    this.root.appendChild(el);
    this.loadingEl = el;
  }
  hideLoading() { if (this.loadingEl) { this.loadingEl.remove(); this.loadingEl = null; } }

  onGameReady(game) {
    this.root.querySelectorAll('.sheet-wrap').forEach((e) => e.remove());
    if (!this.app.profile.name) this.app.profile.name = `Recruit${Math.floor(1000 + Math.random() * 9000)}`;
    this.hideLoading();
    this.hideMainMenu();
    this.closeSheet();
    this.hideResults();
    this.app.state = 'game';
    this.app.audio.stopMusic();
    if (!this.app.input.touchActive()) this.toast(`Click the game to aim. <b>${keyName(this.app.settings.keys.classmenu)}</b> changes class, <b>Tab</b> shows scores, <b>Esc</b> opens the menu.`, 6500);
    if (this.app.host?.code) this.toast(`Hosting room <b>${esc(this.app.host.code)}</b> — share this code with friends.`, 9000);
    this.app.onGameReady(game);
  }

  // ================================================================ RESULTS
  showResults(r, summary, myId) {
    this.hideResults();
    this.closeSheet();
    this.hud.showScoreboard(false);
    const icons = this.app.icons;
    const byId = new Map(r.players.map((p) => [p.id, p]));
    const winTxt = r.winner === -1 ? 'Stalemate' : `${TEAM_NAMES[r.winner]} wins`;
    const dur = `${Math.floor(r.duration / 60)}:${String(r.duration % 60).padStart(2, '0')}`;
    const mvps = r.mvps.map((id) => byId.get(id)).filter(Boolean);
    const el = h('div', 'results');
    const players = [...r.players].sort((a, b) => a.team - b.team || b.stats.score - a.stats.score);
    el.innerHTML = `
      <div class="res-head"><div class="win ${r.winner === -1 ? 'draw' : `t${r.winner}`}">${winTxt}</div><div class="final"><span style="color:#ff8f80">${r.scores[0]}</span> — <span style="color:#8fb8ff">${r.scores[1]}</span></div><div class="meta">${esc(getMap(r.mapId).name)} · ${esc(MODES[r.mode].name)} · ${dur} · ${r.reason === 'score' ? 'score limit reached' : r.reason === 'time' ? 'time expired' : r.reason}</div></div>
      <div class="res-mid">
        <div class="awards">${r.awards.map((a) => `<div class="award plate thin"><img src="${icons.portraits[`${a.classId}_${a.team}`]}" alt=""><div><div class="t">${esc(a.title)}</div><div class="n" style="color:${a.team ? '#8fb8ff' : '#ff8f80'}">${esc(a.name)}${a.playerId === myId ? ' (you)' : ''}</div><div class="v">${a.value.toLocaleString()} ${esc(a.unit)}</div></div></div>`).join('')}</div>
        <div class="podium-names">${mvps.map((p, i) => `<div><span>${['MVP', '2nd', '3rd'][i]}</span>${esc(p.name)}</div>`).join('')}</div>
        <div class="xp-panel plate">${summary ? `<h3>${summary.won ? 'Victory' : summary.draw ? 'Draw' : 'Defeat'} · XP earned</h3>${summary.xp.lines.map((l) => `<div class="xp-line"><span>${esc(l.label)}${l.count > 1 ? ` ×${l.count}` : ''}</span><b>+${l.xp}</b></div>`).join('')}<div class="xp-total"><span>Total</span><span>+${summary.xp.total}</span></div>${summary.levelAfter > summary.levelBefore ? `<div class="levelup">Level up! You are now level ${summary.levelAfter}</div>` : ''}${summary.newAchievements.map((a) => `<div class="levelup" style="font-family:var(--ui);font-weight:700">Badge unlocked: ${esc(a.name)}</div>`).join('')}<div class="xpbar" style="margin-top:12px"><i style="width:${levelFromXp(this.app.profile.data.xp).into / levelFromXp(this.app.profile.data.xp).need * 100}%"></i></div>` : '<p class="note">Spectated match</p>'}</div>
      </div>
      <div class="res-table"><table class="tbl"><thead><tr><th>Player</th><th>Team</th><th>Class</th><th class="num">Score</th><th class="num">K</th><th class="num">A</th><th class="num">D</th><th class="num">Damage</th><th class="num">Healing</th>${r.mode === 'ctf' ? '<th class="num">Caps</th><th class="num">Returns</th>' : ''}</tr></thead><tbody>${players.map((p) => `<tr style="${p.id === myId ? 'background:rgba(240,180,41,.15)' : ''}"><td>${esc(p.name)}${p.isBot ? ' <span class="muted small">bot</span>' : ''}</td><td style="color:${p.team ? '#8fb8ff' : '#ff8f80'}">${TEAM_NAMES[p.team]}</td><td>${esc(getClass(p.classId).displayName)}</td><td class="num">${p.stats.score}</td><td class="num">${p.stats.kills}</td><td class="num">${p.stats.assists}</td><td class="num">${p.stats.deaths}</td><td class="num">${Math.round(p.stats.damage)}</td><td class="num">${Math.round(p.stats.healing)}</td>${r.mode === 'ctf' ? `<td class="num">${p.stats.captures}</td><td class="num">${p.stats.returns}</td>` : ''}</tr>`).join('')}</tbody><tfoot>${r.teamStats.map((t, i) => `<tr class="muted"><td>${TEAM_NAMES[i]} total</td><td></td><td></td><td></td><td class="num">${t.kills}</td><td class="num">${t.assists}</td><td class="num">${t.deaths}</td><td class="num">${Math.round(t.damage)}</td><td class="num">${Math.round(t.healing)}</td>${r.mode === 'ctf' ? `<td class="num">${t.captures}</td><td></td>` : ''}</tr>`).join('')}</tfoot></table></div>
      <div class="res-foot"><span class="note next" style="align-self:center">Next match starting soon…</span><button class="btn primary stay">Stay for next match</button><button class="btn leave">Return to menu</button></div>`;
    this.root.appendChild(el);
    this.resultsEl = el;
    el.querySelector('.leave').addEventListener('click', () => this.app.leaveMatch());
    el.querySelector('.stay').addEventListener('click', () => { el.querySelector('.stay').disabled = true; el.querySelector('.next').textContent = 'Waiting for the server to start the next match…'; });
    this.wireSounds(el);
    // podium: MVP characters with their victory poses
    this.app.renderer.showcase.setCharacters(mvps.map((p) => ({ classId: p.classId, team: p.team, cosmetics: p.cosmetics, pose: p.cosmetics?.victoryPose || 'flex', skin: p.cosmetics?.weaponSkin })));
    this.app.state = 'results';
    this.app.touch?.setActive(false);
    this.hud.show(false);
    this.app.audio.startMusic('results');
  }

  hideResults() {
    if (this.resultsEl) { this.resultsEl.remove(); this.resultsEl = null; this.app.audio.stopMusic(); }
  }
}
