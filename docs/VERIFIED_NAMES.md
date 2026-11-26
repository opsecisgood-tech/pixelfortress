# Verified usernames and player logs

This guide turns on two things for a **dedicated server** (the Node.js server in `server/`):

- **Verified usernames:** signed-in players claim a unique username. On your server that name shows a
  green ✓, and nobody else can use it there (an impostor is renamed).
- **Player log:** every join, leave, rejected join and chat message is recorded with the player's
  account id, so you can find and ban troublemakers.

It builds on the accounts setup in [ACCOUNTS.md](ACCOUNTS.md). Finish that first.

> **Why a dedicated server?** Games hosted from the website ("Host" / peer-to-peer) run in a player's
> own browser, and that player could fake anything. Only a server you control can be trusted to check
> accounts, so verified names and logs only work there.

## How it works

1. A player signs in (Google or email) and claims a username in **Account**. The name is stored in
   Firestore in `usernames/{name}` with their account id, and the security rules only allow creating a
   name nobody has.
2. When they join your server, the game sends Firebase's short-lived sign-in token.
3. The server checks the token's signature with Google's public keys, reads the player's username, and
   confirms in `usernames` that it really belongs to them. No secret keys are needed on the server.
4. Guests can still join (unless you require accounts), but a guest who types someone's claimed
   username is renamed to `Guest1234`.

## Step 1: Update the Firestore security rules

> **Using friends, parties or trading?** Publish the full rules from [SOCIAL.md](SOCIAL.md) instead. They include the rules below.

1. Open the [Firebase console](https://console.firebase.google.com/) and pick your project.
2. Go to **Build → Firestore Database → Rules**.
3. Replace everything with the rules below, then click **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // Each player can read and write only their own profile.
       match /profiles/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
       // Unique usernames: anyone can look one up; you can only claim a free name for yourself,
       // and only delete your own. Names are stored under their lower-case form.
       match /usernames/{key} {
         allow read: if true;
         allow create: if request.auth != null
           && request.resource.data.uid == request.auth.uid
           && request.resource.data.name is string
           && request.resource.data.name.lower() == key
           && key.matches('^[a-z0-9_.-]{3,16}$');
         allow delete: if request.auth != null && resource.data.uid == request.auth.uid;
       }
     }
   }
   ```

4. Note your **Project ID**: click the gear icon → **Project settings**. It's listed on the
   **General** tab (for example `pixelfortressserver`). You need it in step 3.

## Step 2: Claim a username

1. Open the game and click **Account** in the top bar. Sign in.
2. Under **Username**, type a name (3–16 letters, numbers, `.` `-` `_`) and click **Claim**.
   If someone already has it, you'll see "That username is taken."
3. You can change it later with **Change**; your old name is released.

## Step 3: Run the server with account checks on

The server reads its settings from environment variables:

| Variable | What it does |
| --- | --- |
| `FIREBASE_PROJECT_ID` | Your Project ID. Turns on account checks. |
| `REQUIRE_ACCOUNT=1` | Only signed-in players with a username can join. Leave it out to allow guests. |
| `LOG_FILE` | Path of the player log file, for example `logs/players.log`. |
| `BANNED_UIDS` | Comma-separated account ids that may not join. |
| `PORT`, `BOTS`, `MAX_ROOMS` | As before. |

### Try it on your own computer first

You need [Node.js](https://nodejs.org/) 18 or newer and a copy of the repository.

1. Open a terminal in the repository folder and install once:

   ```bash
   npm install
   ```

2. Start the server with your Project ID (replace it with yours):

   ```bash
   FIREBASE_PROJECT_ID=pixelfortressserver LOG_FILE=logs/players.log npm start
   ```

   On Windows PowerShell, set the variables first:

   ```powershell
   $env:FIREBASE_PROJECT_ID="pixelfortressserver"; $env:LOG_FILE="logs/players.log"; npm start
   ```

3. The terminal should print a line like
   `accounts:  verifying Firebase project "pixelfortressserver", guests allowed`.
4. Open `http://localhost:8080`, sign in, then click **Find game**, open the **Dedicated server** tab and
   click **Quick play**.
5. Press Tab in the match. Your name has a ✓ next to it.

### Put it online (Render example)

The game site on GitHub Pages uses `https://`, so browsers only allow it to connect to a secure
WebSocket (`wss://`). A hosting service that gives you HTTPS handles that for you. Any Node.js host
with WebSocket support works; these steps use [Render](https://render.com/):

1. Sign in to Render with GitHub and click **New → Web Service**.
2. Pick the `pixelfortress` repository and the `claude/great-bell-5k7f5m` branch.
3. Set **Runtime** to Node, **Build command** to `npm install`, **Start command** to `npm start`.
4. Under **Environment**, add `FIREBASE_PROJECT_ID` = your Project ID. Add `REQUIRE_ACCOUNT` = `1`
   if you want signed-in players only. Render sets `PORT` itself; don't add it.
5. Click **Create Web Service** and wait for the deploy log to say the server is running.
   Your address looks like `https://pixelfortress-xxxx.onrender.com`.
6. In Firebase, go to **Authentication → Settings → Authorized domains** and add that address
   without `https://` (for example `pixelfortress-xxxx.onrender.com`). This lets players sign in on
   the page your server serves.

Notes for Render's free plan: the server sleeps after about 15 minutes with no visitors, and the
first visit takes up to a minute to wake it. Its disk is wiped on every restart, so use the **Logs**
tab instead of `LOG_FILE` (every log line is printed there too), or attach a persistent disk and
point `LOG_FILE` at it.

### Connect players to it

Either way works:

- Send players straight to your server's address (`https://pixelfortress-xxxx.onrender.com`). The page
  it serves connects to itself automatically.
- Or, from the GitHub Pages site: click **Find game**, open the **Dedicated server** tab, set
  **Server address** to `wss://pixelfortress-xxxx.onrender.com/ws`, then click **Quick play**. The
  address is remembered.

## Step 4: Read the player log

Each line in the log file is one JSON record:

```json
{"time":"2026-11-26T18:04:11.120Z","room":"1","ev":"join","name":"Sarge","uid":"Xy12...","verified":true,"team":"RED"}
{"time":"2026-11-26T18:05:02.881Z","room":"1","ev":"chat","name":"Sarge","uid":"Xy12...","verified":true,"text":"push the flag","teamOnly":false}
{"time":"2026-11-26T18:09:40.006Z","room":"1","ev":"leave","name":"Sarge","uid":"Xy12...","verified":true}
{"time":"2026-11-26T18:10:13.450Z","room":"2","ev":"rejected","name":"Bob","reason":"This server only allows signed-in players."}
```

Events are `join`, `leave`, `chat` and `rejected`. Guests have `"uid": null`.

Handy commands on Linux/macOS:

```bash
tail -f logs/players.log
```

```bash
grep '"ev":"chat"' logs/players.log
```

```bash
grep '"name":"Sarge"' logs/players.log
```

## Step 5: Ban an account

1. Find the player's `uid` in the log (or in Firebase: **Authentication → Users**, "User UID" column).
2. Add it to `BANNED_UIDS` (separate several with commas) and restart the server. On Render, edit the
   variable under **Environment** and it redeploys on its own.

Banned accounts see "This account is banned from this server." Bans work best with
`REQUIRE_ACCOUNT=1`, because otherwise a banned player can still join as a guest. You can also
disable the account entirely in Firebase (**Authentication → Users → ⋮ → Disable account**), which
blocks sign-in everywhere.

## Troubleshooting

| What you see | Fix |
| --- | --- |
| No ✓ next to your name | Make sure you claimed a username in Account, and that you joined a *dedicated server* started with `FIREBASE_PROJECT_ID`. Hosted/peer-to-peer games never show ✓. |
| "Choose a username in Account before joining" | Claim a username, then rejoin. |
| "Sign-in could not be verified" | The Project ID on the server doesn't match the one in `src/client/auth/config.js`, or your sign-in expired: sign out and in again. |
| "That username is taken" when it isn't | The security rules from step 1 weren't published. |
| The website can't connect to your server | Use `wss://` (not `ws://`) and include `/ws` at the end of the address. |
| `auth/unauthorized-domain` when signing in on your server's page | Add the server's domain in Firebase authorized domains (Render step 6). |
