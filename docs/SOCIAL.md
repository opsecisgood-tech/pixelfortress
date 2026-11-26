# Friends, parties, duels and trading

Signed-in players with a username can:

- **Add friends by username.** The other player gets a request and accepts it. Friends show whether
  they're online, in the menus or in a match, and you can join their match.
- **Form a party.** Invite friends from your list. When the party leader starts or joins an online
  match, everyone in the party follows them in and stays on the leader's team.
- **Play 1v1 and 2v2.** Pick *1v1 Duel* or *2v2 Duel* in Find game, press **1v1** next to a friend to
  challenge them, or press **Queue 2v2** with a party of two.
- **Trade.** Press **Trade** next to a friend, offer items and keys, press **Ready**, then **Confirm**.

All of this uses the same Firebase project as accounts and cloud saves. The one setup step is to
publish new Firestore security rules (step 1 below). Duels also work without accounts: anyone can
pick 1v1 or 2v2 in Find game.

## Step 1: Publish the security rules

1. Open the [Firebase console](https://console.firebase.google.com/) and pick your project.
2. Go to **Build → Firestore Database → Rules**.
3. Replace everything with the rules below, then click **Publish**. They include the profile and
   username rules from [ACCOUNTS.md](ACCOUNTS.md) and [VERIFIED_NAMES.md](VERIFIED_NAMES.md), so
   nothing you set up before stops working.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function me() { return request.auth.uid; }

    // Each player can read and write only their own profile (cloud save).
    match /profiles/{uid} {
      allow read, write: if signedIn() && me() == uid;
    }

    // Unique usernames: anyone can look one up; you can only claim a free name for yourself,
    // and only delete your own. Names are stored under their lower-case form.
    match /usernames/{key} {
      allow read: if true;
      allow create: if signedIn()
        && request.resource.data.uid == me()
        && request.resource.data.name is string
        && request.resource.data.name.lower() == key
        && key.matches('^[a-z0-9_.-]{3,16}$');
      allow delete: if signedIn() && resource.data.uid == me();
    }

    // Friend lists: you edit your own list; signed-in players can read lists
    // (a friendship is mutual when both lists contain each other).
    match /friends/{uid} {
      allow read: if signedIn();
      allow write: if signedIn() && me() == uid;
    }

    // Online status and the match a player is in (so friends can join).
    match /presence/{uid} {
      allow read: if signedIn();
      allow write: if signedIn() && me() == uid;
    }

    // Inbox: friend requests, party invites, duel challenges, trade requests.
    // Anyone signed in can send (as themselves); only the owner can read or delete.
    match /inbox/{uid}/msgs/{id} {
      allow read, delete: if signedIn() && me() == uid;
      allow create: if signedIn()
        && request.resource.data.from == me()
        && request.resource.data.type in ['friend', 'friendAccept', 'party', 'duel', 'trade', 'join']
        && request.resource.data.size() <= 6;
    }

    // Parties: the leader controls everything; an invited player can only add or remove themselves.
    match /parties/{pid} {
      allow read: if signedIn();
      allow create: if signedIn()
        && request.resource.data.leader == me()
        && request.resource.data.members.keys().hasOnly([me()]);
      allow delete: if signedIn() && resource.data.leader == me();
      allow update: if signedIn() && (
        resource.data.leader == me()
        || (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['members'])
            && request.resource.data.members.diff(resource.data.members).affectedKeys().hasOnly([me()])
            && (me() in resource.data.members || me() in resource.data.invited)));
    }

    // Trades: only the two players can see a trade, and each can only change their own offer
    // (plus clearing the other side's Ready/Confirm when an offer changes, and the status).
    match /trades/{tid} {
      allow read: if signedIn() && (me() == resource.data.a || me() == resource.data.b);
      allow create: if signedIn() && request.resource.data.a == me() && request.resource.data.status == 'open';
      allow update: if signedIn()
        && (me() == resource.data.a || me() == resource.data.b)
        && request.resource.data.a == resource.data.a
        && request.resource.data.b == resource.data.b
        && (me() == resource.data.a
          ? request.resource.data.diff(resource.data).affectedKeys().hasOnly(['aItems', 'aKeys', 'aReady', 'aConfirm', 'aDone', 'bReady', 'bConfirm', 'status', 'at'])
          : request.resource.data.diff(resource.data).affectedKeys().hasOnly(['bItems', 'bKeys', 'bReady', 'bConfirm', 'bDone', 'aReady', 'aConfirm', 'status', 'at']));
    }
  }
}
```

If the Friends panel shows *"Firestore refused the request"*, these rules haven't been published yet.

## Step 2: Point the game at your dedicated server (recommended)

Duel queues and friend challenges use your dedicated server when the game knows its address:

1. In the game, open **Settings → Network**.
2. Set **Dedicated server address** to your server's WebSocket address, for example
   `wss://pixelfortress-xxxx.onrender.com/ws`.

Without an address (for example on the GitHub Pages site with nothing set), challenges and party
queues fall back to a match hosted in your own browser, which friends join peer-to-peer.

After pulling these changes, redeploy the server so it knows the new modes (on Render: **Manual
Deploy → Deploy latest commit**, unless auto-deploy is on).

## Using it

1. Sign in and claim a username (**Account**).
2. Click the **people icon** in the top bar (a red number means you have requests).
3. Type a friend's username and click **Add friend**. They accept under **Requests**.
4. Next to a friend:
   - **Join**: join the match they're in.
   - **Party**: invite them to your party.
   - **1v1**: open a private duel room and send them the challenge. The duel starts when they join.
   - **Trade**: open the trade window.
5. In the party box, the leader can **Queue 2v2** (a party of two queues together onto one team) or
   **Queue 1v1**. Starting any online match from Find game also brings the party along.

The Friends panel is also in the in-game pause menu.

## Duels

- **1v1 Duel** and **2v2 Duel** are round-based elimination on the duel arena, *Proving Grounds*.
- Everyone spawns at the start of a round and nobody respawns until it ends.
- The last team standing takes the round; first to 5 rounds wins.
- A round that runs out of time goes to the team with more health left.
- The match waits until both teams are full. A team that leaves mid-match forfeits.
- On a dedicated server, duels never fill with bots. In practice, bots fill the other slots.
- In a browser-hosted duel, bots fill the slots and leave as real players join.

## Trading

- Both players see both offers live. Any change to an offer clears Ready for both players, so
  nobody can swap items after the other side agreed.
- When both have confirmed, each player's game moves the items and keys in its own profile, once
  per trade.
- The free starter items can't be traded.
- If you receive an item you already own, you keep one copy; the trade window marks such items
  **owned** before you confirm.

> **Trust note:** inventories live in each player's own cloud save, which only they can write, so
> trades rely on both games applying the swap honestly. This suits trading between friends. A
> fully cheat-proof economy would need inventories kept by a server you control.
