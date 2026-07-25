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

### v3.0 — Modern Room Chat

- **Release date:** Not scheduled
- **Priority:** P1
- **Category:** Social / Communication / Privacy
- **Status:** Planned. This is a roadmap target, not a release announcement.
- **Existing foundation:** Opt-in, live-only end-to-end encrypted room chat; a floating
  chat bubble over the selected player opens a dockable, detachable, resizable overlay.
  The relay stores no chat history and mixed extension versions use capability-gated
  delivery.

#### Core experience

- Floating bubble with an accessible unread badge (`1`, `2`, `3`, …, `99+`), cleared
  only when the chat is actually viewed.
- Subtle new-message pulse with reduced-motion support; no animation or sound while
  muted or during Do Not Disturb.
- Drag-and-snap bubble positioning, remembered per site, with reset-to-default.
- Dock left/right, detached overlay, compact mode, fullscreen-safe placement, responsive
  narrow-player layout, and keyboard-only operation.
- Per-room mute, mention-only mode, notification sound controls, browser notifications,
  and a visible mute state.
- Unread state survives overlay close/reopen and tab focus changes, but room messages
  remain memory-only unless a future storage option is explicitly enabled.

#### Messaging

- Replies with quoted context, emoji reactions, emoji picker, mentions, and typing
  indicators.
- Edit and delete own messages with clear local tombstones; no silent mutation.
- Delivery states (`sending`, `sent`, `failed`, `retry`) with idempotent retries and
  duplicate suppression after reconnects.
- Message timestamps, date separators, jump-to-latest, unread divider, search within
  the current live session, copy, and selectable text.
- Link detection with safe external opening, explicit scheme allowlist, and no automatic
  previews or remote-media loading.
- Optional image/GIF/file sharing only after encrypted size limits, malware-risk UX,
  relay bandwidth limits, and privacy behavior are designed and tested.

#### Presence, safety, and control

- Online/reconnecting status, join/leave events, and room-member presence without
  exposing IP addresses or cross-room identity.
- Local mute/block, host moderation controls, slow mode, spam limits, and configurable
  maximum message length.
- Optional read receipts and activity indicators default off; never infer or expose
  viewing behavior without explicit consent.
- Clear live-only/no-history explanation, encrypted-chat indicator, room-key fingerprint,
  and key-rotation/rejoin UX.

#### Reliability and compatibility

- Versioned chat capabilities for every new wire feature; unknown fields/events remain
  harmless to older extensions and old non-chat clients receive no chat traffic.
- Server-first and extension-first rollout tests, including current, first-chat-beta,
  old non-chat, reconnect, duplicate-frame, and malformed-capability clients.
- Bounded queues, payloads, unread counters, typing events, reactions, and attachment
  metadata; backpressure and rate limits on both client and relay.
- Real Chrome and Firefox extension E2E coverage for bubble, unread count, overlay,
  fullscreen, reconnect, and mixed-version rooms before v3.0 can ship.

#### Accessibility and localization

- Screen-reader announcements that do not read every busy-room message by default.
- Complete focus management, logical tab order, Escape behavior, high contrast,
  zoom/reflow, reduced motion, and touch target coverage.
- All chat UI, notification text, moderation states, and errors localized across every
  supported locale before release.

#### Explicit non-goals for the first v3.0 release

- No server-readable plaintext.
- No mandatory accounts, public room directory, advertising, tracking, or presence
  across rooms.
- No unencrypted server-side history. Any future encrypted history requires a separate
  threat model, retention controls, export/delete behavior, and explicit opt-in.

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

