// Friends, parties and trades against an in-memory Firestore that enforces the published rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeStore } from './helpers/fakeFirestore.js';
import { Social } from '../src/client/social/Social.js';
import { applyTrade, isTradeable } from '../src/shared/trade.js';
import { ITEMS, STARTER_ITEMS } from '../src/shared/config/cosmetics.js';

function world() {
  const store = new FakeStore();
  const mk = (uid, username, inv = {}, keys = 0) => {
    store.docs.set(`usernames/${username.toLowerCase()}`, { uid, name: username });
    const profile = { data: { inventory: { ...inv }, keys, newItems: [] }, saved: 0, save() { this.saved++; }, normalizeLoadouts() {} };
    const s = new Social({ profile }, { F: store.client(uid), db: {}, user: { uid }, username });
    s.messages = []; s.gos = []; s.done = [];
    s.on((type, d) => { if (type === 'message') s.messages.push(d); if (type === 'partyGo') s.gos.push(d); if (type === 'tradeDone') s.done.push(d); });
    s.sync();
    return s;
  };
  return { store, mk };
}
const tradeItems = ITEMS.filter((it) => it.slot === 'hat' && !STARTER_ITEMS.includes(it.id)).slice(0, 3).map((it) => it.id);

test('social: add a friend by username, accept, see them online', async () => {
  const { store, mk } = world();
  const alice = mk('ua', 'Alice'), bob = mk('ub', 'Bob');
  await store.settle();
  await assert.rejects(alice.addFriend('nobody_here'), /No player/);
  await assert.rejects(alice.addFriend('alice'), /That is you/);
  await alice.addFriend('bob');
  await store.settle();
  assert.equal(alice.status(alice.friends.get('ub')), 'pending');
  assert.equal(bob.inbox.length, 1);
  assert.equal(bob.inbox[0].type, 'friend');
  assert.equal(bob.inbox[0].fromName, 'Alice');
  await assert.rejects(alice.addFriend('Bob'), /already sent/);
  await bob.acceptFriend(bob.inbox[0]);
  await store.settle();
  assert.equal(bob.inbox.length, 0);
  assert.equal(alice.friends.get('ub').mutual, true);
  assert.equal(bob.friends.get('ua').mutual, true);
  assert.equal(alice.status(alice.friends.get('ub')), 'online');
  assert.ok(alice.messages.some((m) => m.type === 'friendAccept'));
  await bob.setPresence('game', { kind: 'p2p', code: 'ABCDE' });
  await store.settle();
  assert.equal(alice.status(alice.friends.get('ub')), 'game');
  assert.equal(alice.friends.get('ub').presence.join.code, 'ABCDE');
  // adding someone who already asked you accepts instead of sending a second request
  const carol = mk('uc', 'Carol');
  await store.settle();
  await carol.addFriend('Alice');
  await store.settle();
  await alice.addFriend('carol');
  await store.settle();
  assert.equal(carol.friends.get('ua').mutual, true);
  await alice.removeFriend('ub');
  await store.settle();
  assert.equal(alice.friends.has('ub'), false);
  assert.equal(bob.friends.get('ua').mutual, false, 'removing breaks the friendship for both');
  assert.deepEqual(store.denied, []);
});

test('social: party invite, follow the leader, leave, and rules keep strangers out', async () => {
  const { store, mk } = world();
  const alice = mk('ua', 'Alice'), bob = mk('ub', 'Bob'), carol = mk('uc', 'Carol');
  await store.settle();
  await alice.inviteToParty('ub');
  await store.settle();
  assert.equal(alice.partySize(), 1);
  const inv = bob.inbox.find((m) => m.type === 'party');
  assert.ok(inv);
  // not invited: carol cannot join by writing herself in
  await assert.rejects(store.client('uc').updateDoc({ path: `parties/${alice.partyId}` }, { 'members.uc': 'Carol' }), /permission/);
  store.denied.length = 0;
  await bob.acceptParty(inv);
  await store.settle();
  assert.equal(alice.partySize(), 2);
  assert.equal(bob.partyId, alice.partyId);
  assert.equal(bob.isLeader(), false);
  await assert.rejects(bob.inviteToParty('uc'), /leader/);
  await alice.partyGo({ kind: 'ws', server: 'wss://example.test/ws', room: '7', mode: 'duel2' });
  await store.settle();
  assert.equal(bob.gos.length, 1);
  assert.equal(bob.gos[0].room, '7');
  // leader leaves: leadership passes on
  await alice.leaveParty();
  await store.settle();
  assert.equal(alice.party, null);
  assert.equal(bob.isLeader(), true);
  assert.equal(bob.partySize(), 1);
  await bob.leaveParty();
  await store.settle();
  assert.equal([...store.docs.keys()].filter((k) => k.startsWith('parties/')).length, 0, 'empty party deleted');
  void carol;
  assert.deepEqual(store.denied, []);
});

test('social: trade items and keys, with ready/confirm reset on changes', async () => {
  const { store, mk } = world();
  const [x, y, z] = tradeItems;
  const alice = mk('ua', 'Alice', { [x]: 1, [z]: 1 }, 0), bob = mk('ub', 'Bob', { [y]: 1 }, 4);
  await store.settle();
  const tid = await alice.startTrade('ub', 'Bob');
  await store.settle();
  assert.ok(bob.inbox.some((m) => m.type === 'trade' && m.data.tid === tid));
  assert.ok(bob.trade(tid));
  await assert.rejects(alice.setOffer(tid, { items: [STARTER_ITEMS[0]] }), /no longer own/);
  await assert.rejects(alice.setOffer(tid, { items: [y] }), /no longer own/, 'cannot offer what you do not own');
  await alice.setOffer(tid, { items: [x] });
  await bob.setOffer(tid, { items: [y], keys: 3 });
  await store.settle();
  await alice.setReady(tid, true);
  await bob.setReady(tid, true);
  await store.settle();
  // alice changes her offer: both ready flags drop
  await alice.setOffer(tid, { items: [x, z] });
  await store.settle();
  assert.equal(bob.trade(tid).aReady, false);
  assert.equal(bob.trade(tid).bReady, false);
  await assert.rejects(alice.confirm(tid), /ready/);
  // bob cannot touch alice's side
  await assert.rejects(store.client('ub').updateDoc({ path: `trades/${tid}` }, { aItems: [] }), /permission/);
  store.denied.length = 0;
  await alice.setReady(tid, true);
  await bob.setReady(tid, true);
  await store.settle();
  await alice.confirm(tid);
  await bob.confirm(tid);
  await store.settle(20);
  const A = alice.app.profile.data, B = bob.app.profile.data;
  assert.ok(A.inventory[y] && !A.inventory[x] && !A.inventory[z]);
  assert.ok(B.inventory[x] && B.inventory[z] && !B.inventory[y]);
  assert.equal(A.keys, 3);
  assert.equal(B.keys, 1);
  assert.equal(store.docs.get(`trades/${tid}`).status, 'complete');
  assert.equal(alice.done.length, 1);
  assert.equal(bob.done.length, 1);
  assert.deepEqual(store.denied, []);
});

test('trade rules: starter items are not tradeable and applying is idempotent', () => {
  const [x, y] = tradeItems;
  const data = { inventory: { [x]: 1, [STARTER_ITEMS[0]]: 1 }, keys: 2, newItems: [] };
  assert.equal(isTradeable(STARTER_ITEMS[0], data.inventory), false);
  assert.equal(isTradeable(x, data.inventory), true);
  assert.equal(applyTrade(data, 't1', { items: [x], keys: 5 }, { items: [y] }).ok, false, 'not enough keys');
  const r = applyTrade(data, 't1', { items: [x], keys: 1 }, { items: [y], keys: 0 });
  assert.ok(r.ok);
  assert.deepEqual(r.received, [y]);
  assert.equal(applyTrade(data, 't1', { items: [x], keys: 1 }, { items: [y] }).already, true);
  assert.equal(data.keys, 1);
  assert.ok(data.inventory[y] && !data.inventory[x]);
});
