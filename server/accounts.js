// Account checks for the dedicated server: verifies Firebase ID tokens sent by signed-in players and
// looks up their claimed username in Firestore. Uses only Node built-ins (crypto + fetch), so no
// service-account key is needed: Google's token-signing certificates and the public `usernames`
// collection are enough. Setup: docs/VERIFIED_NAMES.md.
import crypto from 'node:crypto';

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,16}$/;

let certs = null, certsUntil = 0;
async function getCerts() {
  if (certs && Date.now() < certsUntil) return certs;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error(`could not fetch Google certificates (${res.status})`);
  const age = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  certs = await res.json();
  certsUntil = Date.now() + (age ? +age[1] * 1000 : 3600 * 1000);
  return certs;
}

const b64json = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

/**
 * Verify a Firebase Authentication ID token. Returns { uid, email, emailVerified, name } or throws.
 */
export async function verifyIdToken(token, projectId) {
  if (typeof token !== 'string' || token.length > 4096) throw new Error('malformed token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [h, p, sig] = parts;
  let header, claims;
  try { header = b64json(h); claims = b64json(p); } catch { throw new Error('malformed token'); }
  if (header.alg !== 'RS256') throw new Error('unexpected algorithm');
  const all = await getCerts();
  const pem = all[header.kid];
  if (!pem) throw new Error('unknown signing key');
  const ok = crypto.createVerify('RSA-SHA256').update(`${h}.${p}`).verify(pem, Buffer.from(sig, 'base64url'));
  if (!ok) throw new Error('bad signature');
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== projectId) throw new Error('token is for a different project');
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('bad issuer');
  if (!(claims.exp > now)) throw new Error('token expired');
  if (!(claims.iat <= now + 300)) throw new Error('token issued in the future');
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) throw new Error('missing user id');
  return { uid: claims.sub, email: claims.email || null, emailVerified: !!claims.email_verified, name: claims.name || null };
}

const docUrl = (projectId, path) => `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
const field = (doc, k) => doc?.fields?.[k]?.stringValue ?? null;

const claimCache = new Map(); // lower-case name -> { uid, name, until }
// Who owns this username? Returns { uid, name } or null. The `usernames` collection is publicly readable.
export async function usernameOwner(name, projectId) {
  if (!USERNAME_RE.test(name || '')) return null;
  const key = name.toLowerCase();
  const hit = claimCache.get(key);
  if (hit && hit.until > Date.now()) return hit.uid ? hit : null;
  const res = await fetch(docUrl(projectId, `usernames/${encodeURIComponent(key)}`));
  let out = { uid: null, name: null };
  if (res.ok) { const d = await res.json(); out = { uid: field(d, 'uid'), name: field(d, 'name') }; }
  else if (res.status !== 404) throw new Error(`username lookup failed (${res.status})`);
  claimCache.set(key, { ...out, until: Date.now() + 60 * 1000 });
  return out.uid ? out : null;
}

// The username a signed-in player has claimed: read from their own profile (using their token, which
// the security rules allow), then confirmed against the `usernames` collection so it can't be faked.
export async function claimedUsername(uid, idToken, projectId) {
  const res = await fetch(docUrl(projectId, `profiles/${encodeURIComponent(uid)}`), { headers: { authorization: `Bearer ${idToken}` } });
  if (!res.ok) return null;
  const name = field(await res.json(), 'username');
  if (!name) return null;
  const owner = await usernameOwner(name, projectId);
  return owner && owner.uid === uid ? (owner.name || name) : null;
}

/**
 * Decide who a joining player is. Returns { account: { uid, username } } for a verified player,
 * { guestName } when a guest tried to use someone's claimed username, {} for a normal guest, or
 * { reject: 'reason' }. opts: { projectId, requireAccount, banned: Set<uid> }
 */
export async function checkJoin(msg, opts) {
  const { projectId, requireAccount, banned } = opts;
  if (!projectId) return {};
  if (msg.idToken) {
    let user;
    try { user = await verifyIdToken(msg.idToken, projectId); }
    catch (e) { return requireAccount ? { reject: `Sign-in could not be verified (${e.message}). Sign in again and rejoin.` } : { note: e.message }; }
    if (banned?.has(user.uid)) return { reject: 'This account is banned from this server.' };
    const username = await claimedUsername(user.uid, msg.idToken, projectId).catch(() => null);
    if (!username) return requireAccount ? { reject: 'Choose a username in Account before joining this server.' } : { account: { uid: user.uid, username: null } };
    return { account: { uid: user.uid, username } };
  }
  if (requireAccount) return { reject: 'This server only allows signed-in players. Sign in from the Account button.' };
  // guests may not impersonate a claimed username
  const owner = await usernameOwner(String(msg.name || '').trim(), projectId).catch(() => null);
  if (owner) return { guestName: `Guest${Math.floor(1000 + Math.random() * 9000)}` };
  return {};
}
