// Client network transports. All share: send(obj), onmessage(obj), onclose(reason), close().
//  - HostSession: runs the authoritative server in a Web Worker in this tab; the local player connects via
//    an in-memory channel, remote players connect over WebRTC (PeerJS) data channels.
//  - PeerClient: joins a browser-hosted match by room code (WebRTC).
//  - WSClient: joins a Node dedicated server over WebSocket.

export const PEER_PREFIX = 'pixfort-v3-';
export const PUBLIC_SLOTS = 8;

function peerLib() {
  if (!window.peerjs || !window.peerjs.Peer) throw new Error('WebRTC library failed to load');
  return window.peerjs.Peer;
}

export function makeRoomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

const PEER_OPTS = {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  },
};

// ------------------------------------------------------------------ host (listen server)
export class HostSession {
  constructor(opts) {
    this.opts = opts;
    this.worker = null;
    this.peer = null;
    this.pubPeer = null;
    this.code = null;
    this.remote = new Map();     // connId -> DataConnection
    this.nextConnId = 1;
    this.local = null;
    this.onStatus = () => {};
    this.lastInfo = null;
  }

  async start() {
    this.worker = new Worker(new URL('../../server/worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev) => this.onWorker(ev.data);
    this.worker.onerror = (e) => { console.error('server worker error', e); this.onStatus({ error: 'Server worker crashed: ' + (e.message || e) }); };
    await new Promise((resolve) => {
      this._ready = resolve;
      this.worker.postMessage({ type: 'init', opts: this.opts.game });
    });
    if (this.opts.online) this.openOnline().catch((e) => this.onStatus({ online: false, error: String(e.message || e) }));
    return this;
  }

  onWorker(m) {
    switch (m.type) {
      case 'ready': this.lastInfo = m.info; this._ready?.(); break;
      case 'send':
        if (m.connId === 0) { if (this.local) this.local._deliver(m.data); }
        else {
          const c = this.remote.get(m.connId);
          if (c && c.open) { try { c.send(m.data); } catch { /* channel closing */ } }
        }
        break;
      case 'info': this.lastInfo = m.info; this._infoWait?.(m.info); break;
      case 'log': console.log('[server]', m.text); break;
      case 'error': console.error('[server]', m.message); break;
      default:
    }
  }

  connectLocal() {
    const t = new LocalTransport(this);
    this.local = t;
    this.worker.postMessage({ type: 'connect', connId: 0 });
    return t;
  }

  async openOnline() {
    const Peer = peerLib();
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = makeRoomCode();
      try {
        this.peer = await openPeer(Peer, PEER_PREFIX + code);
        this.code = code;
        break;
      } catch (e) {
        if (String(e.type) !== 'unavailable-id' || attempt === 3) throw e;
      }
    }
    this.peer.on('connection', (conn) => this.acceptConn(conn));
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch { /* ignore */ } });
    this.onStatus({ online: true, code: this.code });
    if (this.opts.public) this.registerPublic(Peer);
  }

  async registerPublic(Peer) {
    for (let i = 0; i < PUBLIC_SLOTS; i++) {
      try {
        this.pubPeer = await openPeer(Peer, `${PEER_PREFIX}pub-${i}`);
        this.pubSlot = i;
        this.pubPeer.on('connection', (conn) => {
          conn.on('open', async () => {
            const info = await this.info();
            conn.send({ t: 'pubinfo', code: this.code, info, name: this.opts.game.roomName });
            setTimeout(() => conn.close(), 1500);
          });
        });
        this.onStatus({ online: true, code: this.code, publicSlot: i });
        return;
      } catch (e) {
        if (String(e.type) !== 'unavailable-id') return;
      }
    }
  }

  info() {
    return new Promise((resolve) => {
      this._infoWait = resolve;
      this.worker.postMessage({ type: 'info' });
      setTimeout(() => resolve(this.lastInfo), 500);
    });
  }

  acceptConn(conn) {
    const connId = this.nextConnId++;
    conn.on('open', () => {
      this.remote.set(connId, conn);
      this.worker.postMessage({ type: 'connect', connId });
    });
    conn.on('data', (data) => this.worker.postMessage({ type: 'msg', connId, data }));
    const drop = () => {
      if (!this.remote.has(connId)) return;
      this.remote.delete(connId);
      this.worker.postMessage({ type: 'disconnect', connId });
    };
    conn.on('close', drop);
    conn.on('error', drop);
  }

  stop() {
    try { this.worker?.postMessage({ type: 'stop' }); this.worker?.terminate(); } catch { /* ignore */ }
    for (const c of this.remote.values()) try { c.close(); } catch { /* ignore */ }
    try { this.peer?.destroy(); } catch { /* ignore */ }
    try { this.pubPeer?.destroy(); } catch { /* ignore */ }
    this.remote.clear();
  }
}

function openPeer(Peer, id) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(id, PEER_OPTS);
    const timer = setTimeout(() => { peer.destroy(); reject(Object.assign(new Error('Signalling server timeout'), { type: 'timeout' })); }, 12000);
    peer.on('open', () => { clearTimeout(timer); resolve(peer); });
    peer.on('error', (e) => { clearTimeout(timer); try { peer.destroy(); } catch { /* ignore */ } reject(e); });
  });
}

class LocalTransport {
  constructor(host) {
    this.host = host;
    this.onmessage = () => {};
    this.onclose = () => {};
    this.kind = 'local';
  }
  send(obj) { this.host.worker.postMessage({ type: 'msg', connId: 0, data: obj }); }
  _deliver(obj) { this.onmessage(obj); }
  close() { this.host.stop(); this.onclose('closed'); }
}

// ------------------------------------------------------------------ join a browser-hosted room (WebRTC)
export class PeerClient {
  constructor() {
    this.onmessage = () => {};
    this.onclose = () => {};
    this.kind = 'p2p';
    this.closed = false;
  }

  async connect(code) {
    const Peer = peerLib();
    this.peer = await new Promise((resolve, reject) => {
      const p = new Peer(PEER_OPTS);
      const timer = setTimeout(() => reject(new Error('Signalling server timeout')), 12000);
      p.on('open', () => { clearTimeout(timer); resolve(p); });
      p.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
    this.conn = this.peer.connect(PEER_PREFIX + code.toUpperCase(), { reliable: true, serialization: 'json' });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Could not reach host (room code wrong, or NAT blocked)')), 15000);
      this.conn.on('open', () => { clearTimeout(timer); resolve(); });
      this.conn.on('error', (e) => { clearTimeout(timer); reject(e); });
      this.peer.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
    this.conn.on('data', (d) => this.onmessage(d));
    this.conn.on('close', () => { if (!this.closed) { this.closed = true; this.onclose('Host closed the connection'); } });
    return this;
  }

  send(obj) { if (this.conn && this.conn.open) this.conn.send(obj); }
  close() { this.closed = true; try { this.conn?.close(); this.peer?.destroy(); } catch { /* ignore */ } }
}

// Discover public browser-hosted rooms by probing well-known public slot ids.
export async function browsePublicRooms(timeoutMs = 4000) {
  const Peer = peerLib();
  const peer = await new Promise((resolve, reject) => {
    const p = new Peer(PEER_OPTS);
    const timer = setTimeout(() => reject(new Error('Signalling server timeout')), 10000);
    p.on('open', () => { clearTimeout(timer); resolve(p); });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
  const found = [];
  await Promise.all(Array.from({ length: PUBLIC_SLOTS }, (_, i) => new Promise((resolve) => {
    const conn = peer.connect(`${PEER_PREFIX}pub-${i}`, { reliable: true, serialization: 'json' });
    const timer = setTimeout(() => { try { conn.close(); } catch { /* ignore */ } resolve(); }, timeoutMs);
    conn.on('data', (d) => {
      if (d && d.t === 'pubinfo') found.push({ slot: i, code: d.code, name: d.name, ...d.info });
      clearTimeout(timer); resolve();
    });
    conn.on('error', () => { clearTimeout(timer); resolve(); });
  })));
  peer.on('error', () => {});
  setTimeout(() => peer.destroy(), 500);
  return found.filter((r) => r.code);
}

// ------------------------------------------------------------------ dedicated server (WebSocket)
export class WSClient {
  constructor(url) {
    this.url = url;
    this.onmessage = () => {};
    this.onclose = () => {};
    this.kind = 'ws';
  }

  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      const timer = setTimeout(() => reject(new Error('Connection timed out')), 8000);
      this.ws.onopen = () => { clearTimeout(timer); resolve(this); };
      this.ws.onerror = () => { clearTimeout(timer); reject(new Error(`Cannot connect to ${this.url}`)); };
      this.ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } this.onmessage(m); };
      this.ws.onclose = () => this.onclose('Disconnected from server');
    });
  }

  // lobby request/response helper (before joining a room)
  request(msg, replyTypes) {
    return new Promise((resolve, reject) => {
      const prev = this.onmessage;
      const timer = setTimeout(() => { this.onmessage = prev; reject(new Error('Server did not respond')); }, 6000);
      this.onmessage = (m) => {
        if (replyTypes.includes(m.t)) { clearTimeout(timer); this.onmessage = prev; resolve(m); }
      };
      this.send(msg);
    });
  }

  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  close() { try { this.ws?.close(); } catch { /* ignore */ } }
}

export function defaultServerUrl() {
  const loc = window.location;
  if (loc.protocol === 'file:') return 'ws://localhost:8080/ws';
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws`;
}
