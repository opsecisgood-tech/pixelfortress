// Friends panel (add by username, requests, friend list, party) and the trade window.
import { getItem, RARITIES } from '../../shared/config/cosmetics.js';
import { MODES } from '../../shared/config/modes.js';
import { isTradeable, offerOf, TRADE_LIMITS } from '../../shared/trade.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS_TEXT = { online: 'In the menus', game: 'In a match', offline: 'Offline', pending: 'Request sent' };
const MSG_TEXT = {
  friend: (n) => `<b>${n}</b> wants to be your friend`,
  friendAccept: (n) => `<b>${n}</b> accepted your friend request`,
  party: (n) => `<b>${n}</b> invited you to their party`,
  duel: (n, m) => `<b>${n}</b> challenged you to a ${esc(MODES[m.data?.mode]?.name || '1v1 Duel')}`,
  trade: (n) => `<b>${n}</b> wants to trade`,
  join: (n) => `<b>${n}</b> invited you to their match`,
};

export class SocialUI {
  constructor(ui) {
    this.ui = ui;
    this.app = ui.app;
    this.s = this.app.social;
    this.s.on((type, d) => this.onEvent(type, d));
  }

  onEvent(type, d) {
    const ui = this.ui;
    if (type === 'change') {
      this.updateBadge();
      if (ui.sheetKind === 'friends') this.refresh();
      if (ui.sheetKind === 'trade') this.refreshTrade();
    } else if (type === 'message') {
      const t = MSG_TEXT[d.type]?.(esc(d.fromName), d);
      if (t) ui.toast(`${t}${d.type === 'friendAccept' ? '' : ' · <u>open Friends</u>'}`, 9000, d.type === 'friendAccept' ? null : () => this.open());
      this.app.audio?.uiClick?.();
    } else if (type === 'partyGo') {
      if (this.app.state === 'menu' && !ui.resultsEl) {
        ui.toast('Joining your party leader…', 5000);
        this.app.joinFromInfo(d).catch((e) => ui.toast(`Could not follow the party: ${esc(e.message || e)}`, 7000));
      } else ui.toast('Your party leader started another match · <u>open Friends</u> to follow', 9000, () => this.open());
    } else if (type === 'tradeDone') {
      const n = d.received.length, dup = d.duplicates.length;
      ui.toast(`Trade complete${n ? `: ${n} new item${n > 1 ? 's' : ''}` : ''}${dup ? ` (${dup} you already owned)` : ''}.`, 7000);
      ui.renderProfileCard?.();
      ui.menuEl?.querySelector('.tm-keys') && (ui.menuEl.querySelector('.tm-keys').textContent = this.app.profile.keys ? `${this.app.profile.keys}` : '');
    } else if (type === 'notice') ui.toast(esc(d), 7000);
  }

  open() {
    if (this.app.state === 'game' && !this.ui.menuOpen) this.app.input?.exitLock?.();
    this.ui.openSheet('friends');
  }

  updateBadge() {
    const n = this.s.requestCount();
    document.querySelectorAll('.tm-friends .tm-badge').forEach((b) => { b.textContent = n ? String(n) : ''; b.style.display = n ? '' : 'none'; });
  }

  // ---------------------------------------------------------------- friends panel
  render(body) {
    this.body = body;
    const block = this.s.blocker();
    if (block) {
      body.innerHTML = `<p class="note" style="margin-bottom:14px">${esc(block)}</p>${this.app.auth?.enabled ? '<button class="btn primary acct">Open Account</button>' : ''}
        <p class="note" style="margin-top:14px">You can still play 1v1 and 2v2 without an account: pick <b>1v1 Duel</b> or <b>2v2 Duel</b> in Find game.</p>`;
      body.querySelector('.acct')?.addEventListener('click', () => this.ui.openSheet('account'));
      return;
    }
    body.innerHTML = `
      <div class="soc">
        <div class="soc-col">
          <div class="soc-add"><input class="input fn" maxlength="16" placeholder="Friend's username" autocomplete="off"><button class="btn primary add">Add friend</button></div>
          <div class="status-line add-st"></div>
          <div class="soc-req"></div>
          <h3 class="soc-h">Friends <span class="muted fc"></span></h3>
          <div class="soc-list"></div>
        </div>
        <div class="soc-col">
          <h3 class="soc-h">Party</h3>
          <div class="soc-party plate thin"></div>
          <div class="soc-trades"></div>
          <p class="note soc-me">Your username: <b>${esc(this.s.username)}</b>. Friends add you by this name.</p>
          <div class="status-line err soc-err"></div>
        </div>
      </div>`;
    const inp = body.querySelector('.fn'), st = body.querySelector('.add-st');
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') add(); });
    const add = async () => {
      const name = inp.value.trim();
      if (!name) return;
      st.className = 'status-line add-st'; st.textContent = 'Sending…';
      try { const u = await this.s.addFriend(name); st.className = 'status-line add-st ok'; st.textContent = u?.accepted ? `You and ${u.name} are now friends.` : `Request sent to ${u.name}.`; inp.value = ''; }
      catch (e) { st.className = 'status-line add-st err'; st.textContent = e.message || String(e); }
    };
    body.querySelector('.add').addEventListener('click', add);
    this.refresh();
  }

  act(btn, fn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await fn(); } catch (e) { this.ui.toast(esc(e.message || e), 6000); }
      btn.disabled = false;
    });
  }

  refresh() {
    const body = this.body;
    if (!body || !body.isConnected || !body.querySelector('.soc')) { if (body?.isConnected) this.render(body); return; }
    const s = this.s;
    // requests
    const req = body.querySelector('.soc-req');
    req.innerHTML = s.inbox.length ? `<h3 class="soc-h">Requests</h3>${s.inbox.map((m) => `<div class="soc-row req" data-id="${esc(m.id)}"><span>${MSG_TEXT[m.type]?.(esc(m.fromName), m) || esc(m.type)}</span><span class="soc-btns"><button class="btn small primary ok">${m.type === 'friend' ? 'Accept' : m.type === 'trade' ? 'Open' : 'Join'}</button><button class="btn small no">Decline</button></span></div>`).join('')}` : '';
    req.querySelectorAll('.req').forEach((row) => {
      const m = s.inbox.find((x) => x.id === row.dataset.id);
      this.act(row.querySelector('.ok'), async () => {
        if (m.type === 'friend') await s.acceptFriend(m);
        else if (m.type === 'party') { await s.acceptParty(m); this.ui.toast(`You joined <b>${esc(m.fromName)}</b>'s party.`); }
        else if (m.type === 'trade') { await s.dismiss(m); this.ui.openSheet('trade', { tid: m.data?.tid }); }
        else if (m.type === 'duel' || m.type === 'join') { await s.dismiss(m); this.ui.closeSheet(); await this.app.joinFromInfo(m.data); }
      });
      this.act(row.querySelector('.no'), async () => {
        if (m.type === 'trade' && m.data?.tid && s.trade(m.data.tid)) await s.cancelTrade(m.data.tid).catch(() => {});
        await s.dismiss(m);
      });
    });
    // friend list
    const list = s.friendList();
    body.querySelector('.fc').textContent = list.length ? `(${list.filter((f) => ['online', 'game'].includes(s.status(f))).length} online)` : '';
    const L = body.querySelector('.soc-list');
    L.innerHTML = list.length ? list.map((f) => {
      const st = s.status(f), join = f.presence?.join;
      const inParty = !!s.party?.members?.[f.uid];
      return `<div class="soc-row fr" data-uid="${esc(f.uid)}"><i class="dot ${st}"></i><span class="nm"><b>${esc(f.name)}</b><small>${STATUS_TEXT[st]}${st === 'game' && join?.mode ? ` · ${esc(MODES[join.mode]?.name || '')}` : ''}</small></span>
        <span class="soc-btns">${f.mutual ? `
          ${st === 'game' && join ? '<button class="btn small primary jn" title="Join their match">Join</button>' : ''}
          ${inParty ? '<span class="muted small">In party</span>' : `<button class="btn small pt" title="Invite to party">Party</button>`}
          <button class="btn small du" title="Challenge to a 1v1 duel">1v1</button>
          <button class="btn small tr" title="Trade items and keys">Trade</button>` : ''}
          <button class="btn small ghost rm" title="Remove friend">✕</button></span></div>`;
    }).join('') : '<p class="note">No friends yet. Add someone by their username above.</p>';
    L.querySelectorAll('.fr').forEach((row) => {
      const f = s.friends.get(row.dataset.uid);
      const b = (sel, fn) => { const el = row.querySelector(sel); if (el) this.act(el, fn); };
      b('.jn', async () => { this.ui.closeSheet(); await this.app.joinFromInfo(f.presence.join); });
      b('.pt', async () => { await s.inviteToParty(f.uid); this.ui.toast(`Party invite sent to <b>${esc(f.name)}</b>.`); });
      b('.du', async () => { this.ui.closeSheet(); await this.app.challengeFriend(f.uid, f.name, 'duel1'); });
      b('.tr', async () => { const tid = await s.startTrade(f.uid, f.name); this.ui.openSheet('trade', { tid }); });
      b('.rm', async () => { if (confirm(`Remove ${f.name} from your friends?`)) await s.removeFriend(f.uid); });
    });
    // party
    const P = body.querySelector('.soc-party');
    const party = s.party, leader = s.isLeader(), size = s.partySize();
    const members = party ? Object.entries(party.members || {}) : [[s.uid, s.username]];
    P.innerHTML = `
      <div class="soc-members">${members.map(([uid, name]) => `<div class="soc-row"><span class="nm"><b>${esc(name)}</b><small>${(party ? party.leader === uid : true) ? 'Leader' : 'Member'}${uid === s.uid ? ' (you)' : ''}</small></span>${party && leader && uid !== s.uid ? `<button class="btn small ghost kick" data-uid="${esc(uid)}">Remove</button>` : ''}</div>`).join('')}</div>
      <p class="note">${party ? (leader ? 'When you start or join an online match, your party follows you in.' : 'You follow the leader into their matches automatically.') : 'Invite friends from your list to play together. Parties stay on the same team.'}</p>
      <div class="row-btns">
        ${leader ? `<button class="btn primary q2" ${size > 2 ? 'disabled title="2v2 fits a party of up to 2"' : ''}>Queue 2v2</button><button class="btn q1" ${size > 1 ? 'disabled title="1v1 is for one player"' : ''}>Queue 1v1</button>` : ''}
        ${party && !leader && party.go ? '<button class="btn primary fol">Join leader</button>' : ''}
        ${party ? '<button class="btn red lv">Leave party</button>' : ''}
      </div>`;
    P.querySelectorAll('.kick').forEach((k) => this.act(k, () => s.kickFromParty(k.dataset.uid)));
    const pb = (sel, fn) => { const el = P.querySelector(sel); if (el) this.act(el, fn); };
    pb('.q2', async () => { this.ui.closeSheet(); await this.app.queueMode('duel2'); });
    pb('.q1', async () => { this.ui.closeSheet(); await this.app.queueMode('duel1'); });
    pb('.fol', async () => { this.ui.closeSheet(); await this.app.joinFromInfo(party.go); });
    pb('.lv', () => s.leaveParty());
    // open trades
    const T = body.querySelector('.soc-trades');
    const trades = s.openTrades();
    T.innerHTML = trades.length ? `<h3 class="soc-h">Open trades</h3>${trades.map((t) => `<div class="soc-row" data-tid="${esc(t.id)}"><span class="nm"><b>${esc(t.a === s.uid ? t.bName : t.aName)}</b><small>${t.aReady && t.bReady ? 'Both ready' : 'Negotiating'}</small></span><button class="btn small primary op">Open</button></div>`).join('')}` : '';
    T.querySelectorAll('[data-tid]').forEach((row) => row.querySelector('.op').addEventListener('click', () => this.ui.openSheet('trade', { tid: row.dataset.tid })));
    body.querySelector('.soc-err').textContent = s.lastError || '';
  }

  // ---------------------------------------------------------------- trade window
  renderTrade(body, tid) {
    this.tbody = body; this.tid = tid; this.filter = '';
    body.innerHTML = `
      <div class="trade">
        <div class="tr-side mine"><h3>You give</h3><div class="tr-items"></div><label class="note tr-k">Keys <input type="number" class="input tk" min="0" max="${TRADE_LIMITS.maxKeys}" step="1" value="0"> <span class="muted have"></span></label><div class="tr-flag"></div></div>
        <div class="tr-side theirs"><h3 class="th"></h3><div class="tr-items"></div><div class="note tr-k tk2"></div><div class="tr-flag"></div></div>
      </div>
      <div class="row-btns tr-btns"><button class="btn primary rd"></button><button class="btn cf">Confirm trade</button><button class="btn red cx">Cancel trade</button></div>
      <div class="status-line tr-st"></div>
      <h3 class="soc-h">Your tradeable items <input class="input tf" placeholder="Search" style="width:200px;margin-left:10px"></h3>
      <div class="tr-inv"></div>`;
    const keys = body.querySelector('.tk');
    keys.addEventListener('keydown', (e) => e.stopPropagation());
    keys.addEventListener('change', () => this.offer({ keys: +keys.value }));
    const tf = body.querySelector('.tf');
    tf.addEventListener('keydown', (e) => e.stopPropagation());
    tf.addEventListener('input', () => { this.filter = tf.value.toLowerCase(); this.refreshTrade(true); });
    this.act(body.querySelector('.rd'), () => { const t = this.s.trade(this.tid); const me = this.s.side(t); return this.s.setReady(this.tid, !t[`${me}Ready`]); });
    this.act(body.querySelector('.cf'), () => this.s.confirm(this.tid));
    this.act(body.querySelector('.cx'), async () => { await this.s.cancelTrade(this.tid); this.ui.openSheet('friends'); });
    this.refreshTrade(true);
  }

  async offer(change) {
    const t = this.s.trade(this.tid); if (!t) return;
    const cur = offerOf(t, this.s.side(t));
    try { await this.s.setOffer(this.tid, { ...cur, ...change }); } catch (e) { this.setTradeStatus(e.message || String(e), 'err'); }
  }
  setTradeStatus(text, cls = '') { const el = this.tbody?.querySelector('.tr-st'); if (el) { el.className = `status-line tr-st ${cls}`; el.textContent = text; } }

  itemTile(id, extra = '') {
    const it = getItem(id); if (!it) return '';
    return `<button class="tr-it r${it.rarity}" data-id="${esc(id)}" title="${esc(`${it.name} · ${RARITIES[it.rarity].name}`)}">${this.ui.armory.thumb(it, it.classes?.[0])}<span>${esc(it.name)}</span>${extra}</button>`;
  }

  refreshTrade(full = false) {
    const body = this.tbody;
    if (!body?.isConnected) return;
    const s = this.s, t = s.trade(this.tid);
    if (!t) { body.querySelector('.tr-st').textContent = 'Loading trade…'; return; }
    const me = s.side(t), them = s.other(t);
    const mine = offerOf(t, me), theirs = offerOf(t, them);
    const inv = this.app.profile.data.inventory;
    const theirName = me === 'a' ? t.bName : t.aName;
    body.querySelector('.th').textContent = `${theirName} gives`;
    body.querySelector('.mine .tr-items').innerHTML = mine.items.map((id) => this.itemTile(id, '<i class="x">✕</i>')).join('') || '<p class="note">Click your items below to offer them.</p>';
    body.querySelector('.theirs .tr-items').innerHTML = theirs.items.map((id) => this.itemTile(id, inv[id] && t.status === 'open' ? '<i class="own">owned</i>' : '')).join('') || `<p class="note">${esc(theirName)} has not offered anything yet.</p>`;
    const keys = body.querySelector('.tk');
    if (document.activeElement !== keys) keys.value = mine.keys;
    body.querySelector('.have').textContent = `(you have ${this.app.profile.keys})`;
    body.querySelector('.tk2').textContent = theirs.keys ? `+ ${theirs.keys} key${theirs.keys > 1 ? 's' : ''}` : '';
    const flag = (side) => (t[`${side}Confirm`] ? '<b class="good">Confirmed</b>' : t[`${side}Ready`] ? '<b class="good">Ready</b>' : '<span class="muted">Not ready</span>');
    body.querySelector('.mine .tr-flag').innerHTML = flag(me);
    body.querySelector('.theirs .tr-flag').innerHTML = flag(them);
    const open = t.status === 'open';
    const rd = body.querySelector('.rd'), cf = body.querySelector('.cf');
    rd.textContent = t[`${me}Ready`] ? 'Not ready' : 'Ready';
    rd.disabled = !open; cf.disabled = !open || !t.aReady || !t.bReady || t[`${me}Confirm`];
    body.querySelector('.cx').disabled = !open;
    body.querySelector('.tk').disabled = !open;
    if (t.status === 'complete') this.setTradeStatus('Trade complete. The items are in your inventory.', 'ok');
    else if (t.status === 'cancelled') this.setTradeStatus('This trade was cancelled.', 'err');
    else if (t[`${me}Confirm`] && !t[`${them}Confirm`]) this.setTradeStatus(`Waiting for ${theirName} to confirm…`);
    else if (t.aReady && t.bReady) this.setTradeStatus('Both ready. Check the offer, then confirm.', 'ok');
    else this.setTradeStatus('Any change to an offer resets Ready for both players.');
    body.querySelectorAll('.mine .tr-it').forEach((el) => el.addEventListener('click', () => open && this.offer({ items: mine.items.filter((x) => x !== el.dataset.id) })));
    {
      const own = Object.keys(inv).filter((id) => isTradeable(id, inv) && !mine.items.includes(id)).map(getItem)
        .filter((it) => !this.filter || it.name.toLowerCase().includes(this.filter))
        .sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));
      const grid = body.querySelector('.tr-inv');
      grid.innerHTML = own.length ? own.slice(0, 120).map((it) => this.itemTile(it.id)).join('') : '<p class="note">No tradeable items. (The free starter items cannot be traded.)</p>';
      grid.querySelectorAll('.tr-it').forEach((el) => el.addEventListener('click', () => {
        if (!open) return;
        if (mine.items.length >= TRADE_LIMITS.maxItems) { this.setTradeStatus(`Up to ${TRADE_LIMITS.maxItems} items per trade.`, 'err'); return; }
        this.offer({ items: [...mine.items, el.dataset.id] });
      }));
    }
  }
}
