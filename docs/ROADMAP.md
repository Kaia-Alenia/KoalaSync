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

### 1. Split large JavaScript files into smaller modules

- **Priority:** P1
- **Category:** Maintainability / AI Context Optimization
- **Background:** Core files like `background.js` and `popup.js` have grown large and exceed 800 lines. This makes manual debugging harder and wastes context window space for AI models.
- **Planned solution:**
  - Structurally split logic into separate focused modules (e.g., UI Renderer, Message Router, Storage Manager, Socket Client).
  - Use ES modules for clean separation and better reusability.

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

---

## ❌ Rejected

*Declined features with rationale — keeps decisions documented so they don't get re-debated.*

| Feature | Reason |
|---|---|
| *(none yet)* | |


