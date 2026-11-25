// Armory: per-class loadout & inventory browser, crate opening (reel animation), crafting, contracts
// and end-of-match reward summaries. Driven by Profile (client-side persistent economy).
import { CLASS_IDS, CLASSES, getClass } from '../../shared/config/classes.js';
import { WEAPONS } from '../../shared/config/weapons.js';
import { ITEMS, RARITIES, SLOTS, SLOT_NAMES, CRATES, CRATE_BY_ID, getItem, canWear, rarityOdds, rollCrate, STARTER_ITEMS } from '../../shared/config/cosmetics.js';
import { CRATE_TIERS, COLLECTION_MILESTONES } from '../../shared/config/economy.js';
import { ItemIcons, bannerCSS } from '../render/ItemIcons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PAGE = 48;

export function crateSVG(type, size = 44) {
  const c = CRATE_BY_ID[type] || CRATES[0];
  return `<svg class="crate-ico" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><path d="M3 10l13-6 13 6v13l-13 6-13-6z" fill="${c.color}" stroke="#1a1410" stroke-width="1.6" stroke-linejoin="round"/><path d="M3 10l13 6 13-6M16 16v13" fill="none" stroke="#1a1410" stroke-width="1.6"/><path d="M16 16l13-6v13l-13 6z" fill="rgba(0,0,0,.22)"/><path d="M9.5 7l13 6v4" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2"/><rect x="12.5" y="18" width="7" height="5" rx="1" fill="#2a211a" transform="skewY(-25) translate(0 13)"/></svg>`;
}

export function rarityChip(r) {
  const R = RARITIES[r];
  return `<span class="rar r${r}">${esc(R.name)}</span>`;
}

const fmtTime = (ms) => {
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
};

export class Armory {
  constructor(ui) {
    this.ui = ui;
    this.app = ui.app;
    this.slot = 'hat';
    this.filter = 'owned';
    this.sort = 'rarity';
    this.search = '';
    this.page = 1;
    this.selected = null;
  }

  get icons() {
    if (!this.app.itemIcons) this.app.itemIcons = new ItemIcons(this.app.renderer);
    return this.app.itemIcons;
  }

  // Thumbnail markup; 3D icons fill in once rendered.
  thumb(item, classId, team = this.ui.previewTeam) {
    if (item.slot === 'banner') return `<span class="thumb banner" style="background:${bannerCSS(item)}"></span>`;
    const url = this.icons.get(item, classId, team, (u) => {
      document.querySelectorAll(`img[data-ico="${CSS.escape(`${item.id}|${classId || ''}|${team}`)}"]`).forEach((im) => { if (u) im.src = u; im.classList.add('ok'); });
    });
    return `<img class="thumb ${url ? 'ok' : ''}" data-ico="${esc(`${item.id}|${classId || ''}|${team}`)}" ${url ? `src="${url}"` : ''} alt="">`;
  }

  pushLoadout() {
    this.app.game?.net.send({ t: 'cos', loadouts: this.app.profile.loadoutsPayload() });
  }

  // ================================================================ LOADOUT / INVENTORY
  renderLoadout(body) {
    this.body = body;
    const p = this.app.profile;
    const clsId = p.data.selectedClass;
    const cls = getClass(clsId);
    const lo = p.loadout(clsId);
    const slot = this.slot;
    const portraits = this.app.icons.portraits;
    const col = p.collection();
    const counts = {};
    for (const s of SLOTS) {
      const all = ITEMS.filter((i) => i.slot === s && canWear(i, clsId));
      counts[s] = { own: all.filter((i) => p.owns(i.id)).length, all: all.length, nw: all.some((i) => p.isNew(i.id)) };
    }
    body.innerHTML = `
      <div class="ar-classes">${CLASS_IDS.map((id) => `<button class="${id === clsId ? 'on' : ''}" data-c="${id}" title="${esc(CLASSES[id].displayName)}"><img src="${portraits[`${id}_${this.ui.previewTeam}`]}" alt=""><span>${esc(CLASSES[id].displayName)}</span></button>`).join('')}</div>
      <div class="ar-sub"><b>${esc(cls.displayName)}</b> loadout <span class="muted">· ${col.owned} / ${col.total} items collected</span><span class="grow"></span><button class="btn small ar-crates">${crateSVG('bronze', 18)} Crates${p.data.crates.length ? ` <i class="badge">${p.data.crates.length}</i>` : ''}</button></div>
      <div class="ar-slots">
        <button class="${slot === 'weapons' ? 'on' : ''}" data-s="weapons"><span>Weapons</span><small>${cls.weapons.length}</small></button>
        ${SLOTS.map((s) => `<button class="${s === slot ? 'on' : ''}" data-s="${s}">${lo[s] && getItem(lo[s]) && s !== 'banner' && s !== 'weaponSkin' && s !== 'victoryPose' && s !== 'elimEffect' ? '<i class="dot"></i>' : ''}<span>${esc(SLOT_NAMES[s])}</span><small>${counts[s].own}/${counts[s].all}${counts[s].nw ? ' <b class="new">NEW</b>' : ''}</small></button>`).join('')}
      </div>
      <div class="ar-main"></div>`;
    body.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
      p.data.selectedClass = b.dataset.c; p.save();
      this.ui.previewWeapon = null; this.ui.previewCos = null; this.selected = null; this.page = 1;
      this.ui.updateShowcase(-1.6); this.ui.renderClassBar(); this.ui.renderShowcaseLabel(); this.ui.renderProfileCard();
      this.renderLoadout(body); this.ui.wireSounds(body);
    }));
    body.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => {
      this.slot = b.dataset.s; this.page = 1; this.selected = null; this.ui.previewCos = null; this.ui.updateShowcase(-1.6);
      this.renderLoadout(body); this.ui.wireSounds(body);
    }));
    body.querySelector('.ar-crates').addEventListener('click', () => this.ui.openSheet('crates'));
    const main = body.querySelector('.ar-main');
    if (slot === 'weapons') this.renderWeapons(main, cls);
    else this.renderItems(main, clsId);
  }

  renderWeapons(main, cls) {
    const icons = this.app.icons;
    const ui = this.ui;
    ui.inspectW = ui.inspectW && cls.weapons.includes(ui.inspectW) ? ui.inspectW : cls.weapons[0];
    const d = WEAPONS[ui.inspectW];
    const stat = (k, v) => `<div>${k}: <b>${v}</b></div>`;
    const dps = d.type === 'melee' || d.type === 'hitscan' || d.type === 'projectile' || d.type === 'flame' ? Math.round(d.damage * d.pellets / d.fireInterval) : 0;
    main.innerHTML = `
      <div class="inspect">${cls.weapons.map((w, i) => `<div class="weap ${w === ui.inspectW ? 'sel' : ''}" data-w="${w}" style="${w === ui.inspectW ? 'border-color:var(--hazard)' : ''}"><img src="${icons.weapons[w]}" alt=""><div class="nm">${esc(WEAPONS[w].name)}</div><div class="d">${['Primary', 'Secondary', 'Melee'][i]} · ${esc(WEAPONS[w].category)}</div></div>`).join('')}</div>
      <div class="weapon-stats">${stat('Damage', d.pellets > 1 ? `${d.damage} × ${d.pellets}` : d.type === 'beam' ? `${d.beam.healRate} HP/s heal` : d.damage)}${dps ? stat('Damage / sec', dps) : ''}${stat('Fire rate', `${(1 / d.fireInterval).toFixed(1)}/s`)}${d.clip > 0 ? stat('Magazine', `${d.clip} + ${d.reserve}`) : stat('Ammo', d.clip < 0 ? 'Unlimited' : '—')}${d.clip > 0 ? stat('Reload', `${d.reloadMode === 'single' ? `${d.reloadTime}s / round` : `${d.reloadTime}s`}`) : ''}${d.type === 'hitscan' ? stat('Effective range', `${d.effectiveRange} m`) : ''}${d.headshotMult > 1 ? stat('Headshot', `×${d.headshotMult}`) : ''}${d.projectile ? stat('Projectile speed', `${d.projectile.speed} m/s`) : ''}${d.melee ? stat('Reach', `${d.melee.range} m`) : ''}${stat('Switch time', `${d.deployTime}s`)}</div>
      <p class="note">Cosmetics never change stats. Weapon skins apply to every weapon of the class.</p>`;
    main.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => { ui.inspectW = b.dataset.w; ui.previewWeapon = ui.inspectW; ui.updateShowcase(-1.6); this.renderWeapons(main, cls); ui.wireSounds(main); }));
  }

  itemList(clsId) {
    const p = this.app.profile;
    const q = this.search.trim().toLowerCase();
    let list = ITEMS.filter((i) => i.slot === this.slot && canWear(i, clsId));
    if (this.filter === 'owned') list = list.filter((i) => p.owns(i.id));
    if (this.filter === 'class') list = list.filter((i) => i.classes);
    if (q) list = list.filter((i) => i.name.toLowerCase().includes(q) || RARITIES[i.rarity].name.toLowerCase() === q);
    const own = (i) => (p.owns(i.id) ? 1 : 0);
    if (this.sort === 'rarity') list.sort((a, b) => own(b) - own(a) || b.rarity - a.rarity || a.name.localeCompare(b.name));
    else if (this.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => (p.isNew(b.id) ? 1 : 0) - (p.isNew(a.id) ? 1 : 0) || b.rarity - a.rarity);
    return list;
  }

  renderItems(main, clsId) {
    const p = this.app.profile;
    const lo = p.loadout(clsId);
    const list = this.itemList(clsId);
    const shown = list.slice(0, PAGE * this.page);
    const equipped = lo[this.slot];
    const sel = this.selected && getItem(this.selected);
    main.innerHTML = `
      <div class="ar-tools">
        <div class="seg">${[['owned', 'Owned'], ['all', 'All'], ['class', `${esc(getClass(clsId).displayName)} only`]].map(([k, l]) => `<button class="${this.filter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
        <select class="input sel-sort" aria-label="Sort">${[['rarity', 'Rarity'], ['new', 'Newest'], ['name', 'Name']].map(([k, l]) => `<option value="${k}" ${this.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input class="input ar-search" placeholder="Search…" value="${esc(this.search)}" aria-label="Search items">
        <span class="grow"></span>
        <button class="btn small ar-all" title="Copy this class's cosmetics to every class that can wear them">Apply to all classes</button>
      </div>
      <div class="ar-grid">${shown.length ? shown.map((it) => {
        const own = p.owns(it.id);
        return `<button class="itm r${it.rarity} ${it.id === equipped ? 'eq' : ''} ${own ? '' : 'locked'} ${it.id === this.selected ? 'sel' : ''}" data-i="${it.id}" title="${esc(it.name)}">${this.thumb(it, clsId)}<span class="nm">${esc(it.name)}</span>${it.classes ? '<span class="cl">Class</span>' : ''}${p.isNew(it.id) ? '<span class="nw">NEW</span>' : ''}${it.id === equipped ? '<span class="eqm">✔</span>' : ''}</button>`;
      }).join('') : `<div class="empty">${this.filter === 'owned' ? 'No items in this slot yet. Earn crates by getting <b>5+ eliminations</b> in a match, completing contracts and levelling up.' : 'Nothing matches.'}</div>`}</div>
      ${list.length > shown.length ? `<div class="row-btns"><button class="btn more">Show more (${list.length - shown.length})</button></div>` : ''}
      <div class="ar-detail">${sel ? this.detailHTML(sel, clsId, equipped) : `<span class="muted">Select an item to preview it on your ${esc(getClass(clsId).displayName)}.</span>`}</div>`;
    const rerender = () => { this.renderItems(main, clsId); this.ui.wireSounds(main); };
    main.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { this.filter = b.dataset.f; this.page = 1; rerender(); }));
    main.querySelector('.sel-sort').addEventListener('change', (e) => { this.sort = e.target.value; rerender(); });
    const sInp = main.querySelector('.ar-search');
    sInp.addEventListener('keydown', (e) => e.stopPropagation());
    sInp.addEventListener('input', () => { this.search = sInp.value; this.page = 1; clearTimeout(this.sT); this.sT = setTimeout(() => { rerender(); const n = main.querySelector('.ar-search'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); });
    main.querySelector('.more')?.addEventListener('click', () => { this.page++; rerender(); });
    main.querySelector('.ar-all').addEventListener('click', () => { p.equipAll(clsId); this.pushLoadout(); this.ui.toast(`${esc(getClass(clsId).displayName)}'s cosmetics copied to every class that can wear them.`); });
    main.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
      const it = getItem(b.dataset.i);
      this.selected = it.id;
      if (p.isNew(it.id)) p.markSeen([it.id]);
      if (p.owns(it.id)) { p.equip(clsId, this.slot, it.id); this.pushLoadout(); this.ui.previewCos = null; } else this.ui.previewCos = { [this.slot]: it.id };
      this.preview(it);
      rerender();
      this.ui.renderProfileCard();
    }));
    const d = main.querySelector('.ar-detail');
    d.querySelector('.unequip')?.addEventListener('click', () => { p.equip(clsId, this.slot, null); this.pushLoadout(); this.ui.previewCos = null; this.ui.updateShowcase(-1.6); rerender(); });
    d.querySelector('.salvage')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      if (!btn.dataset.armed) { btn.dataset.armed = '1'; btn.textContent = `Confirm: salvage for ${RARITIES[sel.rarity].scrap} scrap`; return; }
      const got = p.salvage(sel.id);
      this.selected = null; this.pushLoadout(); this.ui.updateShowcase(-1.6);
      this.ui.toast(`Salvaged <b>${esc(sel.name)}</b> for <b>${got}</b> scrap.`);
      rerender();
    });
  }

  detailHTML(it, clsId, equipped) {
    const p = this.app.profile;
    const own = p.owns(it.id);
    const who = it.classes ? `${it.classes.map((c) => esc(getClass(c).displayName)).join(', ')} only` : 'All classes';
    return `<div class="det r${it.rarity}">${this.thumb(it, clsId)}<div class="txt"><b>${esc(it.name)}</b><div>${rarityChip(it.rarity)} <span class="muted">${esc(SLOT_NAMES[it.slot].replace(/s$/, ''))} · ${who}${it.fx ? ` · ${{ shine: 'Polished', glow: 'Glowing', rainbow: 'Iridescent shimmer' }[it.fx]}` : ''}</span></div>
      <div class="muted small">${own ? (it.id === equipped ? 'Equipped' : 'Owned') : 'Not owned yet — drops from crates. Previewing.'}</div></div>
      <div class="acts">${own && it.id === equipped && !['weaponSkin', 'victoryPose', 'elimEffect', 'banner'].includes(it.slot) ? '<button class="btn small unequip">Unequip</button>' : ''}${own && !STARTER_ITEMS.includes(it.id) ? '<button class="btn small salvage">Salvage</button>' : ''}</div></div>`;
  }

  preview(it) {
    const ui = this.ui;
    ui.updateShowcase(-1.6);
    const rig = this.app.renderer.showcase.rigs[0];
    if (!rig) return;
    if (it.slot === 'victoryPose') { rig.anim.pose = it.id; clearTimeout(this.poseT); this.poseT = setTimeout(() => { const r = this.app.renderer.showcase.rigs[0]; if (r) r.anim.pose = null; }, 3500); }
  }

  // ================================================================ CRATES
  renderCrates(body) {
    this.body = body;
    const p = this.app.profile;
    const counts = p.crateCounts();
    const col = p.collection();
    const nextM = col.next;
    body.innerHTML = `
      <div class="cr-top">
        <div class="cr-scrap"><b>${p.data.scrap.toLocaleString()}</b><span>scrap</span></div>
        <div class="cr-col"><div class="lbl">Collection <b>${col.owned} / ${col.total}</b>${nextM ? ` · next reward at ${nextM.count} items: ${esc(CRATE_BY_ID[nextM.crate].name)}` : ' · complete!'}</div><div class="xpbar"><i style="width:${Math.min(100, (col.owned / (nextM ? nextM.count : col.total)) * 100)}%"></i></div></div>
      </div>
      <div class="cr-grid">${CRATES.map((c) => {
        const odds = rarityOdds(c.id);
        const n = counts[c.id] || 0;
        return `<div class="cr-card ${n ? 'has' : ''}" style="--cc:${c.color}">
          <div class="cr-head">${crateSVG(c.id, 56)}<div><b>${esc(c.name)}</b><span>${n ? `${n} unopened` : 'None yet'}</span></div></div>
          <div class="odds">${RARITIES.map((r, i) => `<div><span class="rar r${i}">${esc(r.name)}</span><b>${odds[i] > 0 ? `${(odds[i] * 100).toFixed(odds[i] < 0.01 ? 2 : 1)}%` : '—'}</b></div>`).join('')}</div>
          <div class="row-btns"><button class="btn primary open" data-open="${c.id}" ${n ? '' : 'disabled'}>Open</button><button class="btn craft" data-craft="${c.id}" ${p.data.scrap >= c.craft ? '' : 'disabled'}>Craft · ${c.craft} scrap</button></div>
        </div>`;
      }).join('')}</div>
      <div class="cr-how">
        <h3>Earning crates</h3>
        <ul>
          ${CRATE_TIERS.map((t) => `<li>${crateSVG(t.crate, 18)} <b>${t.kills}+ eliminations</b> in one match → ${esc(CRATE_BY_ID[t.crate].name)}</li>`).join('')}
          <li>${crateSVG('silver', 18)} <b>First win of the day</b> and every new <b>badge</b> → Silver Crate</li>
          <li>${crateSVG('bronze', 18)} Every <b>level up</b> (Silver every 5 levels, Gold every 10) and <b>contracts</b></li>
          <li>${crateSVG('diamond', 18)} <b>Collection milestones</b> at ${COLLECTION_MILESTONES.map((m) => m.count).join(', ')} unique items</li>
          <li>Duplicates turn into <b>scrap</b>; salvage items you don't want and craft crates of your choice.</li>
        </ul>
      </div>`;
    body.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => this.openReel(b.dataset.open)));
    body.querySelectorAll('[data-craft]').forEach((b) => b.addEventListener('click', () => { if (p.craftCrate(b.dataset.craft)) { this.ui.toast(`Crafted a <b>${esc(CRATE_BY_ID[b.dataset.craft].name)}</b>.`); this.renderCrates(body); this.ui.wireSounds(body); this.ui.renderMenuBadges?.(); } }));
  }

  openReel(type) {
    const p = this.app.profile;
    const res = p.openCrate(type);
    if (!res) return;
    const clsId = p.data.selectedClass;
    const N = 46, WIN = 40;
    const strip = [];
    for (let i = 0; i < N; i++) strip.push(i === WIN ? res.item : rollCrate(type));
    const wrap = document.createElement('div');
    wrap.className = 'reel-wrap';
    wrap.innerHTML = `<div class="reel-box plate"><div class="reel-title">${crateSVG(type, 30)} <span>${esc(CRATE_BY_ID[type].name)}</span></div>
      <div class="reel"><div class="reel-strip">${strip.map((it) => `<div class="rc r${it.rarity}">${this.thumb(it, it.classes ? it.classes[0] : clsId)}<span>${esc(it.name)}</span></div>`).join('')}</div><i class="reel-mark"></i></div>
      <div class="reel-result"></div><div class="row-btns reel-btns"><button class="btn skip">Skip</button></div></div>`;
    this.ui.root.appendChild(wrap);
    const stripEl = wrap.querySelector('.reel-strip');
    const reel = wrap.querySelector('.reel');
    const cardW = 116;
    const target = WIN * cardW + cardW / 2 - reel.clientWidth / 2 + (Math.random() - 0.5) * (cardW * 0.7);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      stripEl.style.transition = 'none';
      stripEl.style.transform = `translateX(${-target}px)`;
      cancelAnimationFrame(this.tickRaf);
      this.reveal(wrap, res, type);
    };
    wrap.querySelector('.skip').addEventListener('click', finish);
    // tick sound as cards pass the marker
    let last = 0;
    const tick = () => {
      if (done) return;
      const m = new DOMMatrixReadOnly(getComputedStyle(stripEl).transform);
      const idx = Math.floor((-m.m41 + reel.clientWidth / 2) / cardW);
      if (idx !== last) { last = idx; this.app.audio.reelTick?.(); }
      this.tickRaf = requestAnimationFrame(tick);
    };
    setTimeout(() => {
      if (done) return;
      stripEl.style.transition = 'transform 5.2s cubic-bezier(.08,.6,.12,1)';
      stripEl.style.transform = `translateX(${-target}px)`;
      tick();
      setTimeout(finish, 5350);
    }, 350);
  }

  reveal(wrap, res, type) {
    const p = this.app.profile;
    const it = res.item;
    const clsId = p.data.selectedClass;
    const wearCls = canWear(it, clsId) ? clsId : it.classes[0];
    wrap.querySelectorAll('.rc')[40]?.classList.add('win');
    const box = wrap.querySelector('.reel-result');
    box.className = `reel-result show r${it.rarity}`;
    box.innerHTML = `${this.thumb(it, wearCls)}<div><div class="rr-r">${rarityChip(it.rarity)}</div><b>${esc(it.name)}</b><div class="muted">${esc(SLOT_NAMES[it.slot].replace(/s$/, ''))} · ${it.classes ? `${esc(getClass(it.classes[0]).displayName)} only` : 'All classes'}</div>${res.duplicate ? `<div class="dup">Duplicate — converted to <b>${res.scrap}</b> scrap</div>` : '<div class="nwi">New item!</div>'}${res.milestones.map((m) => `<div class="nwi">Collection milestone: ${m.count} items — ${esc(CRATE_BY_ID[m.crate].name)} earned</div>`).join('')}</div>`;
    this.app.audio.crateReveal?.(it.rarity);
    const more = (p.crateCounts()[type] || 0) > 0;
    const btns = wrap.querySelector('.reel-btns');
    btns.innerHTML = `${!res.duplicate ? `<button class="btn primary equip">Equip on ${esc(getClass(wearCls).displayName)}</button>` : ''}${more ? '<button class="btn again">Open another</button>' : ''}<button class="btn close">Done</button>`;
    const close = () => { wrap.remove(); if (this.ui.sheetKind === 'crates') this.renderCrates(this.body); this.ui.renderMenuBadges?.(); };
    btns.querySelector('.close').addEventListener('click', close);
    btns.querySelector('.again')?.addEventListener('click', () => { wrap.remove(); this.openReel(type); });
    btns.querySelector('.equip')?.addEventListener('click', () => {
      p.equip(wearCls, it.slot, it.id); p.markSeen([it.id]); this.pushLoadout();
      if (wearCls !== p.data.selectedClass) { p.data.selectedClass = wearCls; p.save(); }
      close();
      this.slot = it.slot; this.selected = it.id; this.filter = 'owned';
      this.ui.openSheet('loadout');
    });
    this.ui.wireSounds(btns);
  }

  // ================================================================ CONTRACTS (main menu card)
  renderContracts(el) {
    const p = this.app.profile;
    p.refreshContracts();
    const period = this.period || 'daily';
    const set = p.data.contracts[period];
    const reset = p.contractResetIn()[period];
    el.innerHTML = `<div class="ct-head"><h3>Contracts</h3><div class="seg">${['daily', 'weekly'].map((k) => `<button class="${k === period ? 'on' : ''}" data-p="${k}">${k === 'daily' ? 'Daily' : 'Weekly'}</button>`).join('')}</div><span class="muted small">resets in ${fmtTime(reset)}</span></div>
      ${set.list.map((c) => `<div class="ct ${c.done ? 'done' : ''}"><div class="d">${esc(c.desc)}</div><div class="bar"><i style="width:${(c.progress / c.target) * 100}%"></i><span>${c.done ? 'Complete' : `${c.progress.toLocaleString()} / ${c.target.toLocaleString()}`}</span></div><div class="rw">${c.reward.crate ? crateSVG(c.reward.crate, 18) : ''}<span>+${c.reward.scrap}</span><small>scrap</small></div></div>`).join('')}
      <div class="ct-foot">${p.firstWinAvailable() ? `${crateSVG('silver', 16)} First win of the day bonus available` : '<span class="muted">First win bonus claimed — back tomorrow</span>'}</div>`;
    el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { this.period = b.dataset.p; this.renderContracts(el); }));
  }

  // ================================================================ RESULTS
  rewardsHTML(summary) {
    if (!summary || !summary.rewards) return '';
    const R = summary.rewards;
    if (!R.crates.length && !R.scrap && !R.contracts.length) {
      return '<div class="rewards"><h4>Rewards</h4><p class="note" style="margin:0">Get <b>5+ eliminations</b> in a match to earn a crate.</p></div>';
    }
    return `<div class="rewards"><h4>Rewards</h4>
      ${R.crates.map((c) => `<div class="rw-line">${crateSVG(c.type, 22)}<span><b>${esc(CRATE_BY_ID[c.type].name)}</b> <small class="muted">${esc(c.src)}</small></span></div>`).join('')}
      ${R.contracts.map((c) => `<div class="rw-line ct-done"><span>✔ Contract: ${esc(c.desc)}</span></div>`).join('')}
      ${R.scrap ? `<div class="rw-line"><span>+${R.scrap} scrap</span></div>` : ''}
      ${R.crates.length ? '<div class="row-btns"><button class="btn primary open-crates">Open crates</button></div>' : ''}</div>`;
  }
}
