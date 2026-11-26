# Accounts: sign in with Google or email

Pixel Fortress can let players create an account and sign in with **Google** or with an
**email and password**. Signed-in players get **cloud save**: their level, stats, cosmetic
loadouts and weapon choices are stored online and follow them to any device.

This uses [Firebase](https://firebase.google.com/) (by Google). The free "Spark" plan is enough.
No server of your own is needed, so it works on GitHub Pages.

Until you complete the steps below, the game runs exactly as before: there's no sign-in, and
progress is saved in each player's browser.

## 1. Create a Firebase project

1. Go to <https://console.firebase.google.com/> and sign in with your Google account.
2. Click **Create a project**. Give it a name (for example `pixel-fortress`) and finish the wizard.
   You can turn Google Analytics off.

## 2. Register the game as a web app and copy its config

1. On the project overview page, click the **Web** icon (`</>`) to add an app.
2. Give it a nickname (for example `Pixel Fortress web`). You don't need Firebase Hosting.
3. Firebase shows a `firebaseConfig = { ... }` object. Copy it.
4. Open `src/client/auth/config.js` in this repository. Replace `export const FIREBASE_CONFIG = null;`
   with your values:

   ```js
   export const FIREBASE_CONFIG = {
     apiKey: 'AIza...',
     authDomain: 'pixel-fortress.firebaseapp.com',
     projectId: 'pixel-fortress',
     appId: '1:1234567890:web:abcdef',
   };
   ```

   These values are not secret. They only identify your project, and Firebase expects them in
   public web pages. The security rules in step 5 are what protect each player's data.

## 3. Turn on the sign-in methods

1. In the Firebase console, open **Build → Authentication → Get started**.
2. On the **Sign-in method** tab, enable:
   - **Google**: choose a support email and save.
   - **Email/Password**: turn on the first switch and save.

## 4. Allow your website's address

In **Authentication → Settings → Authorized domains**, click **Add domain** and add:

- `opsecisgood-tech.github.io` (your GitHub Pages site)
- `localhost` is already listed, for local testing.

Without this, Google sign-in shows an "unauthorized domain" error.

## 5. Create the database for cloud saves

1. Open **Build → Firestore Database → Create database**. Pick a location near your players and
   start in **production mode**.
2. On the **Rules** tab, replace the rules with the following, then click **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // Each player can read and write only their own profile.
       match /profiles/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

## 6. Publish

Commit the edited `config.js`, for example by editing it directly on github.com. The Pages
deploy runs automatically. Open the game, click **Sign in** in the top bar, and try both methods.

## How it behaves

- **Sign in:** the top bar shows a **Sign in** button. It opens a screen with **Continue with
  Google**, plus **Sign in** and **Create account** tabs for email. Email accounts get a
  verification email, and there's a **Forgot password?** link.
- **First sign-in on a device:** whichever copy of the profile is newer wins. That's either the
  cloud copy or the one already in this browser. After that, every change is uploaded a few
  seconds after it happens.
- **Sign out** uploads once more, then signs out. Play continues as a guest.
- **Popup blocked:** if a phone blocks the Google popup, the game switches to a full-page redirect.

## Limits

- **Player names in matches aren't verified.** Accounts protect saved progress, but the
  multiplayer server has no backend to check identity, so players still choose their callsign.
  Verifying identity in matches would need a dedicated server that checks Firebase ID tokens.
- **Progress is still client-side.** Players can edit their own local profile before it uploads.
  That only affects their own cosmetic and stat data.
