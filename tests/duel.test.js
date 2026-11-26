// 1v1 / 2v2 duel modes and the duel arena map.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServerGame } from '../src/server/ServerGame.js';
import { MATCH_STATE, PROTOCOL_VERSION } from '../src/shared/constants.js';
import { getMap, mapsForMode, mapSupports } from '../src/maps/index.js';
import { World } from '../src/shared/physics.js';
import { NavGraph } from '../src/shared/nav.js';

test('duel arena: spawns clear and each team can reach the other', () => {
  for (const mode of ['duel1', 'duel2']) assert.deepEqual(mapsForMode(mode), ['proving_grounds']);
  assert.ok(!mapSupports('proving_grounds', 'tdm') && !mapSupports('dusty_depot', 'duel1'));
  const m = getMap('proving_grounds');
  const w = new World(m.boxes, m.bounds);
  for (const t of [0, 1]) assert.ok(m.spawns.filter((s) => s.team === t).length >= 2);
  for (const s of m.spawns) assert.ok(!w.overlapsSolid(s.pos[0] - 0.4, s.pos[1] + 0.02, s.pos[2] - 0.4, s.pos[0] + 0.4, s.pos[1] + 1.85, s.pos[2] + 0.4), 'spawn inside geometry');
  const nav = new NavGraph(w, m.bounds);
  const a = m.spawns.find((s) => s.team === 0), b = m.spawns.find((s) => s.team === 1);
  assert.ok(nav.pathBetween(a.pos, b.pos), 'spawns connected');
  assert.ok(nav.pathBetween(a.pos, [0, 1.5, 0]), 'centre platform reachable');
});

test('duel: a team map request falls back to the arena and sizes the room', () => {
  const g = new ServerGame({ mapId: 'dusty_depot', mode: 'duel2', botFill: 12, maxPlayers: 12, send: () => {} });
  assert.equal(g.mapId, 'proving_grounds');
  assert.equal(g.maxPlayers, 4);
  assert.equal(g.botFill, 4);
  assert.equal(g.maxPerTeam(), 2);
  g.changeMap('dusty_depot', 'tdm');
  assert.equal(g.maxPlayers, 12, 'team mode restores the room size');
});

test('duel: bot 1v1 and 2v2 matches are decided in rounds', () => {
  for (const mode of ['duel1', 'duel2']) {
    const rounds = [];
    const g = new ServerGame({ mode, botFill: 4, persistent: true, send: () => {} });
    const ev = g.event.bind(g);
    g.event = (e, ...r) => { if (e[0] === 'ann' && e[1] === 'roundwin') rounds.push(e[2]); return ev(e, ...r); };
    g.balanceBots();
    g.startPreRound();
    for (let i = 0; i < 30 * 60 * 12 && g.state !== MATCH_STATE.ENDED; i++) g.tick();
    assert.equal(g.state, MATCH_STATE.ENDED, `${mode} ended`);
    assert.equal(Math.max(...g.scores), 5, `${mode} first to 5`);
    assert.equal(rounds.filter((t) => t === g.results.winner).length, 5);
    assert.ok(g.results.players.length === (mode === 'duel1' ? 2 : 4));
  }
});

test('duel: waits for a full lobby, no respawns inside a round, forfeit on leave', () => {
  const sent = [];
  const g = new ServerGame({ mode: 'duel1', botFill: 0, send: (c, m) => sent.push([c, m]) });
  const hello = (conn, name) => g.handleMessage(conn, { t: 'hello', protocol: PROTOCOL_VERSION, name, classId: 'soldier' });
  hello(1, 'Alpha');
  for (let i = 0; i < 30 * 10; i++) g.tick();
  assert.equal(g.mode.phase, 'wait');
  assert.equal(g.state, MATCH_STATE.PREROUND, 'held in pre-round while waiting');
  hello(2, 'Bravo');
  const [a, b] = [...g.players.values()];
  assert.notEqual(a.team, b.team);
  for (let i = 0; i < 30 * 6; i++) g.tick();
  assert.equal(g.state, MATCH_STATE.PLAYING);
  assert.equal(g.mode.phase, 'fight');
  g.combat.kill(b, a, 'rocket');
  assert.equal(b.respawnAt, 0, 'no respawn inside a round');
  g.tick();
  assert.equal(g.scores[a.team], 1, 'round to the survivor');
  for (let i = 0; i < 30 * 5; i++) g.tick();
  assert.ok(b.alive, 'everyone back for the next round');
  assert.equal(g.mode.round, 2);
  g.handleDisconnect(2);
  assert.equal(g.state, MATCH_STATE.ENDED);
  assert.equal(g.results.reason, 'forfeit');
  assert.equal(g.results.winner, a.team);
});

test('duel: party members join the same team in 2v2', () => {
  const g = new ServerGame({ mode: 'duel2', botFill: 0, send: () => {} });
  const hello = (conn, name, group) => g.handleMessage(conn, { t: 'hello', protocol: PROTOCOL_VERSION, name, classId: 'scout', group });
  hello(1, 'Solo1');
  hello(2, 'PartyA', 'p1');
  hello(3, 'PartyB', 'p1');
  hello(4, 'Solo2');
  const by = Object.fromEntries([...g.players.values()].map((p) => [p.name, p.team]));
  assert.equal(by.PartyA, by.PartyB);
  assert.equal(by.Solo1, by.Solo2);
  assert.notEqual(by.PartyA, by.Solo1);
});
