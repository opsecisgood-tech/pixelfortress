// Optional accounts: sign in / sign up with Google or email+password through Firebase Authentication,
// and keep the player profile in Firestore ("cloud save"). Everything here is inert until
// FIREBASE_CONFIG is filled in (see docs/ACCOUNTS.md); the Firebase SDK is only downloaded then.
import { FIREBASE_CONFIG } from './config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

const FRIENDLY = {
  'auth/invalid-email': 'That email address is not valid.',
  'auth/missing-password': 'Enter a password.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/email-already-in-use': 'An account with that email already exists. Sign in instead.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'No account with that email. Create one instead.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'auth/popup-closed-by-user': 'The Google window was closed before signing in.',
  'auth/unauthorized-domain': 'This website is not on the Firebase project\'s authorized domains list (see docs/ACCOUNTS.md).',
  'auth/operation-not-allowed': 'This sign-in method is not enabled in the Firebase console.',
  'auth/network-request-failed': 'Network error. Check your connection.',
};
export const authErrorText = (e) => FRIENDLY[e?.code] || e?.message || 'Something went wrong.';

export class Auth {
  constructor(app) {
    this.app = app;
    this.enabled = !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey);
    this.user = null;
    this.status = this.enabled ? 'loading' : 'off'; // off | loading | ready | error
    this.syncState = 'idle';                          // idle | syncing | saved | error
    this.listeners = new Set();
    this.ready = this.enabled ? this.init().catch((e) => { console.warn('auth init failed', e); this.status = 'error'; this.error = e; this.emit(); }) : Promise.resolve();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this); }

  async init() {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`),
    ]);
    this.A = authMod; this.F = fsMod;
    const fbApp = appMod.initializeApp(FIREBASE_CONFIG);
    this.auth = authMod.getAuth(fbApp);
    this.db = fsMod.getFirestore(fbApp);
    await authMod.getRedirectResult(this.auth).catch(() => null);
    authMod.onAuthStateChanged(this.auth, (u) => this.onUser(u));
    this.status = 'ready';
    this.emit();
  }

  async onUser(u) {
    this.user = u ? { uid: u.uid, email: u.email, name: u.displayName, verified: u.emailVerified, provider: u.providerData?.[0]?.providerId || 'password' } : null;
    this.emit();
    if (!u) { this.app.profile.onSave = null; return; }
    if (!this.app.profile.name && u.displayName) this.app.profile.name = u.displayName.replace(/[^\w \-.[\]]/g, '').slice(0, 16);
    await this.pullOrPush();
    // keep the cloud copy current (debounced) while signed in
    this.app.profile.onSave = () => { clearTimeout(this.saveT); this.saveT = setTimeout(() => this.push(), 2500); };
  }

  profileRef() { return this.F.doc(this.db, 'profiles', this.user.uid); }

  // On sign-in: newer copy wins (cloud vs this device).
  async pullOrPush() {
    if (!this.user) return;
    this.syncState = 'syncing'; this.emit();
    try {
      const snap = await this.F.getDoc(this.profileRef());
      const local = this.app.profile.data;
      if (snap.exists()) {
        const cloud = JSON.parse(snap.data().data || 'null');
        if (cloud && (cloud.updatedAt || 0) > (local.updatedAt || 0)) {
          this.app.profile.importData(cloud);
          this.app.ui?.showMainMenu?.();
        } else await this.push();
      } else await this.push();
      this.syncState = 'saved';
    } catch (e) { console.warn('cloud sync failed', e); this.syncState = 'error'; this.syncError = e; }
    this.emit();
  }

  async push() {
    if (!this.user) return;
    try {
      await this.F.setDoc(this.profileRef(), { data: JSON.stringify(this.app.profile.data), updatedAt: this.app.profile.data.updatedAt || Date.now(), name: this.app.profile.name || '' });
      this.syncState = 'saved';
    } catch (e) { this.syncState = 'error'; this.syncError = e; }
    this.emit();
  }

  // ---------------------------------------------------------------- sign in / up
  async signInGoogle() {
    const provider = new this.A.GoogleAuthProvider();
    try { await this.A.signInWithPopup(this.auth, provider); }
    catch (e) {
      // popups are often blocked on phones: fall back to a full-page redirect
      if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') await this.A.signInWithRedirect(this.auth, provider);
      else throw e;
    }
  }
  async signUpEmail(email, password, name) {
    const cred = await this.A.createUserWithEmailAndPassword(this.auth, email, password);
    if (name) await this.A.updateProfile(cred.user, { displayName: name });
    await this.A.sendEmailVerification(cred.user).catch(() => {});
    this.onUser(cred.user);
  }
  signInEmail(email, password) { return this.A.signInWithEmailAndPassword(this.auth, email, password); }
  resetPassword(email) { return this.A.sendPasswordResetEmail(this.auth, email); }
  async signOut() { await this.push(); return this.A.signOut(this.auth); }
}
