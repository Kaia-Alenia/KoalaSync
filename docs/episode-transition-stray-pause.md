# Stray pause at an episode transition (open investigation)

> **Status:** Open. Root cause **not** confirmed — blocked on logs from both sides while it
> happens. Everything below marked *verified* was read from the code; everything marked
> *hypothesis* was not observed yet. Do not "fix" this from the hypotheses alone.
>
> Reported: 2026-08-15, against v3.1.0. Affected platform supports episode auto-sync
> (parseable `SxxEyy` titles) — title *parsing* is explicitly **not** the problem here.

---

## Symptom

Two peers watch a series together. At the end of an episode, one of them moves on to the
next episode while the other stays **paused at the end of the previous one** and never
recovers. Happens intermittently, not on every transition.

## Reported sequence

1. Peer A finishes episode 1, the player advances to episode 2.
2. A detects the transition, opens an episode lobby and pauses itself in episode 2,
   waiting for the others.
3. Peer B is still a few seconds from the end of episode **1**.
4. B receives a `PAUSE` and applies it — although that pause originates from a peer that
   is already on episode 2, so it should have been discarded.
5. B is now paused before its own transition, so its player never auto-advances, so B
   never reports ready. A's lobby runs into the 60 s timeout and is cancelled.
   From then on A and B are on different episodes and the guard (correctly) blocks
   everything, so nothing recovers.

## What the code does today (verified)

**The episode guard already exists and already runs before anything is applied.**
[`content.js:1197-1213`](../extension/content.js) is the first thing in the
`SERVER_COMMAND` branch (after the host-control desync check). It compares the sender's
title from the payload against the local title and skips `PLAY`/`PAUSE`/`SEEK`/
`FORCE_SYNC_*` on mismatch.

**The title is already shipped with every content-script command.** `sendContentEvent`
attaches `mediaTitle` to play/pause/seek ([`content.js:1450-1469`](../extension/content.js)),
and `routeToContent` forwards the payload to the content script unchanged
([`background.js:2576`](../extension/background.js)). *Adding* the title to these events is
therefore not an available fix — it is already there.

**The guard is permissive by design.** `isDifferentEpisode`
([`content.js:897-903`](../extension/content.js)) returns `false` — i.e. "allow" — when
either side has no title or no parseable episode ID. This is deliberate: Netflix exposes
no media title at all, JkAnime none, Disney+ only the series name (see
[TESTED_SERVICES.md](TESTED_SERVICES.md)). Making the comparison mandatory would silently
break sync on those platforms.

**Titles come from `navigator.mediaSession.metadata`**
([`content.js:863`](../extension/content.js)) — a page-level signal that is *not* coupled
to what the `<video>` element is actually playing. It can lead, lag, or be briefly `null`
across a source swap.

**Self-inflicted pauses are suppressed by a 300 ms timer, not by a latch.**
`_setSuppress` ([`content.js:65-70`](../extension/content.js)) self-clears after 300 ms.
If the native `pause` event arrives later than that, the event is relayed as a normal user
pause ([`content.js:1514-1517`](../extension/content.js)). The lobby pause
(`PAUSE_FOR_LOBBY`, [`content.js:1291-1303`](../extension/content.js)) is issued exactly
when the player is busy loading the next episode.

**There is no `ended` listener.** Only `play`/`pause`/`seeked`/`loadeddata`/`waiting` are
attached ([`content.js:1695`](../extension/content.js)), so a pause at the end of an
episode is indistinguishable from a user pause.

**Nothing resumes anyone after a failed lobby.** `EPISODE_LOBBY_CANCEL` only stops the
poll ([`content.js:1284`](../extension/content.js)); `cancelEpisodeLobby`
([`background.js:1732`](../extension/background.js)) does not resume the initiator.

## Why the guard can let the pause through (hypotheses)

Given that both the label and the comparison exist, the pause can only be applied if one
of these three inputs is wrong at that instant. **Which one is unknown.**

**(a) The sender's label is empty.** Players commonly clear `mediaSession.metadata` and
re-set it across a source swap. A leaked lobby pause emitted inside that window carries
`mediaTitle: null` → guard allows.

**(b) The receiver's label is ahead.** The page may switch its metadata to episode 2
before the `<video>` element actually advances. Then both sides read "episode 2", agree,
and the pause is applied while B's picture is still episode 1.

**(c) The guard is off on the receiver.** It only runs when `_autoSyncEnabled` is true
([`content.js:1203`](../extension/content.js)), which is cached from `storage.local`
([`content.js:241-243`](../extension/content.js)) — **per device, never synced between
peers**. If "Auto-Sync next Episode" is disabled on the peer that freezes, it swallows
every cross-episode command. This is the cheapest one to check and explains the asymmetry
without any timing argument.

(a) and (b) share a root cause: episode identity is sampled from a page-global signal that
is not tied to the element's content.

## How to confirm (do this next)

Reproduce, then collect the logs from **both** peers via the *Status* tab → *Copy Logs*,
and line them up by timestamp. Relevant strings, verbatim from the code:

| Log line | Emitted by | Meaning |
|---|---|---|
| `Episode transition detected: "…"` | [`content.js:933`](../extension/content.js) | that peer's player advanced |
| `Episode lobby created: "…"` | [`background.js:3582`](../extension/background.js) | that peer became the lobby initiator |
| `Episode lobby received: waiting for "…"` | [`content.js:1276`](../extension/content.js) | the other peer entered the lobby |
| `Episode mismatch: sender="…" vs mine="…" — skipping …` | [`content.js:1207`](../extension/content.js) | the guard fired |
| `Local episode ready: "…"` | [`background.js:3620`](../extension/background.js) | that peer reached the expected episode |
| `Episode lobby cancelled: …` | [`background.js:1740`](../extension/background.js) | 60 s timeout ([`constants.js:90`](../extension/shared/constants.js)) |

What to read off:

- A `PAUSE` from the other peer on B's side **without** an accompanying `Episode mismatch`
  line → the guard did not fire. The `sender="…"` value in a *neighbouring* mismatch line
  (if any) shows what A's label looked like at that moment, which separates (a) from (b).
- No `Episode mismatch` line **anywhere** in B's log for the whole session, while episodes
  clearly diverged → suspect (c); verify the setting directly.
- A `PAUSE` from `You` in A's log shortly **after** `Episode lobby created` → A's own lobby
  pause leaked past the 300 ms suppression.

## Fix plan once confirmed

Ordered by risk. The guiding rule is **fail open**: no change may create a state where
nothing syncs at all — that is worse than the current symptom.

1. **Never relay a pause we caused ourselves.** Replace the 300 ms stopwatch in
   `_setSuppress` with an explicit latch that is cleared when the expected native event
   arrives (or when the lobby ends). A programmatic pause is not a user command,
   regardless of how long the player takes to report it.
2. **Latch the episode identity to the element.** Derive it at `loadeddata` / source change
   ([`content.js:1733`](../extension/content.js)) and use the latched value both for
   labelling outgoing commands and for the local side of the comparison, instead of a live
   `mediaSession` read. Kills (a) and (b). The building blocks (`lastKnownMediaTitle`,
   `lastVideoSrc`) already exist.
3. **Resume after a failed lobby.** Remember that we paused *for* the lobby and undo it on
   cancel, so a failed auto-sync degrades to "keep watching" instead of a silent freeze.
4. **Close the remaining title-less paths** (hygiene, not the cause of this symptom):
   popup play/pause send `payload: {}` ([`popup.js:2251`](../extension/popup.js)), and the
   lobby's force-sync sends `{ targetTime: 0.0 }` without a title
   ([`background.js:1794`](../extension/background.js)) — the latter means a force-sync
   firing while a peer is still on the old episode seeks that peer to 0.0 of the **old**
   episode.

## Rejected approaches (and why)

- **"Just send the title with the pause."** Already done for this event
  ([`content.js:1458`](../extension/content.js)) — nothing to add.
- **"Force the comparison / refuse commands without a title."** Breaks Netflix, JkAnime and
  Disney+ outright, plus films whose titles differ per language or provider, plus the
  `hidden` media-title privacy mode which strips the title by design
  ([`title-privacy.js:31-40`](../extension/title-privacy.js)). A silent "nothing syncs any
  more" is worse than the current bug.
- **Pinning the title at event time *alone*.** Tempting, but it would make the failure
  *deterministic* rather than fix it: the stray pause would then always carry the old
  episode and always be applied. Only acceptable together with items 1 and 2.
- **Automatically resuming a stranded peer.** Reaching into someone else's playback is the
  kind of automation that is worse than the symptom when it misfires. Only reconsider if
  items 1-3 prove insufficient.

## Code map

| Concern | Location |
|---|---|
| Episode ID parsing / comparison | [`episode-utils.js`](../extension/episode-utils.js) (synced into `content.js` at build time) |
| Guard on incoming commands | [`content.js:1197-1213`](../extension/content.js) |
| Outgoing event + title sampling | [`content.js:1450-1545`](../extension/content.js) |
| Echo suppression | [`content.js:59-77`](../extension/content.js) |
| Transition detection | [`content.js:904-946`](../extension/content.js) |
| Lobby (content side) | [`content.js:947-1003`](../extension/content.js), [`content.js:1264-1303`](../extension/content.js) |
| Lobby (background side) | [`background.js:1707-1838`](../extension/background.js), [`background.js:3498-3624`](../extension/background.js) |
| Title privacy | [`title-privacy.js`](../extension/title-privacy.js) |
