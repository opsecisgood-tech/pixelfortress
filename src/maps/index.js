// Map registry. Map data is generated deterministically from builder code (same on server & client).
import { buildDustyDepot } from './dusty-depot.js';
import { buildFrostfall } from './frostfall.js';
import { buildPixelworks } from './pixelworks.js';
import { buildSandstoneFortress } from './sandstone-fortress.js';
import { buildProvingGrounds } from './proving-grounds.js';

const BUILDERS = {
  dusty_depot: buildDustyDepot,
  frostfall: buildFrostfall,
  pixelworks: buildPixelworks,
  sandstone_fortress: buildSandstoneFortress,
  proving_grounds: buildProvingGrounds,
};

export const MAP_IDS = Object.keys(BUILDERS);
const cache = new Map();
// Which modes each map supports (kept here so it is available without building the map).
const MAP_MODES = {
  dusty_depot: ['tdm', 'ctf'], frostfall: ['tdm', 'ctf'], pixelworks: ['tdm', 'ctf'], sandstone_fortress: ['ctf', 'tdm'],
  proving_grounds: ['duel1', 'duel2'],
};
export const mapSupports = (id, mode) => !!MAP_MODES[id]?.includes(mode);
export const mapsForMode = (mode) => MAP_IDS.filter((id) => mapSupports(id, mode));
// the large team maps (TDM / CTF); duel arenas are separate
export const TEAM_MAP_IDS = mapsForMode('tdm');

export function getMap(id) {
  if (!BUILDERS[id]) id = MAP_IDS[0];
  if (!cache.has(id)) cache.set(id, Object.freeze(BUILDERS[id]()));
  return cache.get(id);
}

export function mapList() {
  return MAP_IDS.map((id) => {
    const m = getMap(id);
    return { id, name: m.name, theme: m.theme, description: m.description, preview: m.preview, modes: m.modes };
  });
}
