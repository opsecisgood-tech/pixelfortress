// Deterministic player movement. Runs identically on the server (authoritative) and on the client
// (prediction + reconciliation). Quake-style acceleration/friction with step-up, crouch, jump buffering,
// coyote time, class double jumps, conveyor surfaces and landing recovery.
import {
  GRAVITY, PLAYER_RADIUS, PLAYER_HEIGHT, CROUCH_HEIGHT, STEP_HEIGHT, BASE_SPEED, SPRINT_MULT, CROUCH_MULT,
  BASE_JUMP_VELOCITY, GROUND_ACCEL, AIR_ACCEL, AIR_SPEED_CAP, FRICTION, STOP_SPEED, COYOTE_TIME, JUMP_BUFFER,
  MAX_FALL_SPEED, BTN, EYE_HEIGHT, CROUCH_EYE_HEIGHT,
} from './constants.js';

const EPS = 0.001;
const R = PLAYER_RADIUS;

export function createMoveState(x = 0, y = 0, z = 0, yaw = 0) {
  return {
    x, y, z, vx: 0, vy: 0, vz: 0, yaw, pitch: 0,
    grounded: false, crouch: false, airJumps: 0, coyote: 0, jumpBuffer: 0,
    prevButtons: 0, landTimer: 0, airTime: 0, sprinting: false,
    lastImpact: 0, jumped: 0, doubleJumped: 0, groundMat: null, stepUp: 0,
  };
}

export function copyMoveState(dst, src) {
  for (const k in src) dst[k] = src[k];
  return dst;
}

// Fields a server snapshot carries for reconciliation.
export const MOVE_SYNC_FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'grounded', 'crouch', 'airJumps', 'coyote', 'jumpBuffer', 'prevButtons', 'landTimer', 'airTime'];

export function eyeHeight(s) {
  return s.crouch ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
}
export function hullHeight(s) {
  return s.crouch ? CROUCH_HEIGHT : PLAYER_HEIGHT;
}

function blocked(world, x, y, z, h) {
  return world.overlapsSolid(x - R, y, z - R, x + R, y + h, z + R);
}

// Move along one horizontal axis with step-up. Returns true if movement was blocked.
function moveAxis(world, s, axis, delta, h, canStep) {
  if (delta === 0) return false;
  const nx = axis === 0 ? s.x + delta : s.x;
  const nz = axis === 2 ? s.z + delta : s.z;
  if (!blocked(world, nx, s.y, nz, h)) {
    s.x = nx; s.z = nz;
    return false;
  }
  // Try stepping up onto ledges/stairs.
  if (canStep) {
    for (const up of [STEP_HEIGHT * 0.5, STEP_HEIGHT]) {
      if (!blocked(world, s.x, s.y + up, s.z, h) && !blocked(world, nx, s.y + up, nz, h)) {
        // settle down onto the step surface
        let ny = s.y + up;
        const floor = world.floorBelow(nx, nz, ny + EPS, R * 0.98);
        if (floor > s.y - EPS && floor <= ny) ny = floor + EPS;
        s.stepUp += ny - s.y;
        s.x = nx; s.z = nz; s.y = ny;
        return false;
      }
    }
  }
  // Clamp flush against the blocking geometry.
  let limit = delta > 0 ? Infinity : -Infinity;
  world.query(
    Math.min(s.x, nx) - R, s.y + EPS, Math.min(s.z, nz) - R,
    Math.max(s.x, nx) + R, s.y + h - EPS, Math.max(s.z, nz) + R,
    (b) => {
      if (!b.col) return false;
      if (axis === 0) {
        if (b.maxZ <= s.z - R || b.minZ >= s.z + R) return false;
        if (delta > 0 && b.minX >= s.x + R - EPS) limit = Math.min(limit, b.minX - R - EPS);
        if (delta < 0 && b.maxX <= s.x - R + EPS) limit = Math.max(limit, b.maxX + R + EPS);
      } else {
        if (b.maxX <= s.x - R || b.minX >= s.x + R) return false;
        if (delta > 0 && b.minZ >= s.z + R - EPS) limit = Math.min(limit, b.minZ - R - EPS);
        if (delta < 0 && b.maxZ <= s.z - R + EPS) limit = Math.max(limit, b.maxZ + R + EPS);
      }
      return false;
    },
  );
  if (axis === 0) {
    if (Number.isFinite(limit)) s.x = delta > 0 ? Math.min(nx, Math.max(s.x, limit)) : Math.max(nx, Math.min(s.x, limit));
    s.vx = 0;
  } else {
    if (Number.isFinite(limit)) s.z = delta > 0 ? Math.min(nz, Math.max(s.z, limit)) : Math.max(nz, Math.min(s.z, limit));
    s.vz = 0;
  }
  return true;
}

function moveVertical(world, s, delta, h) {
  const ny = s.y + delta;
  if (!blocked(world, s.x, ny, s.z, h)) { s.y = ny; return 0; }
  if (delta < 0) {
    let top = -Infinity;
    world.query(s.x - R, ny, s.z - R, s.x + R, s.y + EPS, s.z + R, (b) => {
      if (b.col && b.maxY > top && b.maxY <= s.y + EPS * 2) top = b.maxY;
    });
    s.y = Number.isFinite(top) ? Math.max(ny, top + EPS) : s.y;
    return -1; // landed
  }
  let bottom = Infinity;
  world.query(s.x - R, s.y + h - EPS, s.z - R, s.x + R, ny + h, s.z + R, (b) => {
    if (b.col && b.minY < bottom && b.minY >= s.y + h - EPS * 2) bottom = b.minY;
  });
  s.y = Number.isFinite(bottom) ? Math.min(ny, bottom - h - EPS) : s.y;
  return 1; // bonked ceiling
}

/**
 * Advance movement by one command.
 * @param s move state (mutated)
 * @param cmd { b: buttons, y: yaw, p: pitch, dt }
 * @param world World
 * @param p params { speed: class speed mult, jump: jump mult, airJumps, landingRecovery, moveMult, canSprint, frozen }
 */
export function stepMovement(s, cmd, world, p) {
  const dt = Math.min(Math.max(cmd.dt || 0, 0), 0.05);
  const b = cmd.b | 0;
  s.yaw = cmd.y;
  s.pitch = cmd.p;
  s.lastImpact = 0;
  s.jumped = 0;
  s.doubleJumped = 0;
  s.stepUp = 0;
  if (dt <= 0) return s;

  const pressed = b & ~s.prevButtons;
  s.prevButtons = b;

  if (p.frozen) {
    s.vx = 0; s.vz = 0;
    if (s.vy > 0) s.vy = 0;
  }

  // --- Crouch -------------------------------------------------------------
  const wantCrouch = !!(b & BTN.CROUCH);
  if (wantCrouch && !s.crouch) {
    s.crouch = true;
    if (!s.grounded) s.y += PLAYER_HEIGHT - CROUCH_HEIGHT - 0.1; // tuck legs mid-air
    if (blocked(world, s.x, s.y, s.z, CROUCH_HEIGHT)) s.y -= PLAYER_HEIGHT - CROUCH_HEIGHT - 0.1;
  } else if (!wantCrouch && s.crouch) {
    if (!blocked(world, s.x, s.y, s.z, PLAYER_HEIGHT)) s.crouch = false;
    else if (!s.grounded && !blocked(world, s.x, s.y - (PLAYER_HEIGHT - CROUCH_HEIGHT), s.z, PLAYER_HEIGHT)) {
      s.y -= PLAYER_HEIGHT - CROUCH_HEIGHT; s.crouch = false;
    }
  }
  const h = s.crouch ? CROUCH_HEIGHT : PLAYER_HEIGHT;

  // --- Wish direction -----------------------------------------------------
  let fwd = 0, side = 0;
  if (!p.frozen) {
    if (b & BTN.FORWARD) fwd += 1;
    if (b & BTN.BACK) fwd -= 1;
    if (b & BTN.RIGHT) side += 1;
    if (b & BTN.LEFT) side -= 1;
  }
  const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
  // forward = (-sin, -cos), right = (cos, -sin)
  let wx = -sy * fwd + cy * side;
  let wz = -cy * fwd - sy * side;
  const wl = Math.hypot(wx, wz);
  if (wl > 0) { wx /= wl; wz /= wl; }

  s.sprinting = !!(b & BTN.SPRINT) && fwd > 0 && !s.crouch && p.canSprint !== false;
  let maxSpeed = BASE_SPEED * (p.speed || 1) * (p.moveMult ?? 1);
  if (s.sprinting) maxSpeed *= SPRINT_MULT;
  if (s.crouch && s.grounded) maxSpeed *= CROUCH_MULT;
  if (s.landTimer > 0) maxSpeed *= 0.65;

  // --- Jump buffering ------------------------------------------------------
  if (pressed & BTN.JUMP) s.jumpBuffer = JUMP_BUFFER;
  else s.jumpBuffer = Math.max(0, s.jumpBuffer - dt);

  if (s.grounded) {
    s.coyote = COYOTE_TIME;
    s.airJumps = p.airJumps || 0;
  } else {
    s.coyote = Math.max(0, s.coyote - dt);
  }

  const jumpVel = BASE_JUMP_VELOCITY * (p.jump || 1);
  if (s.jumpBuffer > 0 && s.coyote > 0 && !p.frozen) {
    s.vy = jumpVel;
    s.grounded = false;
    s.coyote = 0;
    s.jumpBuffer = 0;
    s.jumped = 1;
  } else if ((pressed & BTN.JUMP) && !s.grounded && s.airJumps > 0 && !p.frozen) {
    // Double jump: redirect horizontal momentum toward wish direction.
    s.airJumps--;
    s.vy = jumpVel * 0.95;
    const hs = Math.max(Math.hypot(s.vx, s.vz), maxSpeed * 0.9);
    if (wl > 0) { s.vx = wx * hs; s.vz = wz * hs; } else { s.vx *= 0.5; s.vz *= 0.5; }
    s.jumpBuffer = 0;
    s.doubleJumped = 1;
  }

  // --- Acceleration / friction -------------------------------------------
  if (s.grounded) {
    const sp = Math.hypot(s.vx, s.vz);
    if (sp > 0) {
      const control = Math.max(sp, STOP_SPEED);
      const drop = control * FRICTION * dt;
      const ns = Math.max(sp - drop, 0) / sp;
      s.vx *= ns; s.vz *= ns;
    }
    accelerate(s, wx, wz, maxSpeed, GROUND_ACCEL, dt);
  } else if (wl > 0) {
    accelerate(s, wx, wz, maxSpeed * AIR_SPEED_CAP, AIR_ACCEL * 4, dt, true);
  }

  // --- Gravity ------------------------------------------------------------
  s.vy = Math.max(s.vy - GRAVITY * dt, -MAX_FALL_SPEED);

  // --- Integrate with collision (sub-stepped) ----------------------------
  const wasGrounded = s.grounded;
  const preVy = s.vy;
  let conv = null;
  if (wasGrounded) {
    const gb = world.groundBox(s.x, s.y, s.z, R * 0.9);
    s.groundMat = gb ? gb.mat : null;
    if (gb && gb.conv) conv = gb.conv;
  }
  const dispX = (s.vx + (conv ? conv[0] : 0)) * dt;
  const dispZ = (s.vz + (conv ? conv[1] : 0)) * dt;
  const dispY = s.vy * dt;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dispX), Math.abs(dispZ), Math.abs(dispY)) / 0.3));
  let landed = false;
  for (let i = 0; i < steps; i++) {
    const canStep = s.grounded || wasGrounded;
    moveAxis(world, s, 0, dispX / steps, h, canStep);
    moveAxis(world, s, 2, dispZ / steps, h, canStep);
    const res = moveVertical(world, s, dispY / steps, h);
    if (res === -1) { landed = true; s.vy = 0; break; }
    if (res === 1) { s.vy = Math.min(s.vy, 0); break; }
  }

  // Ground check + downward snapping for stairs.
  let onGround = blocked(world, s.x, s.y - 0.04, s.z, h) && s.vy <= 0.01;
  if (!onGround && wasGrounded && !s.jumped && s.vy <= 0) {
    const floor = world.floorBelow(s.x, s.z, s.y + EPS, R * 0.98);
    if (floor > s.y - STEP_HEIGHT - 0.05 && !blocked(world, s.x, floor + EPS, s.z, h)) {
      s.y = floor + EPS;
      onGround = true;
    }
  }
  if (onGround) {
    if (!wasGrounded) {
      s.lastImpact = -preVy;
      if (s.airTime > 0.35 && preVy < -9) s.landTimer = 0.22 * (p.landingRecovery ?? 1);
    }
    s.grounded = true;
    if (s.vy < 0) s.vy = 0;
    s.airTime = 0;
  } else {
    s.grounded = false;
    s.airTime += dt;
  }
  if (landed && !onGround) s.vy = 0;
  s.landTimer = Math.max(0, s.landTimer - dt);
  return s;
}

function accelerate(s, wx, wz, wishSpeed, accel, dt, air = false) {
  if (wishSpeed <= 0) return;
  const cur = s.vx * wx + s.vz * wz;
  const add = wishSpeed - cur;
  if (add <= 0) return;
  let acc = accel * wishSpeed * dt;
  if (air) acc = Math.min(acc, add);
  if (acc > add) acc = add;
  s.vx += acc * wx;
  s.vz += acc * wz;
}

// Apply an external impulse (explosions, thermal burst). Server-side.
export function applyImpulse(s, ix, iy, iz) {
  s.vx += ix; s.vy += iy; s.vz += iz;
  if (iy > 0.5) s.grounded = false;
}

export function moveParamsFor(cls, extra = {}) {
  return {
    speed: cls.speed,
    jump: cls.jumpPower,
    airJumps: cls.ability.airJumps || 0,
    landingRecovery: cls.passive.landingRecovery ?? 1,
    moveMult: 1,
    canSprint: true,
    ...extra,
  };
}
