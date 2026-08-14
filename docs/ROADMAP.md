# KoalaSync Roadmap

> Feature priorities, planned work, backlog, and rejected ideas for KoalaSync.

---

## Status Legend

| Badge | Meaning |
|---|---|
| 🚧 In Progress | Currently being developed |
| 📋 Planned | Prioritized for an upcoming phase |
| 💡 Backlog | Under evaluation, not yet prioritized |
| ❌ Rejected | Declined (with rationale) |
| ✅ Completed | Shipped |

---

## 🚧 In Progress

*Currently being worked on.*

| Feature | Priority | Area |
|---|---|---|
| *(none yet)* | | |

---

## 📋 Planned

*Prioritized for upcoming phases.*

### Invite link with target URL for auto-redirect

- **Priority:** P2
- **Category:** UX / Ease of Sharing
- **Background:** The invite link currently only contains the room ID. The invited person has to manually open the page. Ideally, the link would include the shared tab's URL so the invitee gets redirected to the right page and the tab is auto-selected (auto-matching via tab title already exists).
- **Known challenges:**
  - Many streaming sites (e.g., Emby, Jellyfin) don't have unique URLs per content — once inside the player, the URL stays the same.
  - Dozens of such edge cases exist; a generic solution is difficult.
  - Would likely need site-specific extractor logic (similar to the existing sync service adapters).
- **Possible approaches:**
  - Fallback: if no unique URL can be determined, only pass the tab title.
  - Site-specific URL extraction for known services.

---

## 💡 Backlog

*Ideas and feature requests under evaluation.*

### Cross-origin frame video detection and control

- **Priority:** P3
- **Category:** Compatibility / Embedded Players
- **Background:** KoalaSync injects on demand into the selected tab's top frame. Since the same-origin frame walk shipped, the top-frame script also reaches players inside first-party iframes (`jkanime.net`-style `/jkplayer/` frames, `srcdoc` and `about:blank` frames that inherit the parent origin). What remains uncovered is the real `<video>` living inside a **cross-origin** iframe, where `contentDocument` is unreachable by design.
- **Possible approach:** Add an opt-in frame bridge (`allFrames: true` injection) where child frames announce detected videos to the top frame, and the top frame routes remote play/pause/seek commands to the active child video. Needs a frame-election rule so ad frames cannot claim the session.
- **Status:** Same-origin part completed; cross-origin frame bridge still open. Not needed for current Emby behavior.

### Local extension E2E smoke tests

- **Priority:** P2
- **Category:** Testing / Release Confidence
- **Background:** The release verification covers unit tests, server integration, syntax, lint, audits, and builds, but it does not currently run a real browser extension flow. A small local E2E smoke suite would catch regressions in content-script injection, tab navigation reinjection, remote seek handling, and iframe player support.
- **Possible approach:** Add a separate local-only Playwright smoke command that loads the unpacked extension, opens two controlled video pages, and verifies play/pause/seek through the actual extension path. Keep it outside `npm run verify` until it is stable enough for CI.
- **Status:** Backlog, recommended before larger content-script or frame-bridge changes.

---

## ❌ Rejected

*Declined features with rationale — keeps decisions documented so they don't get re-debated.*

| Feature | Reason |
|---|---|
| *(none yet)* | |
