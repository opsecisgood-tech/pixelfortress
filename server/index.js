#!/usr/bin/env node
// Pixel Fortress dedicated server: serves the static game files AND hosts authoritative matches over
// WebSocket (/ws). Room-based matchmaking: list, create, join, quick play. Persistent TDM and CTF rooms
// rotate through all six maps.
//
//   npm install && npm start          -> http://localhost:8080
//   PORT=9000 BOTS=8 npm start
//
// Verified usernames and join logs (docs/VERIFIED_NAMES.md):
//   FIREBASE_PROJECT_ID=my-project   check signed-in players' accounts and claimed usernames
//   REQUIRE_ACCOUNT=1                only signed-in players with a username may join
//   LOG_FILE=logs/players.log        append join/leave/chat records (one JSON object per line)
//   BANNED_UIDS=uid1,uid2            account ids that may not join
//   ADMIN_UIDS=uid1                  extra admin accounts (the verified username "owner" is always admin)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { ServerGame } from '../src/server/ServerGame.js';
import { SERVER_TICK_RATE, GAME_VERSION } from '../src/shared/constants.js';
import { MAP_IDS, mapsForMode, mapSupports } from '../src/maps/index.js';
import { MODES } from '../src/shared/config/modes.js';
import { checkJoin } from './accounts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +process.env.PORT || 8080;
const BOTS = process.env.BOTS !== undefined ? +process.env.BOTS : 8;
const MAX_ROOMS = +process.env.MAX_ROOMS || 12;
const ACCOUNTS = {
  projectId: process.env.FIREBASE_PROJECT_ID || '',
  requireAccount: process.env.REQUIRE_ACCOUNT === '1',
  banned: new Set((process.env.BANNED_UIDS || '').split(',').map((s) => s.trim()).filter(Boolean)),
};
// Extra admin accounts (besides the verified username "owner"): ADMIN_UIDS=uid1,uid2
const ADMIN_UIDS = new Set((process.env.ADMIN_UIDS || '').split(',').map((s) => s.trim()).filter(Boolean));
const LOG_FILE = process.env.LOG_FILE || '';
if (LOG_FILE) fs.mkdirSync(path.dirname(path.resolve(LOG_FILE)), { recursive: true });

// Player log: one JSON line per join / leave / chat / rejected join.
function audit(roomId, rec) {
  const line = { time: new Date().toISOString(), room: roomId, ...rec };
  console.log(`[room ${roomId}] ${rec.ev} ${rec.name ?? ''}${rec.uid ? ` uid=${rec.uid}` : ''}${rec.verified ? ' (verified)' : ''}${rec.text ? `: ${rec.text}` : ''}${rec.reason ? ` - ${rec.reason}` : ''}`);
  if (LOG_FILE) fs.appendFile(LOG_FILE, `${JSON.stringify(line)}\n`, () => {});
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.md': 'text/markdown',
};

// ---------------------------------------------------------------- static files
const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/api/rooms') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ version: GAME_VERSION, rooms: roomList() }));
    return;
  }
  if (url.endsWith('/')) url += 'index.html';
  const file = path.normalize(path.join(ROOT, url));
  if (!file.startsWith(ROOT) || file.includes(`${path.sep}.git`) || file.includes('node_modules')) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
});

// ---------------------------------------------------------------- rooms
const rooms = new Map();
let nextRoomId = 1;
let nextConnId = 1;

function createRoom({ name, mapId, mode, botFill, persistent = false, maxPlayers = 16, priv = false }) {
  if (rooms.size >= MAX_ROOMS) return null;
  const id = String(nextRoomId++);
  const room = { id, conns: new Map(), persistent, emptySince: Date.now(), priv };
  mode = MODES[mode] ? mode : 'tdm';
  const duel = !!MODES[mode].duel;
  room.game = new ServerGame({
    mapId: mapSupports(mapId, mode) ? mapId : mapsForMode(mode)[0], mode, private: priv,
    // duels never fill with bots on the dedicated server; the room waits for real opponents
    botFill: duel ? 0 : Math.max(0, Math.min(16, botFill ?? BOTS)), maxPlayers: duel ? MODES[mode].maxPlayers : maxPlayers,
    roomName: name || (duel ? `${MODES[mode].name} #${id}` : `Room ${id}`),
    rotation: true, hostConn: -1,
    send: (connId, msg) => {
      const ws = room.conns.get(connId);
      if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
    },
    log: (s) => console.log(`[room ${id}] ${s}`),
    audit: (rec) => audit(id, rec),
  });
  rooms.set(id, room);
  console.log(`room ${id} created: ${room.game.roomName} ${room.game.mapId} ${room.game.modeId}`);
  return room;
}

function roomList() {
  return [...rooms.values()].filter((r) => !r.priv).map((r) => ({ id: r.id, ...r.game.info() }));
}

// Free human slots on the emptier team (a party of n must fit on one team to play together).
function teamRoom(room) {
  const g = room.game, per = g.maxPerTeam(), c = [0, 0];
  for (const p of g.players.values()) if (!p.isBot) c[p.team]++;
  return Math.max(per - c[0], per - c[1]);
}

createRoom({ name: 'Fortress TDM #1', mapId: 'dusty_depot', mode: 'tdm', persistent: true });
createRoom({ name: 'Fortress CTF #1', mapId: 'sandstone_fortress', mode: 'ctf', persistent: true });

// ---------------------------------------------------------------- websocket
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

wss.on('connection', (ws) => {
  const connId = nextConnId++;
  let room = null;
  let msgCount = 0;
  let joining = false; // waiting for an account check
  const rate = setInterval(() => { msgCount = 0; }, 1000);
  ws.on('message', (raw) => {
    if (++msgCount > 200) return; // flood protection
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!room) {
      if (msg.t === 'lobby') {
        if (msg.action === 'list') { ws.send(JSON.stringify({ t: 'rooms', rooms: roomList() })); return; }
        let target = null;
        if (msg.action === 'join') target = rooms.get(String(msg.room));
        else if (msg.action === 'create') target = createRoom({ name: String(msg.name || '').slice(0, 32), mapId: msg.mapId, mode: msg.mode, botFill: msg.botFill, priv: !!msg.private });
        else if (msg.action === 'quick') {
          const wantMode = MODES[msg.mode] ? msg.mode : null;
          const party = Math.max(1, Math.min(8, +msg.party || 1));
          const cands = [...rooms.values()].filter((r) => !r.priv && (!wantMode || r.game.modeId === wantMode)
            && r.game.humanCount() + party <= r.game.maxPlayers && (party === 1 || teamRoom(r) >= party))
            .sort((a, b) => b.game.humanCount() - a.game.humanCount());
          target = cands[0] || createRoom({ mapId: msg.mapId, mode: wantMode || 'tdm' });
        }
        if (!target) { ws.send(JSON.stringify({ t: 'error', reason: 'Room not available' })); return; }
        room = target;
        room.conns.set(connId, ws);
        // the first human in a non-persistent room acts as its host (restart / map / bots controls)
        if (!room.persistent && room.game.hostConn === -1) room.game.hostConn = connId;
        ws.send(JSON.stringify({ t: 'joined', room: room.id, info: room.game.info() }));
      }
      return;
    }
    if (msg.t === 'hello') {
      if (joining) return;
      joining = true;
      const r = room;
      checkJoin(msg, ACCOUNTS).then((res) => {
        joining = false;
        if (room !== r || ws.readyState !== 1) return;
        if (res.reject) {
          audit(r.id, { ev: 'rejected', name: String(msg.name || '').slice(0, 16), reason: res.reject });
          ws.send(JSON.stringify({ t: 'error', reason: res.reject }));
          return;
        }
        r.game.handleMessage(connId, msg, { account: res.account || null, guestName: res.guestName || null, admin: !!(res.account?.uid && ADMIN_UIDS.has(res.account.uid)) });
      }).catch((e) => { joining = false; console.error('account check failed', e); ws.send(JSON.stringify({ t: 'error', reason: 'Could not check your account. Try again.' })); });
      return;
    }
    room.game.handleMessage(connId, msg);
  });
  ws.on('close', () => {
    clearInterval(rate);
    if (room) {
      room.conns.delete(connId);
      room.game.handleDisconnect(connId);
      if (room.conns.size === 0) room.emptySince = Date.now();
    }
  });
  ws.on('error', () => {});
});

// ---------------------------------------------------------------- simulation loop
const STEP = 1000 / SERVER_TICK_RATE;
let last = performance.now();
let acc = 0;
setInterval(() => {
  const now = performance.now();
  acc += now - last;
  last = now;
  if (acc > 250) acc = 250;
  while (acc >= STEP) {
    acc -= STEP;
    for (const r of rooms.values()) {
      if (r.conns.size === 0 && !r.persistent) {
        if (Date.now() - r.emptySince > 60000) { rooms.delete(r.id); console.log(`room ${r.id} closed`); }
        continue;
      }
      if (r.conns.size === 0) continue; // idle persistent rooms sleep
      try { r.game.tick(); } catch (e) { console.error(`room ${r.id} tick error`, e); }
    }
  }
}, 5);

server.listen(PORT, () => {
  console.log(`Pixel Fortress v${GAME_VERSION} dedicated server`);
  console.log(`  game:      http://localhost:${PORT}/`);
  console.log(`  websocket: ws://localhost:${PORT}/ws`);
  console.log(`  rooms:     http://localhost:${PORT}/api/rooms`);
  console.log(`  accounts:  ${ACCOUNTS.projectId ? `verifying Firebase project "${ACCOUNTS.projectId}"${ACCOUNTS.requireAccount ? ', sign-in required' : ', guests allowed'}` : 'off (set FIREBASE_PROJECT_ID to verify usernames)'}`);
  if (LOG_FILE) console.log(`  player log: ${path.resolve(LOG_FILE)}`);
});
