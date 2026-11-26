// In-memory stand-in for the subset of the Firestore web SDK the social features use, with the same
// access rules as docs/SOCIAL.md enforced per signed-in user. Each client(uid) returns an API object
// shaped like the modular SDK (doc, collection, query, where, orderBy, getDoc, setDoc, updateDoc,
// addDoc, deleteDoc, onSnapshot, deleteField).
const DELETE = Symbol('deleteField');
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export class FakeStore {
  constructor() { this.docs = new Map(); this.subs = new Set(); this.nextId = 1; this.denied = []; }
  client(uid) { return makeClient(this, uid); }
  notify() {
    for (const s of [...this.subs]) queueMicrotask(() => { if (this.subs.has(s)) s.fire(); });
  }
  // wait until all queued snapshot callbacks (and the async work they start) have run
  async settle(rounds = 8) { for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0)); }
}

const isMap = (v) => v && typeof v === 'object' && !Array.isArray(v);
function deepMerge(base, add) {
  const out = isMap(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(add)) {
    if (v === DELETE) delete out[k];
    else if (isMap(v)) out[k] = deepMerge(out[k], v);
    else out[k] = v;
  }
  return out;
}
function setPath(obj, path, v) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) { if (!isMap(o[parts[i]])) o[parts[i]] = {}; o = o[parts[i]]; }
  if (v === DELETE) delete o[parts.at(-1)]; else o[parts.at(-1)] = v;
}
const changedKeys = (a = {}, b = {}) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));

// ---------------------------------------------------------------- rules (mirror of docs/SOCIAL.md)
function allowed(op, path, uid, before, after) {
  const seg = path.split('/');
  if (!uid) return false;
  const [col, id] = seg;
  if (col === 'usernames') return op === 'read' || (op === 'create' && after.uid === uid && after.name.toLowerCase() === id);
  if (col === 'profiles') return id === uid;
  if (col === 'friends' || col === 'presence') return op === 'read' || id === uid;
  if (col === 'inbox') {
    if (op === 'read' || op === 'delete') return id === uid;
    if (op === 'create') return after.from === uid && ['friend', 'friendAccept', 'party', 'duel', 'trade', 'join'].includes(after.type) && Object.keys(after).length <= 6;
    return false;
  }
  if (col === 'parties') {
    if (op === 'read') return true;
    if (op === 'create') return after.leader === uid && Object.keys(after.members || {}).every((k) => k === uid);
    if (op === 'delete') return before.leader === uid;
    if (before.leader === uid) return true;
    const ch = changedKeys(before, after);
    if (!ch.every((k) => k === 'members')) return false;
    if (!changedKeys(before.members, after.members).every((k) => k === uid)) return false;
    return !!(before.members?.[uid] || before.invited?.[uid]);
  }
  if (col === 'trades') {
    const d = before || after;
    if (op === 'read') return d.a === uid || d.b === uid;
    if (op === 'create') return after.a === uid && after.status === 'open';
    if (op !== 'update' || (before.a !== uid && before.b !== uid) || after.a !== before.a || after.b !== before.b) return false;
    const mine = before.a === uid
      ? ['aItems', 'aKeys', 'aReady', 'aConfirm', 'aDone', 'bReady', 'bConfirm', 'status', 'at']
      : ['bItems', 'bKeys', 'bReady', 'bConfirm', 'bDone', 'aReady', 'aConfirm', 'status', 'at'];
    return changedKeys(before, after).every((k) => mine.includes(k));
  }
  return false;
}

function makeClient(store, uid) {
  const deny = (op, path) => { store.denied.push(`${uid} ${op} ${path}`); const e = new Error(`permission-denied: ${uid} ${op} ${path}`); e.code = 'permission-denied'; throw e; };
  const snapOf = (path) => { const d = store.docs.get(path); return { id: path.split('/').at(-1), exists: () => !!d, data: () => clone(d) }; };
  const matches = (q, path, data) => {
    const parent = path.split('/').slice(0, -1).join('/');
    if (parent !== q.col.path) return false;
    return q.cons.filter((c) => c.type === 'where').every((c) => data[c.field] === c.v);
  };
  const API = {
    doc: (db, ...seg) => ({ kind: 'doc', path: seg.join('/'), id: seg.at(-1) }),
    collection: (db, ...seg) => ({ kind: 'col', path: seg.join('/') }),
    query: (col, ...cons) => ({ kind: 'query', col, cons }),
    where: (field, op, v) => ({ type: 'where', field, v }),
    orderBy: (f) => ({ type: 'orderBy', f }),
    limit: (n) => ({ type: 'limit', n }),
    deleteField: () => DELETE,
    async getDoc(ref) {
      const d = store.docs.get(ref.path);
      if (d && !allowed('read', ref.path, uid, d, null)) deny('read', ref.path);
      return snapOf(ref.path);
    },
    async setDoc(ref, data, opts = {}) {
      const before = store.docs.get(ref.path);
      const after = opts.merge ? deepMerge(before, clone(data)) : deepMerge({}, clone(data));
      if (!allowed(before ? 'update' : 'create', ref.path, uid, before, after)) deny('write', ref.path);
      store.docs.set(ref.path, after); store.notify();
    },
    async updateDoc(ref, data) {
      const before = store.docs.get(ref.path);
      if (!before) { const e = new Error(`not-found ${ref.path}`); e.code = 'not-found'; throw e; }
      const after = clone(before);
      for (const [k, v] of Object.entries(data)) setPath(after, k, v === DELETE ? DELETE : clone(v));
      if (!allowed('update', ref.path, uid, before, after)) deny('update', ref.path);
      store.docs.set(ref.path, after); store.notify();
    },
    async addDoc(col, data) {
      const id = `id${store.nextId++}`;
      const path = `${col.path}/${id}`;
      const after = clone(data);
      if (!allowed('create', path, uid, null, after)) deny('create', path);
      store.docs.set(path, after); store.notify();
      return { kind: 'doc', path, id };
    },
    async deleteDoc(ref) {
      const before = store.docs.get(ref.path);
      if (!before) return;
      if (!allowed('delete', ref.path, uid, before, null)) deny('delete', ref.path);
      store.docs.delete(ref.path); store.notify();
    },
    onSnapshot(target, cb, err) {
      let last = null;
      const sub = {
        fire: () => {
          let snap, key;
          if (target.kind === 'doc') {
            const d = store.docs.get(target.path);
            if (d && !allowed('read', target.path, uid, d, null)) { err?.(Object.assign(new Error('permission-denied'), { code: 'permission-denied' })); return; }
            snap = snapOf(target.path); key = JSON.stringify(d ?? null);
          } else {
            const q = target.kind === 'query' ? target : { col: target, cons: [] };
            const docs = [...store.docs.entries()].filter(([p, d]) => matches(q, p, d));
            for (const [p, d] of docs) if (!allowed('read', p, uid, d, null)) { err?.(Object.assign(new Error('permission-denied'), { code: 'permission-denied' })); return; }
            const ob = q.cons.find((c) => c.type === 'orderBy');
            if (ob) docs.sort((x, y) => (x[1][ob.f] ?? 0) - (y[1][ob.f] ?? 0));
            snap = { docs: docs.map(([p, d]) => ({ id: p.split('/').at(-1), data: () => clone(d) })) };
            key = JSON.stringify(docs);
          }
          if (key === last) return;
          last = key;
          cb(snap);
        },
      };
      store.subs.add(sub);
      queueMicrotask(() => sub.fire());
      return () => store.subs.delete(sub);
    },
  };
  return API;
}
