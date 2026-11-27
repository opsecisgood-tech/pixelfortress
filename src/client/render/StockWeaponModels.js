// Stock weapon sprites: the default item in each class slot. These replace the earlier placeholder art
// for the stock ids and add the new stock items (sticky launcher, shovel, bottle, fists, kukri, sapper).
// Same format as WEAPON_MODELS: side view, y down, guns point +x with the grip pixel at `grip`,
// melee weapons have the tip toward +x. `fp` is optional (first-person placement); when omitted the
// previous placement for that id is kept.
export const STOCK_MODELS = {
  // ---------------- SCOUT
  // Scattergun: short double barrel, wooden stock and pump fore-end.
  scattershot: {
    w: 46, h: 16, px: 0.0172, grip: [14, 11], muzzle: [45, 4],
    draw(S) {
      S.poly([[0, 5], [10, 4], [13, 8], [12, 9], [3, 12], [0, 12]], 'wood', 5);
      S.line(2, 8, 9, 6, 'woodDark'); S.rect(0, 5, 1, 7, 'black', 5);
      S.rect(10, 3, 8, 6, 'gunmetal', 5); S.line(11, 3, 17, 3, 'metal', 5); S.px(12, 5, 'dark', 5); S.px(15, 5, 'dark', 5);
      S.poly([[11, 9], [16, 9], [14, 15], [9, 15]], 'wood', 5); S.line(12, 10, 10, 14, 'woodDark');
      S.line(16, 9, 16, 11, 'dark', 1); S.line(16, 11, 19, 11, 'dark', 1); S.line(19, 9, 19, 11, 'dark', 1); S.px(17, 10, 'dark', 1);
      S.rect(18, 3, 27, 2, 'metal', 3); S.line(18, 3, 44, 3, 'hl'); S.rect(18, 5, 25, 2, 'gunmetal', 3);
      S.px(44, 3, 'black', 3); S.px(42, 5, 'black', 3); S.px(43, 2, 'dark', 1);
      S.rect(24, 7, 10, 3, 'wood', 5); for (const x of [25, 27, 29, 31]) S.line(x, 7, x, 9, 'woodDark');
    },
  },
  // Pistol: slim semi-automatic.
  sidekick: {
    w: 22, h: 15, px: 0.0145, grip: [6, 10], muzzle: [21, 3],
    draw(S) {
      S.rect(3, 1, 18, 4, 'gunmetal', 3); S.line(4, 1, 20, 1, 'metal', 3);
      for (const x of [4, 6, 8]) S.line(x, 2, x, 3, 'dark');
      S.px(20, 0, 'dark', 1); S.px(4, 0, 'dark', 1);
      S.rect(3, 5, 15, 2, 'dark', 3); S.px(21, 3, 'black', 1);
      S.poly([[2, 7], [8, 7], [7, 14], [1, 14]], 'black', 3); S.rect(3, 8, 3, 5, 'grip', 3); S.px(4, 14, 'brass', 3);
      S.line(8, 7, 8, 9, 'dark', 1); S.line(8, 9, 12, 9, 'dark', 1); S.line(12, 7, 12, 9, 'dark', 1); S.px(10, 8, 'dark', 1);
    },
  },
  // Bat: taped handle, knob and a long wooden barrel.
  streetbat: {
    w: 46, h: 8, px: 0.0175, grip: [6, 4], melee: true,
    draw(S) {
      S.rect(0, 1, 2, 6, 'woodDark', 5);
      S.rect(2, 3, 12, 2, 'tape', 3); for (const x of [4, 7, 10, 13]) S.line(x, 3, x, 4, 'khaki');
      S.poly([[14, 3], [28, 2], [44, 1], [45, 2], [45, 6], [44, 7], [28, 6], [14, 5]], 'wood', 5);
      S.line(18, 3, 43, 2, 'hl'); S.line(30, 5, 43, 6, 'woodDark'); S.line(45, 2, 45, 6, 'woodDark', 5);
    },
  },
  // ---------------- SOLDIER
  // Rocket launcher: shoulder tube with a flared front, rear exhaust, sight and two handles.
  blastcaster: {
    w: 62, h: 20, px: 0.0172, grip: [24, 15], muzzle: [61, 8],
    draw(S) {
      S.rect(6, 4, 48, 8, 'olive', 7); S.line(7, 5, 53, 5, 'hl'); S.line(6, 11, 53, 11, 'gunmetal', 7);
      S.poly([[54, 3], [61, 1], [61, 15], [54, 13]], 'dark', 7); S.rect(60, 4, 1, 8, 'black', 7); S.line(54, 3, 61, 1, 'gunmetal', 7);
      S.poly([[0, 2], [6, 4], [6, 12], [0, 14]], 'dark', 7); S.rect(0, 4, 1, 8, 'black', 7);
      S.rect(16, 4, 2, 8, 'gunmetal', 7); S.rect(46, 4, 2, 8, 'gunmetal', 7);
      S.rect(30, 4, 4, 8, 'team', 7);
      S.rect(36, 1, 7, 3, 'dark', 3); S.px(37, 0, 'light', 1); S.px(42, 0, 'light', 1);
      S.poly([[22, 12], [27, 12], [26, 19], [21, 19]], 'grip', 3);
      S.line(27, 12, 27, 14, 'dark', 1); S.line(27, 14, 30, 14, 'dark', 1);
      S.rect(40, 12, 3, 6, 'grip', 3);
    },
    fp: { pos: [0.26, -0.22, -0.36], scale: 0.85 },
  },
  // Sky Hopper: safety-orange training launcher with white bands, a flared padded mouth, a big padded
  // rear cup and hazard stripes along the top.
  skyhopper: {
    w: 62, h: 20, px: 0.0172, grip: [24, 15], muzzle: [61, 8],
    draw(S) {
      S.rect(6, 4, 48, 8, 'orange', 7); S.line(7, 5, 53, 5, 'hl'); S.line(6, 11, 53, 11, 'red', 7);
      for (const x of [14, 26, 44]) S.rect(x, 4, 3, 8, 'white', 7);
      for (let x = 30; x < 42; x += 3) { S.rect(x, 3, 2, 1, 'yellow', 7); S.rect(x + 1, 3, 1, 1, 'black', 7); }
      S.poly([[54, 2], [61, 0], [61, 16], [54, 14]], 'orange', 7); S.rect(60, 3, 1, 10, 'black', 7); S.line(54, 2, 61, 0, 'white', 7); S.line(54, 14, 61, 16, 'white', 7);
      S.poly([[0, 1], [6, 3], [6, 13], [0, 15]], 'white', 7); S.rect(0, 3, 1, 10, 'orange', 7); S.line(1, 2, 5, 3, 'light', 7);
      S.rect(36, 1, 6, 2, 'dark', 3); S.px(37, 0, 'yellow', 1);
      S.poly([[22, 12], [27, 12], [26, 19], [21, 19]], 'grip', 3);
      S.line(27, 12, 27, 14, 'dark', 1); S.line(27, 14, 30, 14, 'dark', 1);
      S.rect(40, 12, 3, 6, 'grip', 3);
    },
    fp: { pos: [0.26, -0.22, -0.36], scale: 0.85 },
  },
  // Shotgun: pump action with a tube magazine.
  breacher: {
    w: 50, h: 16, px: 0.0172, grip: [15, 11], muzzle: [49, 4],
    draw(S) {
      S.poly([[0, 5], [11, 4], [14, 8], [13, 9], [3, 12], [0, 12]], 'wood', 5);
      S.line(2, 8, 10, 6, 'woodDark'); S.rect(0, 5, 1, 7, 'black', 5);
      S.rect(11, 3, 10, 6, 'gunmetal', 5); S.line(12, 3, 20, 3, 'metal', 5); S.rect(14, 4, 4, 2, 'dark', 5);
      S.poly([[12, 9], [17, 9], [15, 15], [10, 15]], 'wood', 5); S.line(13, 10, 11, 14, 'woodDark');
      S.line(17, 9, 17, 11, 'dark', 1); S.line(17, 11, 20, 11, 'dark', 1); S.line(20, 9, 20, 11, 'dark', 1); S.px(18, 10, 'dark', 1);
      S.rect(21, 3, 28, 2, 'metal', 3); S.line(21, 3, 48, 3, 'hl'); S.px(48, 4, 'black', 3); S.px(47, 2, 'dark', 1);
      S.rect(21, 5, 22, 2, 'gunmetal', 3); S.px(43, 5, 'dark', 3);
      S.rect(26, 6, 11, 3, 'wood', 5); for (const x of [27, 29, 31, 33, 35]) S.line(x, 6, x, 8, 'woodDark');
    },
  },
  // ---------------- INCINERATOR
  // Flamethrower: fuel tank at the back, long pipe, flared nozzle with a pilot light.
  thermal: {
    w: 56, h: 22, px: 0.0166, grip: [16, 17], muzzle: [55, 10], flame: true,
    draw(S) {
      S.rect(2, 4, 18, 10, 'red', 7); S.line(3, 5, 19, 5, 'orange', 7);
      S.rect(5, 4, 2, 10, 'dark', 7); S.rect(15, 4, 2, 10, 'dark', 7);
      S.rect(9, 1, 4, 3, 'gunmetal', 3); S.px(10, 2, 'white', 3); S.px(11, 2, 'red', 3);
      S.rect(20, 8, 26, 4, 'metal', 5); S.line(20, 8, 45, 8, 'hl'); S.line(20, 11, 45, 11, 'gunmetal', 5);
      S.rect(28, 7, 2, 6, 'dark', 5); S.rect(38, 7, 2, 6, 'dark', 5);
      S.poly([[46, 7], [55, 5], [55, 15], [46, 13]], 'gunmetal', 5); S.rect(54, 7, 1, 6, 'black', 5);
      S.line(44, 6, 51, 6, 'brass', 1); S.px(52, 5, 'fire', 1);
      S.rect(34, 12, 3, 6, 'grip', 3);
      S.poly([[14, 14], [19, 14], [18, 21], [13, 21]], 'grip', 3);
      S.line(2, 14, 0, 19, 'black', 3);
    },
  },
  // Fire axe: red head with a broad blade on one side and a pick on the other. Drawn blade-down (as the
  // icon shows it); flipY puts the blade on the leading side of the swing in hand.
  furnaceaxe: {
    w: 43, h: 22, px: 0.0166, grip: [4, 9], melee: true, flipY: true,
    draw(S) {
      S.rect(0, 8, 34, 3, 'wood', 3); S.rect(0, 8, 8, 3, 'grip', 3); S.line(9, 8, 33, 8, 'hl');
      S.poly([[33, 7], [37, 7], [35, 1]], 'red', 3); S.px(35, 1, 'steel', 3);
      S.rect(32, 6, 6, 8, 'red', 5); S.line(33, 7, 37, 7, 'orange', 5);
      S.poly([[31, 13], [38, 13], [42, 20], [41, 21], [28, 21], [27, 20]], 'red', 3);
      S.line(28, 21, 41, 21, 'steel', 3); S.line(29, 20, 40, 20, 'light', 3); S.line(32, 14, 37, 14, 'orange', 3);
      S.rect(38, 8, 1, 3, 'woodDark', 3);
    },
  },
  // ---------------- DEMOLITIONIST
  // Grenade launcher: wooden stock, revolving drum and a stubby wide barrel.
  chargelauncher: {
    w: 44, h: 18, px: 0.0166, grip: [15, 13], muzzle: [43, 6],
    draw(S) {
      S.poly([[0, 5], [10, 4], [12, 9], [2, 12], [0, 12]], 'wood', 5); S.line(2, 8, 9, 6, 'woodDark'); S.rect(0, 5, 1, 7, 'black', 5);
      S.rect(10, 3, 4, 8, 'dark', 5);
      S.rect(14, 1, 11, 11, 'gunmetal', 7); S.line(15, 1, 24, 1, 'metal', 7);
      S.line(14, 4, 24, 4, 'dark', 7); S.line(14, 8, 24, 8, 'dark', 7); S.px(19, 6, 'brass', 7);
      S.rect(25, 3, 18, 6, 'metal', 5); S.line(25, 3, 40, 3, 'hl'); S.rect(41, 2, 2, 8, 'dark', 5); S.rect(42, 4, 1, 4, 'black', 5);
      S.px(34, 2, 'dark', 1);
      S.poly([[12, 11], [16, 11], [15, 17], [11, 17]], 'wood', 3);
      S.rect(30, 9, 4, 5, 'wood', 3);
    },
  },
  // Sticky launcher: long square tube with a flared mouth, charge gauge on top and hazard stripes.
  stickylauncher: {
    w: 50, h: 18, px: 0.0166, grip: [17, 13], muzzle: [49, 6],
    draw(S) {
      S.rect(0, 4, 10, 5, 'dark', 5); S.rect(0, 4, 1, 6, 'black', 5); S.line(1, 4, 9, 4, 'gunmetal', 5);
      S.rect(10, 2, 33, 8, 'gunmetal', 7); S.line(11, 3, 42, 3, 'metal', 7); S.line(10, 9, 42, 9, 'dark', 7);
      for (const x of [34, 37, 40]) S.rect(x, 2, 1, 8, 'yellow', 7);
      S.rect(43, 1, 6, 10, 'black', 7); S.rect(44, 2, 4, 8, 'dark', 7);
      S.rect(18, 0, 10, 2, 'olive', 3); S.px(26, 0, 'fire', 3); S.px(19, 0, 'glow', 3);
      S.rect(12, 4, 5, 4, 'team', 7);
      S.poly([[15, 10], [20, 10], [19, 17], [14, 17]], 'grip', 3);
      S.line(20, 10, 20, 12, 'dark', 1); S.line(20, 12, 23, 12, 'dark', 1);
      S.rect(31, 10, 3, 5, 'grip', 3);
    },
    fp: { pos: [0.22, -0.23, -0.42], scale: 0.85 },
  },
  // Bottle: green glass with a paper label.
  bottle: {
    w: 26, h: 9, px: 0.0165, grip: [5, 4], melee: true,
    draw(S) {
      S.rect(0, 3, 1, 3, 'brass', 3);
      S.rect(1, 3, 8, 3, 'green', 3); S.line(1, 3, 8, 3, 'hl');
      S.poly([[9, 3], [13, 1], [25, 1], [25, 8], [13, 8], [9, 6]], 'green', 5);
      S.line(13, 2, 24, 2, 'hl'); S.line(13, 7, 24, 7, 'olive', 5);
      S.rect(15, 2, 7, 5, 'tape', 5); S.rect(15, 4, 7, 1, 'red', 5);
    },
    fp: { pos: [0.24, -0.26, -0.4], scale: 1.15, rot: [-0.3, 0.2, -0.4] },
  },
  // ---------------- JUGGERNAUT
  // Minigun: heavy body, ammo box, carry handle and a six-barrel cluster.
  cyclone: {
    w: 60, h: 26, px: 0.0172, grip: [5, 14], muzzle: [59, 12], spin: { from: 27, to: 58, y: 12, r: 4 },
    draw(S) {
      S.rect(4, 4, 21, 15, 'dark', 7); S.line(5, 4, 24, 4, 'gunmetal', 7); S.line(4, 18, 24, 18, 'black', 7);
      for (const [x, y] of [[6, 6], [22, 6], [6, 16], [22, 16]]) S.px(x, y, 'brass', 7);
      S.rect(11, 8, 7, 5, 'team', 7);
      S.rect(8, 19, 12, 6, 'olive', 5); S.line(9, 20, 18, 20, 'brass', 5); S.line(8, 24, 19, 24, 'woodDark', 5);
      S.rect(9, 1, 12, 1, 'metal', 3); S.rect(9, 1, 1, 3, 'metal', 3); S.rect(20, 1, 1, 3, 'metal', 3);
      S.rect(25, 5, 2, 14, 'metal', 7);
      S.poly([[0, 10], [5, 10], [5, 18], [1, 18]], 'grip', 3);
    },
  },
  // Fists: no held model (both bare hands punch). This sprite is the icon only.
  fists: {
    w: 20, h: 16, px: 0.0165, grip: [3, 8], melee: true, fists: true,
    draw(S) {
      S.rect(0, 5, 5, 7, 'khaki', 5); S.line(1, 6, 1, 10, 'woodDark');
      S.poly([[5, 3], [15, 2], [19, 5], [19, 12], [16, 15], [6, 14], [5, 12]], 'khaki', 7);
      for (const y of [5, 8, 11]) S.line(14, y, 18, y, 'woodDark');
      S.poly([[6, 10], [12, 11], [12, 15], [6, 14]], 'khaki', 7); S.line(6, 10, 12, 11, 'woodDark'); S.line(7, 3, 14, 2, 'hl');
    },
  },
  // ---------------- MECHANIC
  pumpgun: null, // same art as the Shotgun (filled in below)
  wrench: {
    w: 36, h: 14, px: 0.016, grip: [4, 7], melee: true,
    draw(S) {
      S.rect(0, 5, 26, 4, 'metal', 3); S.line(1, 5, 25, 5, 'hl'); S.line(0, 8, 25, 8, 'gunmetal', 3);
      S.rect(1, 6, 2, 2, 'dark', 3);
      S.poly([[25, 3], [29, 0], [35, 0], [35, 14], [29, 14], [25, 11]], 'metal', 3);
      S.clear(30, 4, 6, 6); S.line(29, 4, 29, 9, 'gunmetal', 3); S.line(26, 3, 29, 0, 'hl');
    },
  },
  // ---------------- DOCTOR
  // Syringe gun: glass loader with four needles on top, pressure tank under the barrel.
  syringelauncher: {
    w: 42, h: 18, px: 0.016, grip: [11, 13], muzzle: [41, 7],
    draw(S) {
      S.rect(2, 4, 6, 7, 'white', 5); S.rect(2, 4, 6, 1, 'team', 5);
      S.rect(8, 5, 24, 5, 'metal', 5); S.line(9, 5, 31, 5, 'hl');
      S.rect(32, 6, 9, 3, 'gunmetal', 3); S.px(40, 7, 'black', 3);
      S.rect(12, 1, 17, 4, 'white', 3); for (const x of [13, 17, 21, 25]) S.rect(x, 1, 2, 4, 'glow', 3);
      S.rect(22, 10, 10, 4, 'red', 5); S.px(27, 11, 'white', 5); S.px(26, 12, 'white', 5); S.px(27, 12, 'white', 5); S.px(28, 12, 'white', 5); S.px(27, 13, 'white', 5);
      S.poly([[9, 10], [14, 10], [13, 17], [8, 17]], 'grip', 3);
    },
  },
  // Healing gun: bulky emitter with a hose to the back pack.
  medbeam: {
    w: 36, h: 20, px: 0.0155, grip: [10, 15], muzzle: [35, 9],
    draw(S) {
      S.rect(6, 4, 18, 9, 'white', 7); S.line(7, 4, 23, 4, 'light', 7);
      S.rect(8, 5, 5, 7, 'team', 7);
      S.rect(16, 6, 6, 5, 'red', 7); S.line(19, 6, 19, 10, 'white', 7); S.line(17, 8, 21, 8, 'white', 7);
      S.rect(24, 6, 6, 5, 'metal', 5); S.rect(30, 5, 4, 7, 'glow', 3); S.px(34, 8, 'white', 1);
      S.line(6, 8, 0, 15, 'black', 3);
      S.poly([[8, 13], [13, 13], [12, 19], [7, 19]], 'grip', 3); S.rect(19, 13, 3, 4, 'grip', 3);
    },
  },
  // Bonesaw: steel saw blade with teeth.
  surgicalsaw: {
    w: 34, h: 12, px: 0.0145, grip: [4, 6], melee: true,
    draw(S) {
      S.rect(0, 4, 9, 4, 'black', 3); S.line(1, 6, 8, 6, 'white'); S.rect(9, 3, 1, 6, 'steel', 3);
      S.rect(10, 2, 22, 6, 'steel', 1); S.poly([[32, 2], [33, 4], [32, 8]], 'steel', 1);
      S.line(11, 3, 31, 3, 'hl'); S.rect(10, 1, 22, 1, 'metal', 3);
      for (let x = 10; x < 32; x += 2) S.px(x, 8, 'steel', 1);
      S.px(14, 5, 'metal', 1);
    },
  },
  // ---------------- MARKSMAN
  // Sniper rifle: bolt-action wooden rifle with a long scope.
  longshot: {
    w: 62, h: 16, px: 0.0166, grip: [18, 10], muzzle: [61, 6], scope: true,
    draw(S) {
      S.poly([[0, 7], [4, 4], [20, 4], [20, 9], [12, 10], [4, 13], [0, 12]], 'wood', 5);
      S.line(3, 8, 11, 6, 'woodDark'); S.rect(0, 7, 1, 5, 'black', 5);
      S.poly([[15, 9], [20, 9], [19, 14], [14, 14]], 'wood', 5);
      S.rect(20, 4, 10, 4, 'gunmetal', 3); S.line(24, 8, 26, 10, 'metal', 3); S.px(26, 10, 'light', 3);
      S.rect(30, 5, 31, 2, 'metal', 3); S.line(30, 5, 57, 5, 'hl'); S.rect(58, 4, 3, 4, 'dark', 3);
      S.rect(30, 7, 14, 2, 'wood', 3);
      S.rect(19, 1, 14, 2, 'black', 3); S.rect(17, 0, 3, 4, 'black', 5); S.rect(31, 0, 3, 4, 'black', 5);
      S.rect(33, 1, 1, 2, 'cyan', 5); S.rect(22, 3, 2, 1, 'dark', 3); S.rect(28, 3, 2, 1, 'dark', 3);
      S.line(20, 9, 20, 11, 'dark', 1); S.line(20, 11, 23, 11, 'dark', 1);
    },
  },
  // SMG: compact with a curved magazine and wire stock.
  compactsmg: {
    w: 32, h: 20, px: 0.0155, grip: [9, 11], muzzle: [31, 5],
    draw(S) {
      S.rect(5, 3, 19, 6, 'dark', 3); S.line(6, 3, 23, 3, 'gunmetal', 3); S.px(18, 2, 'metal', 1);
      S.rect(24, 4, 7, 3, 'gunmetal', 3); for (const x of [25, 27, 29]) S.px(x, 5, 'black', 3);
      S.poly([[14, 9], [18, 9], [20, 19], [16, 19]], 'metal', 3); S.line(15, 10, 17, 18, 'gunmetal');
      S.poly([[6, 9], [11, 9], [10, 16], [5, 16]], 'grip', 3);
      S.rect(0, 4, 5, 1, 'metal', 1); S.rect(0, 4, 1, 6, 'metal', 1); S.rect(0, 9, 4, 1, 'metal', 1);
      S.rect(9, 4, 4, 1, 'team', 3);
    },
  },
  // Kukri: forward-curved blade with a wooden handle.
  kukri: {
    w: 32, h: 12, px: 0.0148, grip: [4, 7], melee: true,
    draw(S) {
      S.rect(0, 5, 9, 4, 'wood', 3); S.line(1, 7, 8, 7, 'woodDark'); S.rect(0, 5, 1, 4, 'brass', 3); S.rect(9, 4, 1, 6, 'brass', 3);
      S.poly([[10, 5], [17, 5], [23, 3], [28, 0], [31, 1], [29, 4], [23, 7], [16, 9], [10, 9]], 'steel', 1);
      S.line(11, 6, 17, 6, 'light'); S.line(17, 6, 27, 1, 'light'); S.line(16, 9, 29, 4, 'hl'); S.clear(11, 9, 1, 1);
    },
    fp: { pos: [0.23, -0.24, -0.38], scale: 1.15, rot: [-0.8, 0.12, -0.22] },
  },
  // ---------------- ADMIN
  // The Admin Gun: pale chrome-cyan pistol with an oversized boxy barrel housing, a glowing cyan core
  // channel along the side, black top strip, red pinstripe, black chevron vents near the muzzle, a
  // crosshair emblem on the rear block, a textured black grip and a white-hot emitter in the muzzle.
  admingun: {
    w: 50, h: 24, px: 0.0165, grip: [11, 15], muzzle: [49, 7],
    draw(S) {
      // rear block with the crosshair emblem
      S.poly([[0, 3], [3, 1], [22, 1], [22, 12], [2, 12], [0, 10]], 'ice', 5);
      S.line(1, 2, 21, 2, 'iceL', 5); S.line(0, 11, 21, 11, 'iceD', 5);
      S.rect(4, 2, 18, 1, 'black', 5); S.line(14, 3, 20, 3, 'black', 5);
      S.rect(3, 4, 5, 5, 'steel', 7); S.rect(4, 5, 3, 3, 'iceD', 7); S.px(5, 6, 'steel', 7); S.line(5, 4, 5, 8, 'light', 7); S.line(3, 6, 7, 6, 'light', 7);
      // glowing core channel along the body
      S.rect(10, 6, 28, 2, 'aqua', 7); S.line(11, 6, 36, 6, 'wglow', 7);
      S.line(9, 5, 37, 5, 'black', 7); S.line(9, 8, 37, 8, 'iceD', 7);
      // barrel housing: upper and lower halves with a dark split, red pinstripe, black chevron vents
      S.rect(22, 0, 26, 6, 'ice', 7); S.line(22, 0, 47, 0, 'iceL', 7); S.line(22, 2, 47, 2, 'red', 7); S.line(22, 3, 47, 3, 'black', 7);
      S.rect(22, 9, 26, 6, 'ice', 7); S.line(22, 14, 47, 14, 'iceD', 7); S.line(22, 9, 47, 9, 'black', 7);
      S.rect(48, 0, 1, 15, 'iceD', 7);
      for (const x of [38, 41, 44]) { S.line(x, 0, x + 1, 5, 'black', 7); S.line(x, 9, x + 1, 14, 'black', 7); }
      // muzzle: dark frame around a white-hot emitter
      S.rect(49, 1, 1, 13, 'black', 7); S.rect(49, 3, 1, 9, 'wglow', 5);
      // grip: textured black, pale base with a red line; three cyan dots above it; thin trigger guard
      S.poly([[8, 12], [15, 12], [16, 20], [15, 22], [7, 22], [6, 20]], 'black', 5);
      for (let y = 14; y < 20; y += 2) S.line(8, y, 13, y + 1, 'dark', 5);
      S.rect(6, 21, 10, 2, 'ice', 5); S.line(6, 23, 15, 23, 'red', 5);
      for (const x of [14, 16, 18]) S.px(x, 12, 'cyan', 5);
      S.line(17, 13, 21, 15, 'iceL', 1); S.line(21, 15, 24, 15, 'iceL', 1); S.line(18, 13, 19, 13, 'dark', 1);
    },
    fp: { pos: [0.2, -0.21, -0.44], scale: 1.05 },
  },
  // ---------------- SPY
  revolver: {
    w: 28, h: 16, px: 0.0145, grip: [5, 11], muzzle: [27, 4],
    draw(S) {
      S.rect(11, 2, 16, 1, 'gunmetal', 3); S.rect(11, 3, 16, 3, 'metal', 3); S.line(11, 3, 26, 3, 'hl'); S.px(26, 1, 'metal', 1);
      S.rect(11, 6, 13, 1, 'gunmetal', 3); S.px(26, 4, 'black', 3);
      S.poly([[5, 3], [11, 3], [11, 9], [6, 9], [4, 6]], 'gunmetal', 3); S.px(3, 2, 'dark', 1); S.px(4, 2, 'dark', 1);
      S.rect(7, 4, 5, 5, 'light', 5); S.line(8, 5, 8, 7, 'metal', 5); S.line(10, 5, 10, 7, 'metal', 5);
      S.line(8, 9, 8, 11, 'dark', 1); S.line(8, 11, 11, 11, 'dark', 1); S.line(11, 9, 11, 11, 'dark', 1); S.px(9, 10, 'dark', 1);
      S.poly([[4, 9], [8, 9], [6, 16], [1, 16], [2, 12]], 'wood', 3); S.line(5, 10, 3, 14, 'woodDark'); S.px(4, 12, 'brass');
    },
  },
  // Sapper: clamp-on electronic device with prongs, status lights and an antenna.
  sapper: {
    w: 20, h: 15, px: 0.0145, grip: [6, 11], muzzle: [19, 6],
    draw(S) {
      S.rect(2, 3, 14, 7, 'dark', 5); S.line(3, 3, 15, 3, 'gunmetal', 5);
      S.rect(4, 4, 6, 3, 'gunmetal', 5); S.line(5, 5, 8, 5, 'cyan', 5);
      S.px(12, 5, 'fire', 5); S.px(14, 5, 'cyan', 5); S.rect(12, 7, 3, 1, 'team', 5);
      S.line(13, 3, 15, 0, 'metal', 1); S.px(15, 0, 'fire', 1);
      S.rect(16, 4, 3, 1, 'steel', 1); S.rect(16, 8, 3, 1, 'steel', 1); S.px(19, 4, 'cyan', 1); S.px(19, 8, 'cyan', 1);
      S.poly([[4, 10], [9, 10], [8, 15], [3, 15]], 'black', 3);
    },
    fp: { pos: [0.18, -0.18, -0.33], scale: 1.2 },
  },
  // Knife: folding knife with split handles.
  shadowblade: {
    w: 30, h: 9, px: 0.0145, grip: [4, 4], melee: true,
    draw(S) {
      S.rect(0, 2, 10, 2, 'gunmetal', 3); S.rect(0, 5, 10, 2, 'gunmetal', 3); S.rect(0, 4, 10, 1, 'black', 3);
      S.px(1, 3, 'steel', 3); S.px(8, 3, 'steel', 3); S.px(1, 5, 'steel', 3); S.px(8, 5, 'steel', 3); S.rect(4, 2, 2, 1, 'team', 3);
      S.rect(10, 2, 1, 5, 'steel', 3);
      S.poly([[11, 3], [24, 3], [29, 4], [24, 6], [11, 6]], 'steel', 1);
      S.line(12, 5, 24, 5, 'hl'); S.line(12, 3, 22, 3, 'light');
    },
  },
  // ---------------- SOLDIER melee
  // Shovel: entrenching spade on a long handle with a D-grip.
  shovel: {
    w: 46, h: 14, px: 0.0165, grip: [5, 7], melee: true,
    draw(S) {
      S.rect(0, 4, 1, 6, 'woodDark', 3); S.rect(0, 4, 4, 1, 'woodDark', 3); S.rect(0, 9, 4, 1, 'woodDark', 3);
      S.rect(3, 6, 29, 2, 'wood', 3); S.line(4, 6, 31, 6, 'hl');
      S.rect(30, 5, 3, 4, 'dark', 3);
      S.poly([[33, 2], [41, 2], [45, 5], [45, 9], [41, 12], [33, 12]], 'gunmetal', 3);
      S.line(34, 3, 40, 3, 'metal'); S.line(45, 5, 45, 9, 'steel', 3); S.line(36, 7, 42, 7, 'dark');
    },
    fp: { pos: [0.25, -0.3, -0.42], scale: 1, rot: [-0.25, 0.2, -0.42] },
  },
};
STOCK_MODELS.pumpgun = { ...STOCK_MODELS.breacher };
