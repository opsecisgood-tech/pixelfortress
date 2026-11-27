// The Titan: an admin-only transformation (/titan <player>). A towering purple warlord in gold armour
// with a gauntlet that holds six gems. Each confirmed kill adds one random gem the Titan doesn't have
// yet; every gem unlocks its own power, and all six unlock the Snap.
export const STONES = ['time', 'power', 'mind', 'soul', 'space', 'reality'];
export const STONE_INFO = {
  time: { name: 'Time', color: 0x3cff72, css: '#3cff72', key: '1', power: 'Speed up or slow down a player (Z / X sets the strength)' },
  power: { name: 'Power', color: 0xb44cff, css: '#b44cff', key: 'P · G', power: 'P: Power Punch · G: Grab and throw' },
  mind: { name: 'Mind', color: 0xffe03a, css: '#ffe03a', key: '2', power: 'Take control of an enemy' },
  soul: { name: 'Soul', color: 0xff8a1a, css: '#ff8a1a', key: '3', power: 'Reveal every soul and sap nearby enemies' },
  space: { name: 'Space', color: 0x2f5cff, css: '#4a78ff', key: 'F', power: 'Open an entrance and an exit portal' },
  reality: { name: 'Reality', color: 0xff2b2b, css: '#ff3b3b', key: 'R', power: 'Copy a prop, then place damaging illusions of it' },
};
export const stoneBit = (s) => 1 << STONES.indexOf(s);
export const stoneMask = (list) => list.reduce((m, s) => m | stoneBit(s), 0);
export const hasStone = (mask, s) => !!(mask & stoneBit(s));
export const ALL_STONES = (1 << STONES.length) - 1;

// status effects on any player (replicated per player as a bit field)
export const TFX = { STUN: 1, GRAB: 2, MIND: 4, SAP: 8, SOUL: 16, TIME: 32, CONTROL: 64 };

export const TITAN = {
  health: 600,
  fist: 'titanfist',
  time: { cooldown: 10, duration: 10, range: 45, steps: [0.3, 0.45, 0.6, 0.8, 1.25, 1.5, 2, 2.5], defaultStep: 2, rampPerSec: 1.6 },
  mind: { cooldown: 24, duration: 7, range: 40 },
  reality: { cooldown: 1.2, max: 4, damage: 45, sampleRange: 30, placeRange: 30, maxDim: 4.2, life: 120 },
  punch: { cooldown: 6, damage: 120, range: 3.8, knock: 20, up: 7.5, stun: 1.6 },
  grab: { cooldown: 10, range: 3.8, hold: 2.6, throwSpeed: 18, throwUp: 6.5, damage: 45, stun: 1.2 },
  space: { cooldown: 1.2, range: 40, radius: 0.95, travelCooldown: 1.2 },
  soul: { cooldown: 30, duration: 8, sapRadius: 22, sapTime: 5, sapMove: 0.6, sapDamage: 0.5, passiveRadius: 16 },
  snap: { windup: 1.9 },
};
