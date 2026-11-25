# Pixel Fortress — architecture notes

## Engine choice

The target was a 3D multiplayer FPS that plays in the browser straight from a GitHub repository, with no install and no build. The environment had Node 22 and npm, and no game engine or GPU toolchain.

The choice was **three.js on native ES modules**, with no bundler:
- The repository root is the deployable site, so GitHub Pages serves it as-is.
- Game rules are plain JavaScript in `src/shared/`, so the same code runs in three places: the browser client (prediction), a browser Web Worker (listen server) and Node (dedicated server). The rules can't drift apart because there is only one copy.
- The world is blocky, so axis-aligned boxes describe its collision exactly. Physics, ray casts and navigation are small custom modules rather than a physics engine.

## Data flow

```
 input (keys/mouse/touch) ──► NetClient.update() ──► 60 Hz commands {seq, dt, buttons, yaw, pitch, slot, renderTime}
                                   │  predicts with shared stepMovement + stepWeapons
                                   ▼
                         transport (local | WebRTC | WebSocket)
                                   ▼
 ServerGame.tick() @30 Hz:  command queue (budgeted) → movement → weapons → combat/projectiles/abilities
                            → modes (TDM/CTF) → pickups → lag-comp history → snapshots @20 Hz + events
                                   ▼
 NetClient: reconcile own state (rewind to ack + replay) · buffer remote players for 100 ms interpolation
 Game: rigs, effects, audio, HUD driven by snapshots and events
```

### Prediction and reconciliation
Each snapshot carries the player's full movement state and packed weapon state, plus the last command sequence the server processed. The client resets to that state and replays its unacknowledged commands. Any position error left over is blended away over about 70 ms. Respawns are flagged by a spawn counter and reset prediction completely.

### Fire validation
Firing is not a separate request. The server runs the same weapon state machine on the command stream, so fire rate, ammo, reloads, deploy times and spin-up are enforced by construction. Spread comes from a seeded RNG, `hash(playerId, shotIndex)`, so tracers drawn by the client match the server's hits. Hitscan rewinds targets to the command's `renderTime`, clamped to at most 300 ms back.

### Speed-hack protection
Each player has a time budget that grows by one tick per tick. Commands spend their `dt` from it, `dt` is clamped to 50 ms, and a backlog beyond 45 queued commands is dropped.

### Interest management
Players more than 45 m away and out of sight are sent every other snapshot. One-shot events (shots, sounds) are only sent to players within 140 m.

## Maps
Maps are code, written with the `MapBuilder` DSL in `src/maps/builder.js`:
- Boxes are given by centre, base and size.
- Walls take door openings; there are helpers for rooms, stairs, containers and fences.
- Props carry optional collision.
- `sym()` copies everything rotated 180°, swapping team ownership.

Shared kits build the team HQ (spawn room, flag room with four entrances, upper gallery, balconies), cliff borders, and underground tunnels with stairwells cut into the ground slab.

`NavGraph` builds a 1 m navigation grid from the collision boxes: walk, jump and drop links, then A*. Bots use it, and the tests use it to prove every spawn can reach the enemy flag.

## Rendering
- **World boxes** are merged per material and per 24 m chunk, which allows frustum culling. They get world-space UVs (constant texel density) and baked vertex-colour ambient occlusion.
- **Textures** are 32×32 canvases painted from recipes, drawn with nearest-neighbour filtering.
- **Characters** are jointed boxes. Each face is painted into a small atlas per class and team, and cosmetics attach to the joints.
- **The viewmodel** is a separate scene and camera drawn after clearing depth, so it never clips into walls.
- **Particles** are a single instanced mesh of cubes. Lights, tracers and decals are pooled.

## Audio
Everything is synthesised in WebAudio from noise and oscillator recipes. 3D sounds use HRTF panners with inverse-distance falloff. Being inside a sound zone adds a convolver reverb send. Music is a small step sequencer.
