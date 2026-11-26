// Cosmetic item catalog (visual only — no stats). Generated deterministically from shapes × colourways,
// so client and server agree on every item id. ~900 items across 8 slots and 7 rarities, including
// class-locked items that only that class can wear. How players acquire items is not decided yet:
// for now everyone owns the starter set (plus anything migrated from older profiles).
import { CLASS_IDS } from './classes.js';

export const RARITIES = [
  { id: 'common', name: 'Common', color: '#b4b4b4' },
  { id: 'uncommon', name: 'Uncommon', color: '#5fc45f' },
  { id: 'rare', name: 'Rare', color: '#4c8ff2' },
  { id: 'epic', name: 'Epic', color: '#a65df2' },
  { id: 'legendary', name: 'Legendary', color: '#f2c22e' },
  { id: 'mythic', name: 'Mythic', color: '#6fe6ff' },
  { id: 'iridescent', name: 'Iridescent', color: 'rainbow' },
];

export const SLOTS = ['hat', 'mask', 'accessory', 'weaponSkin', 'gloves', 'victoryPose', 'elimEffect', 'banner'];
export const SLOT_NAMES = { hat: 'Hats', mask: 'Masks', accessory: 'Accessories', weaponSkin: 'Weapon skins', gloves: 'Gloves', victoryPose: 'Victory poses', elimEffect: 'Elimination effects', banner: 'Profile banners' };

// Colourways shared by hats / masks / accessories. tier adds to the shape's base rarity.
export const COLORWAYS = [
  { id: 'classic', prefix: '', tier: 0, colors: null },
  { id: 'team', prefix: 'Team', tier: 0, colors: ['team', 'teamdark', 0xefe6cf] },
  { id: 'forest', prefix: 'Forest', tier: 1, colors: [0x3f6b34, 0x6c8f3a, 0xc9b36a] },
  { id: 'midnight', prefix: 'Midnight', tier: 1, colors: [0x1d2233, 0x3a4566, 0x9fb6e0] },
  { id: 'crimson', prefix: 'Crimson', tier: 2, colors: [0x8a1c22, 0x3a0d10, 0xe8b34a] },
  { id: 'royal', prefix: 'Royal', tier: 2, colors: [0x4b2a7a, 0x2a1748, 0xf0c94a] },
  { id: 'golden', prefix: 'Golden', tier: 3, colors: [0xe6b53a, 0xa87a18, 0xfff0b0], fx: 'shine' },
  { id: 'aurora', prefix: 'Aurora', tier: 4, colors: [0x46e0d0, 0x2a7ad8, 0xd8fff8], fx: 'glow' },
  { id: 'prismatic', prefix: 'Prismatic', tier: 5, colors: [0xff5a9a, 0x5adfff, 0xfff27a], fx: 'rainbow' },
];
const CLASS_COLORWAYS = ['classic', 'crimson', 'golden', 'prismatic'];

// Generic shapes (any class). colors: default palette [main, secondary, accent].
const HATS = [
  ['beanie', 'Pixel Beanie', 0, [0x8a3b2e, 0x5a2219, 0xefe6cf]], ['cap', 'Ball Cap', 0, [0x3a5a8a, 0x22344f, 0xefe6cf]],
  ['bucket', 'Bucket Hat', 0, [0x8f8a6a, 0x605b44, 0x3a3a3a]], ['headband', 'Sweat Band', 0, [0xd84a3a, 0xefe6cf, 0x222222]],
  ['hardhat', 'Site Hard Hat', 0, [0xe8b030, 0xb08018, 0x222222]], ['cone', 'Traffic Cone', 1, [0xff7a20, 0xefefef, 0x222222]],
  ['fez', 'Tasselled Fez', 1, [0xb02a2a, 0x701818, 0x222222]], ['beret', 'Beret', 1, [0x2a2a30, 0x18181c, 0xd84a3a]],
  ['cowboy', 'Ten-Block Hat', 1, [0x8a5a32, 0x5e3c1e, 0x3a2a1a]], ['tophat', 'Boxy Top Hat', 1, [0x1c1c1e, 0x0e0e10, 0xb02a2a]],
  ['bowler', 'Bowler', 1, [0x2a2420, 0x161210, 0x6a4a2a]], ['chef', 'Chef Toque', 1, [0xf2f2ee, 0xd0d0cc, 0x222222]],
  ['party', 'Party Cone', 1, [0x5adfff, 0xff5a9a, 0xfff27a]], ['pilot', 'Aviator Cap', 1, [0x6a4a2a, 0x3a2a1a, 0x9ad0ff]],
  ['mohawk', 'Block Mohawk', 1, [0x3ac24a, 0x22802e, 0x222222]], ['headphones', 'Studio Headphones', 1, [0x222226, 0xd84a3a, 0xefe6cf]],
  ['propeller', 'Propeller Beanie', 2, [0xd84a3a, 0x3a72c4, 0xe8b030]], ['viking', 'Viking Helm', 2, [0x8a8f96, 0xf0e8d0, 0x6a4a2a]],
  ['wizard', 'Wizard Hat', 2, [0x3a2a8a, 0x22185a, 0xfff27a]], ['bunny', 'Bunny Ears', 2, [0xf2f2ee, 0xffb0c8, 0x222222]],
  ['antlers', 'Antlers', 2, [0x8a6a42, 0x5e4426, 0xefe6cf]], ['sombrero', 'Fiesta Sombrero', 2, [0xd8b060, 0xb02a2a, 0x3ac24a]],
  ['crown', 'Block Crown', 3, [0xe8b830, 0xa87a18, 0xd8384a]], ['halo', 'Field Halo', 3, [0xfff28a, 0xffffff, 0xfff28a]],
  ['astro', 'Astro Helmet', 3, [0xefefef, 0x9ad0ff, 0xd84a3a]],
];
const MASKS = [
  ['bandana', 'Bandana', 0, [0xb02a2a, 0x701818, 0xefe6cf]], ['shades', 'Block Shades', 0, [0x151515, 0x3f7fd6, 0xd8f0ff]],
  ['moustache', 'Handlebar Moustache', 0, [0x3a2414, 0x24160c, 0x000000]], ['clownnose', 'Clown Nose', 1, [0xe83a3a, 0xff8a8a, 0x000000]],
  ['monocle', 'Monocle', 1, [0xd8b040, 0xbfe6ff, 0x222222]], ['glasses3d', '3D Glasses', 1, [0xefefef, 0xe83a3a, 0x3ad8ff]],
  ['skigoggles', 'Ski Goggles', 1, [0x222222, 0xffa040, 0xefefef]], ['ninja', 'Shinobi Wrap', 2, [0x1c1c22, 0x0e0e12, 0xd84a3a]],
  ['visor', 'Neon Visor', 2, [0x3ff2ff, 0x1c1c22, 0xffffff]], ['hockey', 'Goalie Mask', 2, [0xefefe8, 0xb02a2a, 0x222222]],
  ['gasmask', 'Filter Mask', 2, [0x3a3e44, 0x6a7078, 0x9ad0a0]], ['skull', 'Skull Face', 3, [0xefe8d8, 0x222222, 0xb02a2a]],
  ['faceplate', 'Cyber Faceplate', 3, [0x9aa1a8, 0x3ff2ff, 0x2a2e34]],
];
const ACCESSORIES = [
  ['scarf', 'Knit Scarf', 0, [0xb02a2a, 0xefe6cf, 0x701818]], ['dogtags', 'Dog Tags', 0, [0xc8ced4, 0x6a7078, 0x000000]],
  ['medals', 'Medal Rack', 1, [0xe8b830, 0xc0c0c8, 0xb07040]], ['bowtie', 'Bow Tie', 0, [0xb02a2a, 0x701818, 0x000000]],
  ['backpack', 'Field Pack', 0, [0x6a7a3a, 0x4a5428, 0x3a2a1a]], ['antenna', 'Radio Antenna', 1, [0x2a2a2a, 0xff4040, 0x000000]],
  ['lei', 'Flower Lei', 1, [0xff5a9a, 0xfff27a, 0x5adfff]], ['shoulderpads', 'Gridiron Pads', 1, [0xefefef, 0xb02a2a, 0x222222]],
  ['guitar', 'Back Guitar', 2, [0xb06a30, 0x3a2414, 0xefefef]], ['cape', 'Hero Cape', 2, [0xb02a2a, 0x701818, 0xe8b830]],
  ['sword', 'Sheathed Blade', 2, [0x3a2414, 0xc8ced4, 0xe8b830]], ['balloon', 'Lucky Balloon', 2, [0xe83a3a, 0xffffff, 0x222222]],
  ['jetpack', 'Jet Pack', 3, [0x9aa1a8, 0x3a3e44, 0xff8a2a]], ['wings', 'Pixel Wings', 3, [0xf4f4f4, 0xd8e4f0, 0xfff28a]],
];
// Class-locked shapes: [class, slot, key, name, baseTier, colors]
const CLASS_ITEMS = [
  ['scout', 'hat', 'batterhelmet', "Batter's Helmet", 1, [0x2a4a8a, 0x1a2a4a, 0xefefef]],
  ['scout', 'hat', 'newsboy', 'Paperboy Cap', 1, [0x6a6052, 0x4a4238, 0x222222]],
  ['scout', 'mask', 'eyeblack', 'Eye Black', 1, [0x111111, 0x000000, 0x000000]],
  ['scout', 'accessory', 'pennant', 'Team Pennant', 1, ['team', 0xefe6cf, 0x6a4a2a]],
  ['spy', 'hat', 'fedora', 'Shadow Fedora', 2, [0x2a2420, 0x161210, 0x8a2a2a]],
  ['spy', 'hat', 'beretnoir', 'Beret Noir', 1, [0x1c1c22, 0x0e0e12, 0x8a2a2a]],
  ['spy', 'mask', 'domino', 'Domino Mask', 1, [0x111111, 0x8a2a2a, 0x000000]],
  ['spy', 'accessory', 'rose', 'Lapel Rose', 1, [0xc81e2a, 0x3a7a2a, 0x000000]],
  ['marksman', 'hat', 'bushhat', 'Slouch Hat', 1, [0x7a6a48, 0x5a4a30, 0xb02a2a]],
  ['marksman', 'hat', 'gillie', 'Gillie Hood', 2, [0x4a6a2e, 0x6a7a3a, 0x3a4a22]],
  ['marksman', 'mask', 'aviators', 'Aviator Shades', 1, [0xd8b040, 0x2a3a4a, 0x000000]],
  ['marksman', 'accessory', 'quiver', 'Cartridge Quiver', 1, [0x6a4a2a, 0xd8b040, 0x3a2a1a]],
  ['mechanic', 'hat', 'weldmask', 'Welding Helmet', 2, [0x3a3e44, 0x22252a, 0x7af0a0]],
  ['mechanic', 'hat', 'minerlamp', 'Lamp Hard Hat', 1, [0xe8b030, 0xb08018, 0xfff6c0]],
  ['mechanic', 'mask', 'safetyglasses', 'Safety Specs', 1, [0xbfe6ff, 0xe8b030, 0x000000]],
  ['mechanic', 'accessory', 'toolbelt', 'Loaded Tool Belt', 1, [0x6a4a2a, 0x9aa1a8, 0xe8b030]],
  ['doctor', 'hat', 'surgcap', 'Surgical Cap', 1, [0x5aa8a0, 0x3a7a72, 0xefefef]],
  ['doctor', 'hat', 'mirrorband', 'Diagnostic Band', 1, [0x3a3a3a, 0xd8e8f0, 0xffffff]],
  ['doctor', 'mask', 'surgmask', 'Surgical Mask', 1, [0x9ad8d0, 0x6aa8a0, 0x000000]],
  ['doctor', 'accessory', 'stethoscope', 'Stethoscope', 1, [0x2a2a2e, 0xc8ced4, 0x000000]],
  ['juggernaut', 'hat', 'ushanka', 'Fur Ushanka', 1, [0x5a4a3a, 0x3a2e24, 0xb02a2a]],
  ['juggernaut', 'hat', 'tanker', 'Tanker Helmet', 2, [0x4a4a3a, 0x2e2e24, 0x6a4a2a]],
  ['juggernaut', 'mask', 'warpaint', 'War Paint', 1, ['team', 0x111111, 0x000000]],
  ['juggernaut', 'accessory', 'ammobelt', 'Double Bandolier', 1, [0xc9a14a, 0x6a4a2a, 0x8a6a2a]],
  ['incinerator', 'hat', 'firehelm', 'Fire Brigade Helmet', 2, [0xb02a2a, 0xe8b030, 0x222222]],
  ['incinerator', 'hat', 'pilotlight', 'Pilot Light', 1, [0x3a3a3a, 0xff8a2a, 0xfff080]],
  ['incinerator', 'mask', 'respirator', 'Twin Respirator', 1, [0x2a2a2a, 0x6a7078, 0xff8a2a]],
  ['incinerator', 'accessory', 'fueltank', 'Spare Fuel Tank', 1, [0xb02a2a, 0x3a3a3a, 0xe8b030]],
  ['demolitionist', 'hat', 'bombhelm', 'Bomb Squad Helmet', 2, [0x4a5a3a, 0x2e3a24, 0xbfe6ff]],
  ['demolitionist', 'hat', 'blastcap', 'Blasting Cap', 1, [0xb02a2a, 0x701818, 0xe8b030]],
  ['demolitionist', 'mask', 'blastgoggles', 'Blast Goggles', 1, [0x2a2a2a, 0xffb040, 0x000000]],
  ['demolitionist', 'accessory', 'dynamitebelt', 'Dynamite Sash', 1, [0xc8402f, 0xe8e8e8, 0x3a2a1a]],
  ['soldier', 'hat', 'officercap', "Officer's Cap", 2, [0x3e4434, 0x22261c, 0xe8b830]],
  ['soldier', 'hat', 'garrison', 'Garrison Cap', 1, [0x5a5e44, 0x3a3e2a, 0xb02a2a]],
  ['soldier', 'mask', 'cigar', 'Field Cigar', 1, [0x6a4a2a, 0xff7a30, 0xb8b0a0]],
  ['soldier', 'accessory', 'warmedals', 'Service Medals', 1, [0xe8b830, 0xb02a2a, 0x2a4a8a]],
];

// Weapon skins: pattern × palette. tier sums to rarity.
const SKIN_PATTERNS = [
  ['solid', 'Paint', 0], ['stripes', 'Striped', 0], ['checker', 'Checkered', 1], ['camo', 'Camo', 1], ['digital', 'Digital', 1],
  ['dots', 'Polka', 1], ['chevron', 'Chevron', 2], ['carbon', 'Carbon Weave', 2], ['damascus', 'Damascus', 2], ['circuit', 'Circuit', 3],
  ['lava', 'Molten', 3], ['galaxy', 'Galaxy', 3], ['gilded', 'Gilded', 3],
];
const SKIN_PALETTES = [
  ['desert', 'Desert', 0, [0xc8a46a, 0x8a6a3a, 0xefe6cf]], ['arctic', 'Arctic', 0, [0xe8eef4, 0x9aaab8, 0x3a4a5a]],
  ['jungle', 'Jungle', 1, [0x3f6b34, 0x22402a, 0x8a9a4a]], ['urban', 'Urban', 1, [0x5a5e66, 0x2a2c32, 0xb8bcc4]],
  ['candy', 'Candy', 2, [0xff7ab8, 0xf4f4f4, 0x7ae0ff]], ['blaze', 'Blaze', 2, [0xe83a1a, 0xffb020, 0x3a0a04]],
  ['royal', 'Royal', 3, [0x4b2a7a, 0xe6b53a, 0x1c1030]], ['neon', 'Neon', 3, [0x140d24, 0xff4fb0, 0x3ff2ff]],
];
const CLASS_SKINS = [
  ['scout', 'sandlot', 'Sandlot', 2, 'stripes', [0xefefef, 0x2a4a8a, 0xb02a2a]], ['scout', 'speedster', 'Speedster', 3, 'chevron', [0xffd020, 0x222222, 0xff5a20]],
  ['spy', 'velvet', 'Velvet', 2, 'damascus', [0x3a0d1a, 0x8a1c3a, 0xe8b34a]], ['spy', 'noir', 'Noir', 3, 'carbon', [0x111111, 0x2a2a2a, 0xefefef]],
  ['marksman', 'ghillie', 'Ghillie', 2, 'camo', [0x4a6a2e, 0x2a3a1a, 0x8a7a4a]], ['marksman', 'tracer', 'Tracer', 3, 'circuit', [0x1a2030, 0x3ff2ff, 0x9ad0ff]],
  ['mechanic', 'hazard', 'Hazard', 2, 'chevron', [0xe8b030, 0x222222, 0xefefef]], ['mechanic', 'blueprint', 'Blueprint', 3, 'circuit', [0x1a3a7a, 0xefefef, 0x6ab0ff]],
  ['doctor', 'sterile', 'Sterile', 2, 'solid', [0xf4f4f4, 0x9ad8d0, 0xe83a3a]], ['doctor', 'vital', 'Vital Signs', 3, 'circuit', [0x0e1a14, 0x5aff8a, 0xefefef]],
  ['juggernaut', 'foundry', 'Foundry', 2, 'damascus', [0x4a4a4a, 0xe8892c, 0x222222]], ['juggernaut', 'bear', 'Bear Hide', 3, 'camo', [0x5a4a3a, 0x3a2e24, 0xb08a54]],
  ['incinerator', 'ember', 'Ember', 2, 'lava', [0x2a0e08, 0xff6a1a, 0xffd040]], ['incinerator', 'ashen', 'Ashen', 3, 'digital', [0x3a3a3a, 0x7a7a7a, 0xff8a2a]],
  ['demolitionist', 'tnt', 'TNT', 2, 'stripes', [0xc8402f, 0xefe6cf, 0x3a2a1a]], ['demolitionist', 'shrapnel', 'Shrapnel', 3, 'galaxy', [0x2a2e24, 0xb8c0a8, 0xffb040]],
  ['soldier', 'drab', 'Olive Drab', 2, 'camo', [0x4a5034, 0x2e3222, 0x8a8a5a]], ['soldier', 'liberty', 'Liberty', 3, 'chevron', [0x1c2a5a, 0xefefef, 0xb02a2a]],
];
const GLOVE_COLORS = [
  ['black', 'Tactical Black', 0, 0x222222], ['tan', 'Work Tan', 0, 0xb08a54], ['white', 'Clean White', 0, 0xf2f2ee],
  ['red', 'Crimson Grip', 1, 0xb02a2a], ['blue', 'Cobalt Grip', 1, 0x2a5ab0], ['green', 'Moss Grip', 1, 0x3f7a34],
  ['purple', 'Velvet Grip', 2, 0x6a2a9a], ['orange', 'Blaze Grip', 2, 0xe8721a], ['gold', 'Gold Knuckles', 3, 0xe6b53a],
  ['chrome', 'Chrome Fists', 4, 0xd8e0e8], ['prism', 'Prism Gauntlets', 5, 0xff5a9a],
];
const GLOVE_STYLES = [['plain', '', 0], ['cuffed', 'Cuffed', 1], ['striped', 'Racing', 1]];
const POSES = [
  ['flex', 'Flex', 0], ['salute', 'Salute', 0], ['wave', 'Big Wave', 0], ['point', 'Point Ahead', 0], ['shrug', 'Shrug', 1],
  ['cheer', 'Cheer', 1], ['think', 'Ponder', 1], ['clap', 'Applause', 1], ['champion', 'Champion', 2], ['dab', 'Point Skyward', 2],
  ['starjump', 'Star Jump', 2], ['robot', 'Robot', 2], ['airguitar', 'Air Guitar', 3], ['guard', 'On Guard', 2], ['heart', 'Heart Hands', 3],
  ['facepalm', 'Facepalm', 3], ['victory', 'Double Victory', 4], ['meditate', 'Calm Focus', 4], ['bow', 'Grand Bow', 5], ['legend', 'Legend Stance', 6],
];
const CLASS_POSES = [
  ['scout', 'bunt', 'Bunt Stance', 2], ['spy', 'tiptoe', 'Gentleman', 2], ['marksman', 'scan', 'Scan the Horizon', 2], ['mechanic', 'wrenchtwirl', 'Spanner Spin', 2],
  ['doctor', 'diagnose', 'Diagnosis', 2], ['juggernaut', 'beast', 'Unstoppable', 2], ['incinerator', 'warm', 'Warm Hands', 2], ['demolitionist', 'detonate', 'Plunger Push', 2],
  ['soldier', 'attention', 'At Attention', 2],
];
const EFFECTS = [
  ['pixels', 'Pixel Burst', 0, [0xc8402f, 0x8a2a1f, 0xffffff], 9, 5], ['confetti', 'Confetti', 0, [0xff3f6a, 0x3ff2ff, 0xffe03f, 0x58ff6a], 5, 6],
  ['dust', 'Dust Cloud', 0, [0xb8a888, 0x8a7a5a, 0xd8ccb0], -1, 3], ['sparks', 'Sparks', 1, [0xffe070, 0xffa030, 0xffffff], 12, 9],
  ['leaves', 'Falling Leaves', 1, [0x6a9a3a, 0xc8a030, 0xb0602a], 2, 4], ['bubbles', 'Bubbles', 1, [0x9ad8ff, 0xffffff, 0x6ab0e0], -3, 3],
  ['snow', 'Flurry', 1, [0xffffff, 0xd8ecff, 0xbfe0ff], 1, 4], ['hearts', 'Hearts', 2, [0xff4f8a, 0xff8ab0, 0xffffff], -2, 5],
  ['coins', 'Coin Shower', 2, [0xffd040, 0xe8a820, 0xfff0a0], 14, 7], ['embers', 'Embers', 2, [0xff6a1a, 0xffb040, 0x3a0a04], -4, 4],
  ['slime', 'Slime Pop', 2, [0x58ff6a, 0x2ab03a, 0xc8ff90], 10, 6], ['stars', 'Starfall', 3, [0xfff27a, 0xffffff, 0x9ad0ff], 3, 6],
  ['lightning', 'Static Shock', 3, [0x7af0ff, 0xffffff, 0x3a7aff], 0, 11], ['ghosts', 'Spirits', 3, [0xefffff, 0xbfe6ff, 0x9ab0c8], -5, 2],
  ['petals', 'Petal Storm', 3, [0xffb0d0, 0xff7ab0, 0xffffff], 1, 6], ['glitch', 'Glitch', 4, [0xff2a6a, 0x2affea, 0xffffff, 0x000000], 0, 8],
  ['void', 'Void Rift', 4, [0x3a0a6a, 0x8a2aff, 0x000000], -3, 5], ['gold', 'Gold Rush', 4, [0xffd040, 0xffe890, 0xc89a28], 8, 8],
  ['fireworks', 'Fireworks', 5, [0xff3f6a, 0x3ff2ff, 0xffe03f, 0x58ff6a, 0xffffff], 6, 12], ['aurora', 'Aurora Veil', 5, [0x46e0d0, 0x2a7ad8, 0xb05aff], -2, 5],
  ['supernova', 'Supernova', 6, [0xffffff, 0xfff27a, 0xff8a2a, 0x8ad8ff], 4, 14], ['prism', 'Prism Shatter', 6, [0xff5a9a, 0x5adfff, 0xfff27a, 0x7aff8a, 0xb07aff], 7, 12],
];
const BANNER_PATTERNS = [['solid', 'Plain', 0], ['stripes', 'Striped', 0], ['diagonal', 'Diagonal', 1], ['dots', 'Dotted', 1], ['checker', 'Checkered', 1], ['chevron', 'Chevron', 2], ['rays', 'Sunburst', 2], ['grid', 'Gridded', 2], ['waves', 'Rippled', 3]];
const BANNER_PALETTES = [
  ['steel', 'Steel', 0, ['#3a4048', '#23272d']], ['walnut', 'Walnut', 0, ['#5a4232', '#2e2219']], ['hazard', 'Hazard', 0, ['#f0b429', '#222222']],
  ['frost', 'Frost', 1, ['#d8f0fb', '#6aa0c8']], ['forest', 'Forest', 1, ['#4f7c35', '#22402a']], ['sunset', 'Sunset', 2, ['#f3b04b', '#a8423a']],
  ['neon', 'Neon', 2, ['#ff3fa8', '#3ff2ff']], ['royal', 'Royal', 3, ['#4b2a7a', '#e6b53a']], ['inferno', 'Inferno', 3, ['#ff6a1a', '#3a0a04']],
];

const clampR = (n) => Math.max(0, Math.min(6, n));

function build() {
  const items = [];
  const add = (it) => { items.push(it); };
  const shaped = (slot, list, classes = null) => {
    for (const [key, name, tier, colors] of list) {
      for (const cw of COLORWAYS) {
        add({
          id: `${slot}:${key}:${cw.id}`, slot, shape: key, name: cw.prefix ? `${cw.prefix} ${name}` : name,
          rarity: clampR(tier + cw.tier), colors: cw.colors || colors, fx: cw.fx || null, classes,
        });
      }
    }
  };
  shaped('hat', HATS);
  shaped('mask', MASKS);
  shaped('accessory', ACCESSORIES);
  for (const [cls, slot, key, name, tier, colors] of CLASS_ITEMS) {
    for (const cwId of CLASS_COLORWAYS) {
      const cw = COLORWAYS.find((c) => c.id === cwId);
      add({ id: `${slot}:${key}:${cw.id}`, slot, shape: key, name: cw.prefix ? `${cw.prefix} ${name}` : name, rarity: clampR(tier + cw.tier), colors: cw.colors || colors, fx: cw.fx || null, classes: [cls] });
    }
  }
  for (const [pk, pn, pt] of SKIN_PATTERNS) {
    for (const [ck, cn, ct, colors] of SKIN_PALETTES) {
      const rarity = clampR(pt + ct);
      add({ id: `weaponSkin:${pk}:${ck}`, slot: 'weaponSkin', shape: pk, name: `${cn} ${pn}`, rarity, colors, fx: pk === 'lava' || pk === 'circuit' || pk === 'galaxy' ? 'glow' : rarity >= 6 ? 'rainbow' : null, classes: null });
    }
  }
  for (const [cls, key, name, tier, pattern, colors] of CLASS_SKINS) {
    add({ id: `weaponSkin:${cls}_${key}:classic`, slot: 'weaponSkin', shape: pattern, name, rarity: tier, colors, fx: null, classes: [cls] });
    add({ id: `weaponSkin:${cls}_${key}:prismatic`, slot: 'weaponSkin', shape: pattern, name: `Prismatic ${name}`, rarity: 6, colors, fx: 'rainbow', classes: [cls] });
  }
  add({ id: 'weaponSkin:factory:classic', slot: 'weaponSkin', shape: 'none', name: 'Factory Finish', rarity: 0, colors: null, fx: null, classes: null, starter: true });
  for (const [gk, gn, gt, color] of GLOVE_COLORS) {
    for (const [sk, sn, st] of GLOVE_STYLES) {
      add({ id: `gloves:${gk}:${sk}`, slot: 'gloves', shape: sk, name: sn ? `${sn} ${gn}` : gn, rarity: clampR(gt + st), colors: [color, sk === 'plain' ? color : 0xefe6cf, 0x222222], fx: gk === 'prism' ? 'rainbow' : gk === 'chrome' ? 'shine' : null, classes: null });
    }
  }
  for (const [pk, pn, pt] of POSES) add({ id: `victoryPose:${pk}`, slot: 'victoryPose', shape: pk, name: pn, rarity: pt, colors: null, fx: null, classes: null });
  for (const [cls, pk, pn, pt] of CLASS_POSES) add({ id: `victoryPose:${pk}`, slot: 'victoryPose', shape: pk, name: pn, rarity: pt, colors: null, fx: null, classes: [cls] });
  for (const [ek, en, et, colors, g, speed] of EFFECTS) {
    add({ id: `elimEffect:${ek}`, slot: 'elimEffect', shape: ek, name: en, rarity: et, colors, g, speed, fx: null, classes: null });
    if (et >= 2 && et <= 4) add({ id: `elimEffect:${ek}_team`, slot: 'elimEffect', shape: ek, name: `Team ${en}`, rarity: et + 1, colors: ['team', ...colors.slice(0, 2)], g, speed, fx: null, classes: null });
  }
  for (const [pk, pn, pt] of BANNER_PATTERNS) {
    for (const [ck, cn, ct, colors] of BANNER_PALETTES) {
      add({ id: `banner:${pk}:${ck}`, slot: 'banner', shape: pk, name: `${cn} ${pn}`, rarity: clampR(pt + ct), colors, fx: null, classes: null });
    }
  }
  add({ id: 'banner:prism:legend', slot: 'banner', shape: 'prism', name: 'Prismatic Legend', rarity: 6, colors: ['#ff5a9a', '#5adfff'], fx: 'rainbow', classes: null });
  return items;
}

export const ITEMS = build();
export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const ITEMS_BY_RARITY = RARITIES.map((_, r) => ITEMS.filter((i) => i.rarity === r && !i.starter));

// Items every new player owns (one per slot) so loadouts are never empty.
export const STARTER_ITEMS = ['hat:beanie:classic', 'mask:bandana:classic', 'accessory:scarf:classic', 'weaponSkin:factory:classic', 'gloves:black:plain', 'victoryPose:flex', 'elimEffect:pixels', 'banner:solid:steel'];
// Previous cosmetic ids map onto catalog items for profile migration.
export const LEGACY_MAP = {
  hat: { beanie: 'hat:beanie:classic', cone: 'hat:cone:classic', tophat: 'hat:tophat:classic', headphones: 'hat:headphones:classic', horns: 'hat:viking:classic', crown: 'hat:crown:classic', halo: 'hat:halo:classic' },
  mask: { bandana: 'mask:bandana:classic', shades: 'mask:shades:classic', visor: 'mask:visor:classic' },
  accessory: { scarf: 'accessory:scarf:classic', medals: 'accessory:medals:classic', antenna: 'accessory:antenna:classic' },
  weaponSkin: { camo: 'weaponSkin:camo:desert', carbon: 'weaponSkin:carbon:urban', candy: 'weaponSkin:stripes:candy', neon: 'weaponSkin:circuit:neon', gold: 'weaponSkin:gilded:royal' },
  gloves: { black: 'gloves:black:plain', team: 'gloves:red:plain', gold: 'gloves:gold:plain' },
  victoryPose: { flex: 'victoryPose:flex', salute: 'victoryPose:salute', cheer: 'victoryPose:cheer', dab: 'victoryPose:dab' },
  elimEffect: { pixels: 'elimEffect:pixels', confetti: 'elimEffect:confetti', sparks: 'elimEffect:sparks', hearts: 'elimEffect:hearts', gold: 'elimEffect:gold' },
  banner: { steel: 'banner:solid:steel', hazard: 'banner:stripes:hazard', sunset: 'banner:diagonal:sunset', frost: 'banner:solid:frost', neon: 'banner:rays:neon', circuit: 'banner:grid:forest' },
};

export function canWear(item, classId) {
  return !!item && (!item.classes || item.classes.includes(classId));
}

export function getItem(id) { return ITEM_BY_ID.get(id) || null; }

// ------------------------------------------------------------------ server-side validation
// Client sends { classId: { slot: itemId } , banner }. Keep only known items wearable by that class.
export function sanitizeLoadouts(input) {
  const out = {};
  for (const cls of CLASS_IDS) {
    const src = input && typeof input === 'object' && input[cls] && typeof input[cls] === 'object' ? input[cls] : {};
    const lo = {};
    for (const slot of SLOTS) {
      const it = typeof src[slot] === 'string' ? ITEM_BY_ID.get(src[slot]) : null;
      lo[slot] = it && it.slot === slot && canWear(it, cls) ? it.id : null;
    }
    out[cls] = lo;
  }
  return out;
}

// Random loadouts for bots so matches show off the catalog (mostly common/uncommon items).
export function randomLoadouts(rnd = Math.random) {
  const chance = { hat: 0.6, mask: 0.3, accessory: 0.35, weaponSkin: 0.45, gloves: 0.3, victoryPose: 1, elimEffect: 0.7, banner: 1 };
  const out = {};
  for (const cls of CLASS_IDS) {
    const lo = {};
    for (const slot of SLOTS) {
      lo[slot] = null;
      if (rnd() > chance[slot]) continue;
      const maxR = rnd() < 0.85 ? 2 : 4;
      const pool = ITEMS.filter((i) => i.slot === slot && i.rarity <= maxR && canWear(i, cls));
      if (pool.length) lo[slot] = pool[Math.floor(rnd() * pool.length)].id;
    }
    out[cls] = lo;
  }
  return out;
}
