# KoalaSync Changelog

All notable changes to the KoalaSync browser extension and relay server.

---

## [v2.0.2] — 2026-06-02

### Fixed
- Peer identity spoofing in relay server: client-supplied `peerId` could be used to impersonate other peers in PEER_STATUS events. Server now always stamps `peerId` with the authenticated sender's identity.
- Amazon domain detection: replaced broad `includes('amazon.')` substring check with boundary-safe regex that correctly matches all Amazon storefronts (`amazon.com`, `amazon.de`, `amazon.co.uk`, etc.) while rejecting lookalike domains.

---

## [v2.0.1] — 2026-06-01

### Fixed
- Video detection on Prime Video: `findVideo()` now scores all video elements by size, duration, and mute state instead of picking the first one. Fixes 0×0 placeholder being selected over the actual player.
- History entries in debug report showing `?` instead of action names.
- Prime Video status in compatibility matrix updated to reflect partial support.

### Added
- Multi-video overview table in Copy Debug Report when a page has more than one `<video>` element. Shows resolution, mute state, playback state, readyState, duration, and marks the currently targeted video.

---

## [v2.0.0] — 2026-06-01

### 🌍 Multi-Language Extension (Biggest Feature!)
- **6-Language UI**: The browser extension is now fully translated into **English, German, French, Spanish, Portuguese (Brazilian), and Russian**. Switch languages instantly in Settings without reload.
- **Real-Time i18n**: Every label, button, tooltip, toast notification, empty state, and onboarding guide updates dynamically when the language changes.

### New Features
- **Copy Debug Report (Markdown)**: The *Copy Logs* button in the Status tab now copies a fully formatted Markdown debug report — system info, connection status, video diagnostics, action history, and logs. One click, paste into a GitHub issue, all debugging data ready.
- **Platform Auto-Detection**: The Dev tab now identifies streaming platforms (YouTube, Netflix, Twitch, Prime Video, Disney+, HBO Max, Vimeo, Dailymotion) and displays the detected platform.
- **Enhanced Video Debug Info**: 20+ new fields in the Status tab including network state, buffered ranges, dimensions (with 0×0 warning), media error codes, shadow DOM status, seeking/ended/loop flags, volume, playback speed, and data attributes.
- **No-Video Diagnostic Mode**: When no video is found, the Status tab shows platform, page title, video count, shadow DOM presence, and MediaSession data to help troubleshoot.

### Changed
- **New TwoPointZero Branding**: Updated extension icons (16/32/48/96/128px).
- **Larger Popup Logo**: Extension popup icon increased to 48px.
- **Prime Video Unblocked**: Removed `amazon.` from the tab blacklist so Amazon/Prime Video tabs appear in the video selector.
- **Improved Debug Report**: Full User-Agent string for accurate browser identification, UTC timestamp, connection details including server URL and room info.
- **Smart Disconnect**: Improved disconnect handling when leaving rooms.
- **Human-Readable Room IDs**: Expanded word lists for friendlier room names.
- **Custom Server Support**: WEB_JOIN_REQUEST and join button for custom server invite flows.
- **Reconnection Strategy**: Custom server reconnection improvements.
- **Episode-Aware Sync**: Command sequencing with smarter episode transition detection and echo suppression for smoother series binges.
- **Sync Status Refinements**: YouTube and Twitch sync behavior improved.
- **No External Dependencies**: Extension remains dependency-free with no library overhead.

### Fixed
- Hardcoded strings, missing translation keys, and Service Worker notification race conditions.

---

## Versioning Policy

- **MAJOR** (x.0.0): Breaking protocol changes, architecture rewrites, or major feature milestones.
- **MINOR** (0.x.0): New features, significant enhancements, new translations, or UI redesigns.
- **PATCH** (0.0.x): Bug fixes, minor improvements, and documentation updates. PATCH releases may not receive individual changelog entries if bundled with a MINOR release.
