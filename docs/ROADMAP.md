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

### 2. Invite link with target URL for auto-redirect

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

### In-room chat overlay (like TeleParty)

- **Priority:** P3
- **Category:** Social / Communication
- **Background:** A collapsible chat panel to the right of the video (or as an overlay) allowing text-based communication with everyone in the room.
- **Why backlog (still uncertain):**
  - **Use case:** No strong personal need — with chat, latency matters less than with voice; async communication tolerates a few seconds of delay.
  - **Complexity:** Relatively large feature (UI + message persistence + possibly history).
  - **Legal/moderation:** Unclear what moderation requirements would apply if users can exchange chat messages. Could be relevant depending on jurisdiction.
- **Status:** Under evaluation, may come later.

### Cross-frame video detection and control

- **Priority:** P3
- **Category:** Compatibility / Embedded Players
- **Background:** KoalaSync currently injects on demand into the selected tab's top frame. This works for normal top-frame players, including current Emby/Jellyfin usage, but does not cover cases where the real `<video>` lives inside a cross-origin iframe or an `about:blank`/`srcdoc` player frame.
- **Possible approach:** Add an opt-in frame bridge where child frames announce detected videos to the top frame, and the top frame routes remote play/pause/seek commands to the active child video.
- **Status:** Future compatibility work, not needed for current Emby behavior.

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

