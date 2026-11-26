// Friends, parties, duel challenges and trades, stored in Firestore next to the account profile.
// Needs a signed-in account with a claimed username (see docs/SOCIAL.md for the security rules).
//
// Data (all small documents):
//   friends/{uid}            { names: { otherUid: username } }   my friend list (I add you, you add me = friends)
//   presence/{uid}           { name, state: 'menu'|'game', join, at }   where I am, refreshed every minute
//   inbox/{uid}/msgs/{id}    { type, from, fromName, at, data }  requests sent to me (only I can read them)
//   parties/{pid}            { leader, members: {uid: name}, invited: {uid: true}, go, at }
//   trades/{tid}             { a, b, aName, bName, aItems, aKeys, aReady, aConfirm, aDone, b..., status, at }
//
// The Firestore API object (F) and database (db) come from Auth, so tests can pass an in-memory fake.
import { applyTrade, checkOffer, cleanOffer, offerOf, sideKeys } from '../../shared/trade.js';

const ONLINE_MS = 150 * 1000;       // presence older than this = offline
const HEARTBEAT_MS = 60 * 1000;
const MSG_TTL_MS = 7 * 86400 * 1000;
export const MSG_TYPES = ['friend', 'friendAccept', 'party', 'duel', 'trade', 'join'];

export class Social {
  /** opts: { F, db, now } for tests; otherwise taken from app.auth once it is ready */
  constructor(app, opts = {}) {
    this.app = app;
    this.opts = opts;
    this.now = opts.now || (() => Date.now());
    this.listeners = new Set();
    this.unsubs = [];
    this.friendUnsubs = new Map();
    this.reset();
    if (app.auth?.on) app.auth.on(() => this.sync());
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { if (this.uid) this.writePresenceOffline(); });
  }

  reset() {
    this.uid = null;
    this.myList = {};          // uid -> name (people I added)
    this.friends = new Map();  // uid -> { uid, name, mutual, presence }
    this.inbox = [];           // [{ id, type, from, fromName, at, data }]
    this.party = null;         // { id, leader, members, invited, go }
    this.trades = new Map();   // tid -> trade doc (+ id)
    this.seenMsgs = new Set();
    this.lastGoAt = 0;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, data) { for (const fn of this.listeners) { try { fn(type, data); } catch (e) { console.error(e); } } }

  get F() { return this.opts.F || this.app.auth?.F; }
  get db() { return this.opts.db || this.app.auth?.db; }
  get user() { return this.opts.user || this.app.auth?.user; }
  get username() { return this.opts.username ?? this.app.auth?.username; }
  // why social features are unavailable (null = available)
  blocker() {
    const a = this.app.auth;
    if (!this.opts.F && (!a || !a.enabled)) return 'Accounts are turned off on this copy of the game.';
    if (!this.opts.F && a.status !== 'ready') return 'Connecting to accounts…';
    if (!this.user) return 'Sign in to add friends, form a party, challenge friends to duels and trade.';
    if (!this.username) return 'Claim a username in Account first: friends find you by it.';
    return null;
  }
  get active() { return !!this.uid; }

  // Start or stop listening when the signed-in account / username changes.
  sync() {
    const want = !this.blocker() ? this.user.uid : null;
    if (want === this.uid) { this.emit('change'); return; }
    this.stop();
    if (want) this.start(want);
    this.emit('change');
  }

  start(uid) {
    const { F, db } = this;
    this.uid = uid;
    const watch = (ref, fn) => this.unsubs.push(F.onSnapshot(ref, fn, (e) => this.fail(e)));
    watch(F.doc(db, 'friends', uid), (snap) => this.onMyList(snap.exists() ? snap.data().names || {} : {}));
    watch(F.query(F.collection(db, 'inbox', uid, 'msgs'), F.orderBy('at')), (snap) => this.onInbox(snap));
    watch(F.query(F.collection(db, 'trades'), F.where('a', '==', uid)), (snap) => this.onTrades(snap, 'a'));
    watch(F.query(F.collection(db, 'trades'), F.where('b', '==', uid)), (snap) => this.onTrades(snap, 'b'));
    let pid = null;
    try { pid = localStorage.getItem(`pf_party_${uid}`); } catch { /* ignore */ }
    if (pid) this.watchParty(pid);
    this.setPresence(this.presenceState || 'menu', this.presenceJoin || null);
    this.beat = setInterval(() => this.setPresence(this.presenceState || 'menu', this.presenceJoin || null), HEARTBEAT_MS);
    this.beat.unref?.(); // (Node tests) never keep the process alive
  }

  stop() {
    if (this.uid) this.writePresenceOffline();
    for (const u of this.unsubs) u();
    for (const u of this.friendUnsubs.values()) u();
    this.partyUnsub?.();
    this.unsubs = []; this.friendUnsubs.clear(); this.partyUnsub = null;
    clearInterval(this.beat);
    this.reset();
  }

  fail(e) {
    console.warn('social:', e);
    this.lastError = e?.code === 'permission-denied'
      ? 'Firestore refused the request. The project owner needs to publish the security rules from docs/SOCIAL.md.'
      : String(e?.message || e);
    this.emit('change');
  }
  async guard(fn) {
    try { return await fn(); } catch (e) { this.fail(e); throw e; }
  }

  // ---------------------------------------------------------------- friends
  onMyList(names) {
    this.myList = names;
    for (const [uid, u] of this.friendUnsubs) if (!names[uid]) { u(); this.friendUnsubs.delete(uid); this.friends.delete(uid); }
    for (const [uid, name] of Object.entries(names)) {
      if (!this.friends.has(uid)) this.friends.set(uid, { uid, name, mutual: false, presence: null });
      else this.friends.get(uid).name = name;
      if (this.friendUnsubs.has(uid)) continue;
      const { F, db } = this;
      const offList = F.onSnapshot(F.doc(db, 'friends', uid), (s) => {
        const f = this.friends.get(uid); if (!f) return;
        f.mutual = !!(s.exists() && s.data().names?.[this.uid]);
        this.emit('change');
      }, () => {});
      const offPres = F.onSnapshot(F.doc(db, 'presence', uid), (s) => {
        const f = this.friends.get(uid); if (!f) return;
        f.presence = s.exists() ? s.data() : null;
        this.emit('change');
      }, () => {});
      this.friendUnsubs.set(uid, () => { offList(); offPres(); });
    }
    this.emit('change');
  }

  status(f) {
    const p = f?.presence;
    if (!f?.mutual) return 'pending';
    if (!p || this.now() - (p.at || 0) > ONLINE_MS || p.state === 'offline') return 'offline';
    return p.state === 'game' ? 'game' : 'online';
  }
  friendList() {
    const order = { game: 0, online: 1, pending: 3, offline: 2 };
    return [...this.friends.values()].sort((a, b) => order[this.status(a)] - order[this.status(b)] || a.name.localeCompare(b.name));
  }

  async lookup(name) {
    const { F, db } = this;
    const key = String(name || '').trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,16}$/.test(key)) throw new Error('Usernames are 3-16 letters, numbers, dots, dashes or underscores.');
    const snap = await F.getDoc(F.doc(db, 'usernames', key));
    if (!snap.exists()) throw new Error(`No player is called "${name}".`);
    return { uid: snap.data().uid, name: snap.data().name };
  }

  async addFriend(name) {
    const u = await this.lookup(name);
    if (u.uid === this.uid) throw new Error('That is you.');
    if (this.myList[u.uid]) throw new Error(this.friends.get(u.uid)?.mutual ? `${u.name} is already your friend.` : `You already sent ${u.name} a request.`);
    // if they already asked me, this simply accepts
    const req = this.inbox.find((m) => m.type === 'friend' && m.from === u.uid);
    if (req) return { ...(await this.acceptFriend(req)), accepted: true };
    await this.guard(async () => {
      await this.F.setDoc(this.F.doc(this.db, 'friends', this.uid), { names: { [u.uid]: u.name } }, { merge: true });
      await this.send(u.uid, 'friend');
    });
    return u;
  }

  async acceptFriend(msg) {
    await this.guard(async () => {
      await this.F.setDoc(this.F.doc(this.db, 'friends', this.uid), { names: { [msg.from]: msg.fromName } }, { merge: true });
      await this.send(msg.from, 'friendAccept');
      await this.dismiss(msg);
    });
    return { uid: msg.from, name: msg.fromName };
  }

  async removeFriend(uid) {
    await this.guard(() => this.F.updateDoc(this.F.doc(this.db, 'friends', this.uid), { [`names.${uid}`]: this.F.deleteField() }));
  }

  // ---------------------------------------------------------------- inbox
  send(to, type, data = null) {
    return this.F.addDoc(this.F.collection(this.db, 'inbox', to, 'msgs'), { type, from: this.uid, fromName: this.username, at: this.now(), data });
  }
  dismiss(msg) { return this.F.deleteDoc(this.F.doc(this.db, 'inbox', this.uid, 'msgs', msg.id)).catch((e) => this.fail(e)); }

  onInbox(snap) {
    const list = [];
    for (const d of snap.docs) {
      const m = { id: d.id, ...d.data() };
      if (!MSG_TYPES.includes(m.type) || this.now() - (m.at || 0) > MSG_TTL_MS) { this.dismiss(m); continue; }
      // acknowledgements are shown once and removed
      if (m.type === 'friendAccept') { if (!this.seenMsgs.has(m.id)) this.emit('message', m); this.dismiss(m); continue; }
      list.push(m);
      if (!this.seenMsgs.has(m.id)) { this.seenMsgs.add(m.id); this.emit('message', m); }
    }
    // a friend request from someone I have already added is an automatic accept
    for (const m of list) if (m.type === 'friend' && this.myList[m.from]) this.dismiss(m);
    this.inbox = list.filter((m) => !(m.type === 'friend' && this.myList[m.from]));
    this.emit('change');
  }
  requestCount() { return this.inbox.length; }

  // ---------------------------------------------------------------- presence
  setPresence(state, join = null) {
    this.presenceState = state; this.presenceJoin = join;
    if (!this.uid) return Promise.resolve();
    return this.F.setDoc(this.F.doc(this.db, 'presence', this.uid), { name: this.username, state, join: join || null, at: this.now() }).catch((e) => this.fail(e));
  }
  writePresenceOffline() {
    try { this.F.setDoc(this.F.doc(this.db, 'presence', this.uid), { name: this.username, state: 'offline', join: null, at: this.now() }).catch(() => {}); } catch { /* ignore */ }
  }

  // ---------------------------------------------------------------- party
  get partyId() { return this.party?.id || null; }
  partySize() { return this.party ? Object.keys(this.party.members || {}).length : 1; }
  isLeader() { return !this.party || this.party.leader === this.uid; }

  watchParty(pid) {
    this.partyUnsub?.();
    const { F, db } = this;
    this.partyUnsub = F.onSnapshot(F.doc(db, 'parties', pid), (snap) => {
      const d = snap.exists() ? snap.data() : null;
      if (!d || !d.members?.[this.uid]) { this.clearParty(d ? 'You were removed from the party.' : 'The party was disbanded.'); return; }
      this.party = { id: pid, ...d };
      try { localStorage.setItem(`pf_party_${this.uid}`, pid); } catch { /* ignore */ }
      if (d.go && d.go.at > this.lastGoAt && d.leader !== this.uid) {
        const first = this.lastGoAt === 0;
        this.lastGoAt = d.go.at;
        // ignore a stale "go" from before we joined (older than 10 minutes)
        if (!first || this.now() - d.go.at < 10 * 60 * 1000) this.emit('partyGo', d.go);
      }
      this.emit('change');
    }, (e) => this.fail(e));
  }

  clearParty(reason) {
    const had = !!this.party;
    this.partyUnsub?.(); this.partyUnsub = null;
    this.party = null; this.lastGoAt = 0;
    try { localStorage.removeItem(`pf_party_${this.uid}`); } catch { /* ignore */ }
    if (had && reason) this.emit('notice', reason);
    this.emit('change');
  }

  async ensureParty() {
    if (this.party) return this.party.id;
    const ref = await this.F.addDoc(this.F.collection(this.db, 'parties'), { leader: this.uid, members: { [this.uid]: this.username }, invited: {}, go: null, at: this.now() });
    this.party = { id: ref.id, leader: this.uid, members: { [this.uid]: this.username }, invited: {}, go: null };
    this.watchParty(ref.id);
    return ref.id;
  }

  async inviteToParty(uid) {
    if (this.party && !this.isLeader()) throw new Error('Only the party leader can invite.');
    if (this.party?.members?.[uid]) throw new Error('Already in your party.');
    await this.guard(async () => {
      const pid = await this.ensureParty();
      await this.F.updateDoc(this.F.doc(this.db, 'parties', pid), { [`invited.${uid}`]: true });
      await this.send(uid, 'party', { pid });
    });
  }

  async acceptParty(msg) {
    const pid = msg.data?.pid;
    await this.guard(async () => {
      const snap = await this.F.getDoc(this.F.doc(this.db, 'parties', pid));
      if (!snap.exists()) { await this.dismiss(msg); throw new Error('That party no longer exists.'); }
      if (this.party && this.party.id !== pid) await this.leaveParty();
      await this.F.updateDoc(this.F.doc(this.db, 'parties', pid), { [`members.${this.uid}`]: this.username });
      await this.dismiss(msg);
      this.lastGoAt = 0;
      this.watchParty(pid);
    });
  }

  async leaveParty() {
    const p = this.party;
    if (!p) return;
    const ref = this.F.doc(this.db, 'parties', p.id);
    const others = Object.keys(p.members || {}).filter((u) => u !== this.uid);
    this.clearParty();
    await this.guard(async () => {
      if (p.leader !== this.uid) await this.F.updateDoc(ref, { [`members.${this.uid}`]: this.F.deleteField() });
      else if (!others.length) await this.F.deleteDoc(ref);
      else await this.F.updateDoc(ref, { leader: others[0], [`members.${this.uid}`]: this.F.deleteField() });
    });
  }

  async kickFromParty(uid) {
    if (!this.party || !this.isLeader()) return;
    await this.guard(() => this.F.updateDoc(this.F.doc(this.db, 'parties', this.party.id), { [`members.${uid}`]: this.F.deleteField(), [`invited.${uid}`]: this.F.deleteField() }));
  }

  // The leader joined a match: tell party members where (they follow automatically).
  partyGo(join) {
    if (!this.party || !this.isLeader() || this.partySize() < 2 || !join) return Promise.resolve();
    return this.F.updateDoc(this.F.doc(this.db, 'parties', this.party.id), { go: { ...join, at: this.now() } }).catch((e) => this.fail(e));
  }

  // ---------------------------------------------------------------- duel challenges / match invites
  challenge(uid, join) { return this.guard(() => this.send(uid, 'duel', join)); }
  inviteToMatch(uid, join) { return this.guard(() => this.send(uid, 'join', join)); }

  // ---------------------------------------------------------------- trades
  onTrades(snap, side) {
    for (const [id, t] of this.trades) if (t.mySide === side) this.trades.delete(id);
    for (const d of snap.docs) {
      const t = { id: d.id, ...d.data(), mySide: side };
      if (t.status !== 'open' && this.now() - (t.at || 0) > 3600 * 1000) continue;
      this.trades.set(d.id, t);
      this.maybeFinish(t);
    }
    this.emit('change');
  }
  trade(tid) { return this.trades.get(tid) || null; }
  openTrades() { return [...this.trades.values()].filter((t) => t.status === 'open'); }

  async startTrade(uid, name) {
    const existing = this.openTrades().find((t) => (t.a === uid || t.b === uid));
    if (existing) return existing.id;
    let id;
    await this.guard(async () => {
      const ref = await this.F.addDoc(this.F.collection(this.db, 'trades'), {
        a: this.uid, b: uid, aName: this.username, bName: name, aItems: [], aKeys: 0, bItems: [], bKeys: 0,
        aReady: false, bReady: false, aConfirm: false, bConfirm: false, aDone: false, bDone: false, status: 'open', at: this.now(),
      });
      id = ref.id;
      await this.send(uid, 'trade', { tid: id });
    });
    return id;
  }

  side(t) { return t.a === this.uid ? 'a' : 'b'; }
  other(t) { return t.a === this.uid ? 'b' : 'a'; }

  // Change my offer. Clears everyone's ready / confirm flags so nobody agrees to a deal that changed.
  async setOffer(tid, offer) {
    const t = this.trade(tid); if (!t || t.status !== 'open') return;
    const me = sideKeys(this.side(t)), them = sideKeys(this.other(t));
    const o = cleanOffer(offer);
    const chk = checkOffer(o, this.app.profile.data);
    if (!chk.ok) throw new Error(chk.reason);
    await this.guard(() => this.F.updateDoc(this.F.doc(this.db, 'trades', tid), {
      [me.items]: o.items, [me.keys]: o.keys, [me.ready]: false, [me.confirm]: false, [them.ready]: false, [them.confirm]: false, at: this.now(),
    }));
  }

  async setReady(tid, ready) {
    const t = this.trade(tid); if (!t || t.status !== 'open') return;
    const me = sideKeys(this.side(t));
    if (ready) { const chk = checkOffer(offerOf(t, this.side(t)), this.app.profile.data); if (!chk.ok) throw new Error(chk.reason); }
    await this.guard(() => this.F.updateDoc(this.F.doc(this.db, 'trades', tid), { [me.ready]: !!ready, [me.confirm]: false, at: this.now() }));
  }

  async confirm(tid) {
    const t = this.trade(tid); if (!t || t.status !== 'open') return;
    if (!t.aReady || !t.bReady) throw new Error('Both players must be ready first.');
    const chk = checkOffer(offerOf(t, this.side(t)), this.app.profile.data);
    if (!chk.ok) throw new Error(chk.reason);
    await this.guard(() => this.F.updateDoc(this.F.doc(this.db, 'trades', tid), { [sideKeys(this.side(t)).confirm]: true, at: this.now() }));
  }

  async cancelTrade(tid) {
    const t = this.trade(tid); if (!t || t.status !== 'open') return;
    await this.guard(() => this.F.updateDoc(this.F.doc(this.db, 'trades', tid), { status: 'cancelled', at: this.now() }));
  }

  // Both confirmed: apply my half of the swap to my own profile (once), then mark my side done.
  async maybeFinish(t) {
    if (t.status !== 'open' || !t.aConfirm || !t.bConfirm) return;
    const side = t.mySide, other = side === 'a' ? 'b' : 'a';
    const done = sideKeys(side).done;
    if (t[done]) {
      if (t[sideKeys(other).done] && t.status === 'open') this.F.updateDoc(this.F.doc(this.db, 'trades', t.id), { status: 'complete', at: this.now() }).catch(() => {});
      return;
    }
    if (this.finishing?.has(t.id)) return;
    (this.finishing ||= new Set()).add(t.id);
    const prof = this.app.profile;
    const res = applyTrade(prof.data, t.id, offerOf(t, side), offerOf(t, other));
    if (!res.ok) {
      // cannot give what was offered any more: call the trade off instead
      this.finishing.delete(t.id);
      this.F.updateDoc(this.F.doc(this.db, 'trades', t.id), { status: 'cancelled', at: this.now() }).catch(() => {});
      this.emit('notice', res.reason);
      return;
    }
    if (!res.already) {
      prof.normalizeLoadouts?.();
      prof.save?.();
    }
    try {
      const upd = { [done]: true, at: this.now() };
      if (t[sideKeys(other).done]) upd.status = 'complete';
      await this.F.updateDoc(this.F.doc(this.db, 'trades', t.id), upd);
    } catch (e) { this.fail(e); }
    this.finishing.delete(t.id);
    if (!res.already) this.emit('tradeDone', { trade: t, ...res });
  }
}
