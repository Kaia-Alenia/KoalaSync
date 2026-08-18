# Handoff: frame targeting after removing `webNavigation`

> **Read [`nested-player-frame-targeting.md`](./nested-player-frame-targeting.md) first.** It
> records the page layout, every defect fixed so far and the measurements. This file is
> only about **what to do next** and **the decision that is blocking it**.
>
> Branch: `fix/3.1.3-clean`. Working tree green: lint clean, 94 unit tests, 48 browser
> tests, `npm run verify` passes.

---

## The one thing that matters

v3.1.2 worked on these sites within half an hour of being written, because discovery was
a single call:

```js
chrome.webNavigation.getAllFrames({ tabId })   // complete frame list, instantly
```

Everything built since is a **reconstruction of that one call from indirect signals**:

| replacement | fails when |
| --- | --- |
| `executeScript({ allFrames: true })` sweep | any frame is mid-teardown — Chromium rejects the *whole* call |
| learned frame registry (`sender.frameId`) | nothing has run in the frame yet, so nothing can report itself |
| `media-frame-monitor.js` per frame | the frame is new (rebuilt) and has no monitor |
| bounded discovery poll | it is a workaround for the three above |

Each has a window in which it fails. Closing them one by one is what the last two days
were, and it keeps opening new ones — the most recent regression was self-inflicted (see
*What was just reverted*). **This is the architecture, not bad luck.**

## Recommended next step

Replace the reconstruction with browser-managed injection:

```js
await chrome.scripting.registerContentScripts([{
    id: 'koala-media-frames',
    matches: ['<all_urls>'],        // see "Scoping is not possible" below
    allFrames: true,
    js: ['media-frame-monitor.js'],
    runAt: 'document_idle'
}]);
// ... and chrome.scripting.unregisterContentScripts({ ids: [...] }) on deselect
```

Why this ends the whole failure class:

- The **browser** injects into every frame, including frames created later — exactly what
  Kodik does on every quality and part change.
- No enumeration, no sweep, no monitor bootstrapping, no poll, no timing window.
- **No new permission.** `scripting` and `<all_urls>` host permissions are already
  declared, and dynamically registered scripts produce no additional permission warning.
- Strictly better than v3.1.2, which still had to re-enumerate after every frame change.

Suggested shape: register on `activateTargetTab()`, unregister in `clearUserSelection()`
and on tab removal. Keep the existing registry, broadcast and adoption as they are — they
become belt-and-braces rather than the primary mechanism. The discovery poll
(`startMediaDiscoveryPoll`) can then be deleted.

### Scoping is not possible — this is the real cost

`matches` is evaluated against **each frame's own URL**, not the tab's. A pattern like
`https://yummyanime.tv/*` would therefore *not* reach the `kodikplayer.com` frame, which is
the only frame that matters. To reach an embedded player whose origin is unknown before
discovery has happened, the pattern has to be `<all_urls>`.

There is also no tab scoping: registration is by URL pattern only. With three tabs open on
the same site, all three get the script — the selected one and the two others.

So the honest trade is: **the monitor runs in every frame of every http/https tab while a
target is selected.** A narrower learned allowlist (register the player origins seen on a
previous visit) helps from the second visit onward but cannot solve the first, which is
the case that is broken today.

## The decision that blocks it

A registered content script is **not tab-scoped**. Scoping by origin means it also runs in
*other tabs of the same site*. That conflicts with an explicit project invariant, asserted
in `extension/target-tab-lifecycle.test.mjs`:

> `injects playback and chat scripts only into the explicitly selected tab`

Mitigations, if the owner accepts the trade:

- Only `media-frame-monitor.js` is registered — a passive sentinel that controls nothing,
  reads no page content and only posts `MEDIA_FRAME_CANDIDATE_CHANGED`.
- The background already ignores messages from any tab that is not `currentTabId`, so
  other tabs cost a message that is dropped.
- `content.js`, `chat-overlay.js` and the page-API bridge stay programmatically injected
  into the selected tab only, so the invariant holds for everything that *acts*.
- Registration exists only while a tab is selected, and is removed on deselect.

What it still means in plain terms: while a watch party is active, a passive script runs in
every frame of every ordinary tab, not just the chosen one. That is a privacy-posture
change for a project whose selling point is that it only touches the tab you picked.

**Nothing should be built until the owner has decided this.** If the answer is no, the
current event-driven design stays and the remaining races have to be accepted or papered
over individually — which is the situation that produced this handoff.

## What was just reverted (already in the tree)

The bounded discovery poll reinstalled monitors every 2s, and a freshly installed monitor
took the current DOM as its baseline:

```js
lastCandidateSignature = candidateSignature();   // a video already there is "not a change"
```

So a video that appeared between two reinstalls was never reported — the user's debug log
had **no `[Content]` lines at all**, which is the signature of this bug. A monitor now
announces a video that is already present when it installs, and the reinstall interval was
raised to 5s. Verified by the rebuild test passing repeatedly at ~8s.

## How to reproduce without the live site

Fixtures rebuilt from the real page, in `tests/e2e/fixtures/pages/`:

| fixture | case |
| --- | --- |
| `yummy-style-player.html` | player present up front, two hidden mirrors |
| `yummy-deferred-player.html` | player built only on play — the live case |
| `yummy-churning-player.html` | live ad churn, the frame-discovery stress case |
| `drive-style-player.html` | chat must stay in the top document |

```bash
npx playwright test --config tests/e2e/playwright.config.mjs -g "anime"
```

The decisive one is `recovers when the adopted player frame is torn down and rebuilt`: it
adopts a nested player, destroys its document the way the real player does, and asserts
both that the dead election is released and that the rebuilt player is picked up again.
**It was flaky before the deadlock was closed — if it goes flaky again, that is the signal
that discovery has a new hole, not that the test is bad.** That mistake was made twice.

## Verifying a build is actually loaded

The extension is loaded unpacked from `dist/chrome` (Vivaldi, id
`agiicmjlekhnkfifidegdhegnomcmpen`). After `npm run build:extension`, it needs a manual
reload in `vivaldi://extensions` — browser-internal pages cannot be driven by tooling, so
this step is always the user's.

Fastest confirmation that the right build is running, from the debug report:

- `In Iframe: YES` and a populated **Video** block — the target is the nested player.
- `In Iframe: NO` with `Video Count: 0` — the target is the top frame; the player was
  never picked up.
- No `[Content]` lines at all — nothing was ever reported; suspect discovery, not sync.
