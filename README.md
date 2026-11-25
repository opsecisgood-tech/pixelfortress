# Pixel Fortress

A class-based, team-versus-team multiplayer FPS with a blocky pixel-art look, playable in the browser.
Eight classes, two teams (RED and BLUE), two modes (Team Deathmatch and Capture the Flag) and six maps.
Every model, texture, sound and map here was made for this project, procedurally at runtime. None is copied from another game.

- **Play solo** against bots that play every class and both objectives.
- **Host online** from your own browser and share a five-letter room code. Players connect peer-to-peer over WebRTC, so this works from static hosting such as GitHub Pages.
- **Join a dedicated server** that runs on Node.js (`npm start`), with room-based matchmaking.

## Quick start

| What | How |
| --- | --- |
| Play locally | `npm install && npm start`, then open http://localhost:8080 |
| Static only (no Node) | Serve the repository root with any static server, e.g. `python3 -m http.server`. Practice mode and browser hosting both work. |
| Run tests | `npm test` |
| Deploy to GitHub Pages | See [Deploying](#deploying-to-github-pages) |

There is no build step. The game is native ES modules plus a vendored copy of three.js (`vendor/`).

## Controls

| Action | Desktop (rebindable in Settings) | Touch |
| --- | --- | --- |
| Move | W A S D | Left joystick (floats to wherever your thumb lands) |
| Look | Mouse (click the game to capture it) | Drag on the right half of the screen |
| Fire / alt-fire (scope, spin-up) | Left / right mouse | FIRE / ALT |
| Jump (Scout: press again in the air) | Space | JUMP |
| Sprint | Shift | RUN toggle, or push the stick all the way forward |
| Crouch | C | C |
| Reload | R | R |
| Weapons | 1, 2, 3, mouse wheel, Q for last weapon | ⇄ |
| Class ability | E | E |
| Scoreboard | Tab | Scores |
| Change class / team | M / , | Class |
| Chat / team chat | T / Y | — |
| Menu | Esc | Menu |

You can drag and resize the touch buttons under **Settings → Touch → Edit layout**.

## Classes

| Class | HP | Speed | Primary / Secondary / Melee | Ability | Passive |
| --- | --- | --- | --- | --- | --- |
| Scout | 125 | 115% | Scattershot / Sidekick / Street Bat | Double Jump | Quick Recovery |
| Spy | 100 | 100% | Silenced Pistol / Precision Revolver / Shadow Blade | Disguise (attacking or taking 20+ damage reveals you; 8 s cooldown) | Quiet Movement; back attacks deal 220 |
| Marksman | 110 | 100% | Longshot Rifle (charged scope) / Compact SMG / Utility Knife | Focus Mode | Recon: hits reveal the target to your team |
| Mechanic | 125 | 95% | Rivet Gun / Construction Device (repair beam) / Reinforced Wrench | Automated Turret (limited HP, ammo and range; one per player) | Repair deployables |
| Doctor | 125 | 103% | Syringe Launcher / Medical Beam / Surgical Saw | Overcharge (built by healing) | Medical Assist |
| Juggernaut | 300 | 75% | Cyclone Rotary Cannon / Breacher Shotgun / Foundry Hammer | Suppression Mode | Frontline Presence |
| Incinerator | 175 | 100% | Thermal Projector / Flare Launcher / Furnace Axe | Thermal Burst (also destroys enemy projectiles) | Heat Resistance |
| Demolitionist | 150 | 95% | Blastcaster / Charge Launcher / Demolition Hammer | Detonation Charge (sticky; press E again to detonate) | Explosive Expertise |

All class and weapon numbers live in one place each: `src/shared/config/classes.js` and `src/shared/config/weapons.js`.
For a balance patch, edit those files or call `applyBalanceOverrides()`.

## Maps

| Map | Theme | Signature features |
| --- | --- | --- |
| Dusty Depot | Desert rail depot | Warehouse with catwalks, container yard, gantry cranes, loading dock |
| Frostfall | Snowbound research lab | Two-level lab around an atrium, service tunnels underground, sniper ridges |
| Pixelworks | Factory | Moving conveyor belts, glass control room, gantry bridges, service corridors |
| Sandstone Fortress | Desert keeps | Defensive towers, colonnades, raised market plaza, tunnel under the courtyard |
| Neon District | City at night | Shop and arcade interiors, rooftop sky bridge, subway under the boulevard |
| Overgrown Outpost | Ruined facility in the jungle | Broken walkway with a gap to jump, stream with bridges, buried bunker, watchtower |

Each map uses 180° rotational symmetry, so both teams get identical routes. Every map supports both modes.

## Multiplayer

The server is authoritative. Clients send only input commands (buttons, aim, weapon slot) at 60 Hz. The server simulates at 30 Hz and sends snapshots at 20 Hz. It decides damage, health, eliminations, scores, flags, respawns, abilities and turrets.

| Mode | Server | Transport |
| --- | --- | --- |
| Practice | Web Worker in your tab | In-memory |
| Host online | Web Worker in the host's tab | WebRTC data channels (PeerJS). Optional public listing. |
| Dedicated | Node.js (`server/index.js`) | WebSocket at `/ws` |

Netcode features:
- Client-side prediction with server reconciliation, which replays unacknowledged inputs.
- Interpolation of remote players.
- Lag-compensated hitscan and melee, rewinding up to 300 ms.
- Validation of fire rate, ammo, reloads, cooldowns, movement and objectives.
- Limits on how many commands a client can send, to stop speed hacks.
- Interest management that sends distant, hidden players at half rate.
- Reconnection within 60 s.

**Self-hosted signalling.** Browser hosting uses the public PeerJS signalling service by default.
To use your own, run a [PeerJS server](https://github.com/peers/peerjs-server) and open the game with `?peer=yourhost:9000/`. Gameplay traffic always flows directly between players.

## Deploying to GitHub Pages

1. Merge this branch into `main`.
2. In the repository, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
3. The `Deploy to GitHub Pages` workflow publishes the site on every push to `main`. You can also run it by hand from the Actions tab.

The site is then live at `https://<owner>.github.io/pixelfortress/`.
On Pages you get practice mode, browser hosting and joining by room code. The dedicated server needs a machine that runs Node.

## Dedicated server

```bash
npm install
```

```bash
PORT=8080 BOTS=8 npm start
```

The server also serves the game, so players just open `http://your-server:8080`.
It always runs a TDM room and a CTF room, each rotating through all six maps. Players can create more rooms (up to `MAX_ROOMS`, default 12).
`GET /api/rooms` lists the rooms as JSON. Put a TLS reverse proxy in front of it so the game works over `https`/`wss`.

## Testing

`npm test` runs 23 test groups with Node's built-in runner. There are no test dependencies. Coverage:

- Damage rules, class and weapon configuration, and balance overrides.
- Team assignment, the flag state machine, awards, XP and level curve.
- Movement physics: speed per class, collision, stepping up, double jump.
- The weapon state machine: cadence, magazine and per-shell reloads, interrupting a reload, switching, spin-up, deterministic spread.
- The authoritative server: clients cannot supply damage, each elimination scores once, players respawn, the match ends at the score limit, fire-rate and speed-hack limits hold, ability cooldowns apply, Spy disguise is revealed, and CTF pickup, drop and capture work.
- All six maps: spawns are clear and every spawn can path to the enemy flag (using the generated nav graph).
- Full bot matches in both modes on every map.
- Real netcode: two simulated clients over a 40 ms-latency link, with prediction error checked.

The browser game was also tested by hand in headless Chromium: menus, every screen, all six maps, desktop and emulated phone layouts, browser hosting with a second browser joining over WebRTC (against a local signalling server), and two browsers on the dedicated server.

## Project layout

```
index.html, css/style.css          entry page and interface styling
vendor/                            three.js and PeerJS (MIT)
src/shared/                        code used by both client and server (no DOM, no three.js)
  config/                          classes, weapons, modes, progression (single sources of truth)
  physics.js movement.js           AABB world and deterministic movement
  weaponLogic.js damage.js         weapon state machine and damage rules
  teams.js flag.js awards.js nav.js
src/maps/                          map builder DSL, kits, six maps
src/server/                        ServerGame, combat, projectiles, abilities, modes/, bots/, worker.js
src/client/                        main.js, Game.js, settings.js
  net/                             transports (local, WebRTC, WebSocket) and NetClient (prediction)
  render/                          renderer, procedural textures, maps, characters, weapons, viewmodel, effects
  audio/                           procedural WebAudio engine and music
  input/                           keyboard/mouse and touch controls
  ui/                              menus, HUD, scoreboard, results
  progression/                     local player profile, XP, achievements, cosmetics
server/index.js                    Node dedicated server and static host
tests/                             automated tests
docs/ARCHITECTURE.md               technical design notes
```

## Known limitations

- **Browser hosting depends on outside services.** It uses the public PeerJS signalling server and Google/Twilio STUN. Players behind strict (symmetric) NATs may not connect, because no TURN relay is configured. Use a dedicated server, or add TURN servers to `PEER_OPTS` in `src/client/net/transports.js`.
- **The host must keep their tab open.** If the host leaves, the match ends; there is no host migration. The host also has zero latency.
- **Progression is stored locally.** Profiles, XP, achievements and cosmetics live in `localStorage`, with no account server. Cosmetics are visual only, and the server only checks that a cosmetic ID exists.
- **Recoil is applied on the client.** The server cannot check that it was applied.
- **Projectiles are not lag-compensated.** Only hitscan and melee rewind.
- **Animation is procedural,** driven by a state machine on blocky joints. There are no keyframed animation assets.
- **Performance on real hardware was not measured.** Testing ran in software-rendered headless Chromium (about 10 fps there). Quality presets (Low to Ultra), resolution scale and per-setting overrides are available.
- **Mobile was tested only in emulated viewports,** not on physical phones.
- **The announcer uses the browser's speech synthesis,** so the voice varies by platform, and it is silent where speech synthesis isn't supported.

## Licences

The game code and content in this repository are original. three.js and PeerJS are MIT-licensed; their licence files are in `vendor/`.
