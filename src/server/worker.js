// Listen-server host: runs the authoritative ServerGame inside a Web Worker so the simulation keeps
// ticking smoothly (and is isolated from rendering). The main thread relays network connections.
import { ServerGame } from './ServerGame.js';
import { SERVER_TICK_RATE } from '../shared/constants.js';

let game = null;
let timer = null;
let last = 0;
let acc = 0;
const STEP = 1000 / SERVER_TICK_RATE;

function post(type, payload) {
  self.postMessage({ type, ...payload });
}

function loop() {
  const now = performance.now();
  acc += now - last;
  last = now;
  if (acc > 250) acc = 250; // avoid spiral of death after a stall
  while (acc >= STEP) {
    acc -= STEP;
    try { game.tick(); } catch (e) { post('error', { message: String(e && e.stack || e) }); }
  }
}

self.onmessage = (ev) => {
  const m = ev.data;
  switch (m.type) {
    case 'init':
      game = new ServerGame({
        ...m.opts,
        persistent: true,
        send: (connId, data) => post('send', { connId, data }),
        log: (s) => post('log', { text: s }),
      });
      last = performance.now();
      timer = setInterval(loop, 8);
      post('ready', { info: game.info() });
      break;
    case 'connect':
      game?.handleConnect(m.connId);
      break;
    case 'msg':
      game?.handleMessage(m.connId, m.data);
      break;
    case 'disconnect':
      game?.handleDisconnect(m.connId);
      break;
    case 'info':
      post('info', { reqId: m.reqId, info: game ? game.info() : null });
      break;
    case 'stop':
      clearInterval(timer);
      game = null;
      break;
    default:
  }
};
