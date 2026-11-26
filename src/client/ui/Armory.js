// Armory: per-class loadout & inventory browser (weapons inspector, cosmetic slots, item preview).
// Driven by Profile. Item acquisition is not implemented yet; locked items can still be previewed.
import { CLASS_IDS, CLASSES, getClass } from '../../shared/config/classes.js';
import { WEAPONS } from '../../shared/config/weapons.js';
import { ITEMS, RARITIES, SLOTS, SLOT_NAMES, getItem, canWear } from '../../shared/config/cosmetics.js';
import { ItemIcons, bannerCSS } from '../render/ItemIcons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PAGE = 48;

export function rarityChip(r) {
  const R = RARITIES[r];
  return `<span class="rar r${r}">${esc(R.name)}</span>`;
}

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
      <div class="ar-sub"><b>${esc(cls.displayName)}</b> loadout <span class="muted">· ${col.owned} / ${col.total} items collected</span></div>
      <div class="ar-slots">
        <button class="${slot === 'weapons' ? 'on' : ''}" data-s="weapons"><span>Weapons</span><small>${(cls.arsenal || []).flat().length || 3} choices</small></button>
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
    const main = body.querySelector('.ar-main');
    if (slot === 'weapons') this.renderWeapons(main, cls);
    else this.renderItems(main, clsId);
  }

  renderWeapons(main, cls) {
    const icons = this.app.icons;
    const ui = this.ui;
    const p = this.app.profile;
    const picks = p.weaponsFor(cls.id);
    const arsenal = cls.arsenal || cls.weapons.map((w) => [w]);
    ui.inspectW = ui.inspectW && arsenal.flat().includes(ui.inspectW) ? ui.inspectW : picks[0];
    const d = WEAPONS[ui.inspectW];
    const stat = (k, v) => `<div>${k}: <b>${v}</b></div>`;
    const dps = d.type === 'melee' || d.type === 'hitscan' || d.type === 'projectile' || d.type === 'flame' ? Math.round(d.damage * d.pellets / d.fireInterval) : 0;
    main.innerHTML = `
      ${arsenal.map((list, slot) => `
        <div class="wl-slot"><h4>${['Primary', 'Secondary', 'Melee'][slot]}</h4>
          <div class="wl-row">${list.map((w) => `<button class="weap ${picks[slot] === w ? 'sel' : ''} ${ui.inspectW === w ? 'insp' : ''}" data-w="${w}" data-slot="${slot}"><img src="${icons.weapons[w]}" alt=""><div class="nm">${esc(WEAPONS[w].name)}</div><div class="d">${esc(WEAPONS[w].category)}${picks[slot] === w ? ' · Equipped' : ''}</div></button>`).join('')}</div>
        </div>`).join('')}
      <div class="wl-desc"><b>${esc(d.name)}</b> ${esc(d.description || '')}</div>
      <div class="weapon-stats">${stat('Damage', d.pellets > 1 ? `${d.damage} × ${d.pellets}` : d.type === 'beam' ? `${d.beam.healRate} HP/s heal` : d.damage)}${dps ? stat('Damage / sec', dps) : ''}${stat('Fire rate', `${(1 / d.fireInterval).toFixed(1)}/s`)}${d.clip > 0 ? stat('Magazine', `${d.clip} + ${d.reserve}`) : stat('Ammo', d.clip < 0 ? 'Unlimited' : '—')}${d.clip > 0 ? stat('Reload', `${d.reloadMode === 'single' ? `${d.reloadTime}s / round` : `${d.reloadTime}s`}`) : ''}${d.type === 'hitscan' ? stat('Effective range', `${d.effectiveRange} m`) : ''}${d.headshotMult > 1 ? stat('Headshot', `×${d.headshotMult}`) : ''}${d.knockback ? stat('Knockback', 'Yes') : ''}${d.projectile ? stat('Projectile speed', `${d.projectile.speed} m/s`) : ''}${d.projectile?.explode ? stat('Blast radius', `${d.projectile.explode.radius} m`) : ''}${d.melee ? stat('Reach', `${d.melee.range} m`) : ''}${stat('Switch time', `${d.deployTime}s`)}</div>
      <p class="note">Click a weapon to equip it. Changes apply the next time you spawn. Cosmetics never change stats.</p>`;
    main.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => {
      const w = b.dataset.w, slot = +b.dataset.slot;
      ui.inspectW = w;
      if (p.setWeapon(cls.id, slot, w)) this.app.game?.net.send({ t: 'wpn', weapons: p.weaponsPayload() });
      ui.previewWeapon = w; ui.updateShowcase(-1.6);
      this.renderWeapons(main, cls); ui.wireSounds(main);
    }));
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
      }).join('') : `<div class="empty">${this.filter === 'owned' ? 'No items in this slot yet. Switch to <b>All</b> to preview every item.' : 'Nothing matches.'}</div>`}</div>
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
  }

  detailHTML(it, clsId, equipped) {
    const p = this.app.profile;
    const own = p.owns(it.id);
    const who = it.classes ? `${it.classes.map((c) => esc(getClass(c).displayName)).join(', ')} only` : 'All classes';
    return `<div class="det r${it.rarity}">${this.thumb(it, clsId)}<div class="txt"><b>${esc(it.name)}</b><div>${rarityChip(it.rarity)} <span class="muted">${esc(SLOT_NAMES[it.slot].replace(/s$/, ''))} · ${who}${it.fx ? ` · ${{ shine: 'Polished', glow: 'Glowing', rainbow: 'Iridescent shimmer', flame: 'Burning' }[it.fx]}` : ''}</span></div>
      <div class="muted small">${own ? (it.id === equipped ? 'Equipped' : 'Owned') : 'Not owned yet. Previewing.'}</div></div>
      <div class="acts">${own && it.id === equipped && !['weaponSkin', 'victoryPose', 'elimEffect', 'banner'].includes(it.slot) ? '<button class="btn small unequip">Unequip</button>' : ''}</div></div>`;
  }

  preview(it) {
    const ui = this.ui;
    ui.updateShowcase(-1.6);
    const rig = this.app.renderer.showcase.rigs[0];
    if (!rig) return;
    if (it.slot === 'victoryPose') { rig.anim.pose = it.id; clearTimeout(this.poseT); this.poseT = setTimeout(() => { const r = this.app.renderer.showcase.rigs[0]; if (r) r.anim.pose = null; }, 3500); }
  }
}
