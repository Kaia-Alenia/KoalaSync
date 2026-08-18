# Targeting a nested cross-origin player without `webNavigation`

> **Status:** Fixed. Everything below was verified against the live site or a fixture
> rebuilt from it.
>
> Context: v3.1.2 added support for players inside cross-origin frames (Google Drive,
> anime hosts) and shipped with a `webNavigation` permission. The permission was not
> acceptable for the store listing, so `4d78970` removed it. Removing it broke the
> feature. This document records why, and what replaced it.

---

## Why the permission mattered

`chrome.webNavigation.getAllFrames({ tabId })` is an **observation**: a browser-side
registry lookup that returns every frame's `frameId` and `documentId` *without touching
the frames*. It answers while a frame is loading, navigating or being rebuilt.

`chrome.scripting.executeScript({ target: { tabId, allFrames: true } })` is an
**intervention**: it must run code *inside* every frame. It is all-or-nothing — one frame
that is mid-teardown makes Chromium reject the whole call — and it only reports frames it
managed to enter.

That difference is the entire regression. The players on these sites renavigate and
rebuild their `<video>` continuously, so an intervention-based discovery reliably lands in
a window where it fails, while an observation-based one never had such a window.

**No permission is needed to close the gap** — see *Replacing the frame list* below.

## The page under test

`yummyanime.tv`, KODIK mirror selected. Verified live:

```
top (yummyanime.tv)                        0 videos
├── yastatic share iframe        0x0       hidden
├── xfplayer_<id>                0x0       hidden, same-origin   <- parked mirror
│   └── absciss.thealloha.club   0x0       hidden, cross-origin
├── xfplayer_<id>              830x498     visible, same-origin  <- active wrapper
│   └── kodikplayer.com        830x498     visible, cross-origin <- the player
└── youtube.com/embed            0x0       hidden, cross-origin  <- another mirror
```

Properties that matter, all confirmed:

- The player is at **depth 2**, behind a same-origin wrapper.
- It carries **no `sandbox` attribute**, so it is injectable.
- It has **no `<video>` element at all** until playback starts.
- Its frame **navigates after load** (a `/720p` suffix appears), invalidating `documentId`.
- Unselected mirrors stay in the DOM, collapsed to 0x0.
- Loading `kodikplayer.com` directly fails a referrer check, so it can only be inspected
  embedded.

The YouTube mirror works where the others do not, because it is a *direct child of the top
frame*; the failures are specific to depth-2 nesting.

## Fixed

Each item was a separate defect on the path from "user picks a tab" to "playback is
controlled".

**Access was inferred, not measured.** Every probe error was swallowed, and any origin
that failed to answer was reported as missing host access — so a slow player frame
produced a permission prompt for an origin the extension already held. The resolver now
calls `permissions.contains()` before raising an access error.

**Probes were unbounded.** Nine `executeScript` calls in the injection path had no
timeout; one unresponsive frame pinned `activeTargetActivation` and the popup showed
`activating` forever with nothing in the log. All are time-boxed, and a watchdog abandons
any activation still running after 30s.

**Equally-ranked players were a hard failure.** Several mirrors loaded at once is an
ordinary layout here. The resolver now holds the top frame and waits for one of them to
start playing, which breaks the tie.

**Inconclusive probes moved the target.** A page whose players are still loading resolves
differently from call to call, and every difference triggered a full teardown and
reinjection, so activation never settled. A probe that finds no video now leaves the
target alone.

**The video-state poll restarted the target.** `getReadyTabVideoState()` treated "no video
found" as a broken injection and forced a reactivation — on every poll, and the dev panel
polls on a timer.

**Ordinary playback looked like a layout change.** The media-frame monitor's candidate
signature included `paused`/`readyState`/`duration`, so every play, pause and buffering
tick retriggered a full reactivation.

**A hidden srcless iframe could hide the page containing it.** An `<iframe>` without `src`
resolves to its *parent document's* URL. Ad slots are frequently srcless, so a hidden slot
could mark a real player's frame as hidden.

**The chat overlay followed the player into its frame**, rendering on top of the video and
scoping close/minimize to that frame. It is now always installed in the top document.

**A failed activation discarded the user's selection**, so the popup came back empty after
being reopened. The selection is now stored in its own right with a terminal state
(`ready` / `activating` / `access_required` / `error`).

### Replacing the frame list

Two mechanisms together do what `getAllFrames()` did, with no permission:

1. **A learned frame registry.** Every `executeScript` result carries `frameId` and
   `documentId`, and every content script that messages the background carries
   `sender.frameId`. Those are recorded per tab (capped, top frame never evicted) and any
   frame the sweep missed is then probed *individually*, so one rejected probe costs one
   frame instead of the whole page.

   The registry must **not** be cleared on navigation: `tabs.onUpdated` reports
   `status: 'loading'` for same-document History API navigations too, which is exactly
   what these sites do when switching mirror or episode part. Clearing there wiped the
   registry while the player frame was being built. It self-corrects instead — a probe
   that reached more than the top frame supersedes the stored ids.

2. **Not needing the answer.** Frame election is the fragile half, and playback does not
   depend on it:
   - Outbound, a command is **broadcast** to the tab when the elected frame reports no
     video. Every content-script handler starts with `findVideo()` and returns when there
     is none, so only the frame that owns the player acts.
   - Inbound, `isCurrentContentSender()` no longer requires `sender.frameId` to equal the
     elected frame while that frame has no video — otherwise the user's own play/pause
     arriving from the real player frame was discarded as a stale sender. The reporting
     frame is then **adopted** as the target.

   Both relaxations apply only while the elected frame reports no video; a good election
   still takes the strict path, so hidden-player rejection is unaffected.

### Latency

Selection felt broken at ~20s. Measured against the two anime fixtures after the fix,
calm page / heavy ad churn:

| | calm | ad churn |
| --- | --- | --- |
| selection | 2.5s | 2.6s |
| player promotion | 0.34s | 2.7s |

What was removed: the visibility handshake ran even when no frame had a video (its only
job is ranking candidates); its pass count was fixed at the worst-case nesting depth of
four rather than the observed two; the retry budget was spent waiting for a video no frame
had; and both probe timeouts were 2000ms for what is synchronous DOM work — a live frame
answers in tens of milliseconds, anything slower is a frame being torn down.

The remaining ~2.5s is the injection chain itself (monitors, page-API bridge, chat
overlay, content script), not discovery.

---

## A dead frame election, and the deadlock behind it

**Reported:** 2026-08-18. `Could not establish connection. Receiving end does not exist.`
with `targetReady: true` and no activation errors — the election named a frame the player
had already torn down.

Three defects were stacked here, each hidden by the one in front of it.

**The election was never released.** `getReadyTabVideoState()` recovered through the
guarded refresh, which reports `unchanged` when no video is reachable, so the stale
`frameId`/`documentId` survived. Adoption compounded it: it sets `hasVideo`, and once that
is true the target only moves on a frame change. An unreachable content script — as
opposed to a page that simply has no video yet — now releases the **frame** election back
to the top frame. The tab selection is never touched.

**Switching frames destroyed the top frame's scripts.** Promoting the target from frame 0
into a nested player called `deactivateTargetTab()` on the previous target, which sent
`TARGET_DEACTIVATE` to frame 0 and tore down both its content script and the chat overlay
there. That is why chat delivery failed after promotion, and why releasing the election
pointed at an empty frame. An in-tab frame switch now leaves the top frame alone.

**Discovery could deadlock.** Monitors announce new players, but a rebuilt frame is a new
document with no monitor, so the video created in it was never reported — and nothing then
triggered the upkeep that would have installed one. Reinstalling monitors is cheap,
bounded and idempotent, so it now runs on every lifecycle notification with a
trailing-edge debounce; and a bounded discovery poll (2s, capped, only while a tab is
selected with no video found, stopping the moment one is) breaks the cycle when no
notification arrives at all.

Covered by `recovers when the adopted player frame is torn down and rebuilt`, which
adopts a nested player, destroys its document the way the real player does, and asserts
both that the election is released and that the rebuilt player is picked up again without
touching the popup.

---

## Guardrails

Contract tests in `extension/target-tab-lifecycle.test.mjs` hold the invariants that were
each violated at least once during this work:

- no `chrome.webNavigation` anywhere, and `permissions` limited to the v3.1.1 set
- the frame registry is bounded and is **not** cleared on navigation
- monitors are injected *and* deactivated across known frames, not only via the sweep
- forcing a rebuild stays rare: only an unreachable content script, an explicit request,
  and a completed navigation
- playback state stays out of the monitor's candidate signature
- chat messages never go to the media frame

Browser-level coverage lives in `tests/e2e/extension.spec.mjs` against fixtures rebuilt
from the real page: `yummy-style-player.html` (player present up front),
`yummy-deferred-player.html` (player built on play) and `yummy-churning-player.html`
(live ad churn), plus `drive-style-player.html` for the chat-placement case.
