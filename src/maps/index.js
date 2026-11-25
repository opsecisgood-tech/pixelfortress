// Map registry. Map data is generated deterministically from builder code (same on server & client).
import { buildDustyDepot } from './dusty-depot.js';
import { buildFrostfall } from './frostfall.js';
import { buildPixelworks } from './pixelworks.js';
import { buildSandstoneFortress } from './sandstone-fortress.js';
import { buildNeonDistrict } from './neon-district.js';
import { buildOvergrownOutpost } from './overgrown-outpost.js';

const BUILDERS = {
  dusty_depot: buildDustyDepot,
  frostfall: buildFrostfall,
  pixelworks: buildPixelworks,
  sandstone_fortress: buildSandstoneFortress,
  neon_district: buildNeonDistrict,
  overgrown_outpost: buildOvergrownOutpost,
};

export const MAP_IDS = Object.keys(BUILDERS);
const cache = new Map();

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
