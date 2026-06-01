# KoalaSync Changelog

All notable changes to the KoalaSync browser extension and relay server.

---

## [v2.0.1] — 2026-06-01

### Fixed
- Video detection on Prime Video: `findVideo()` now scores all video elements by size, duration, and mute state instead of picking the first one. Fixes 0×0 placeholder being selected over the actual player.
- History entries in debug report showing `?` instead of action names.
- Prime Video status in compatibility matrix updated to reflect partial support.

### Added
- Multi-video overview table in Copy Debug Report when a page has more than one `<video>` element. Shows resolution, mute state, playback state, readyState, duration, and marks the currently targeted video.

---

## [v2.0.0] — 2026-05-31

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

---

## [v1.9.3] — 2026-05-23

### Fixed
- Smart disconnect handling when leaving rooms
- Human-readable room ID generation with expanded word lists
- WEB_JOIN_REQUEST and join button for custom server invite flows
- Custom server reconnection strategy improvements
- YouTube and Twitch sync status refinements
- Hardcoded strings, missing translation keys, and SW notification race conditions

### Added
- TESTED_SERVICES.md compatibility matrix
- Relay reachability check hint in README

---

## [v1.9.0] — 2026-05-18

### Changed
- **Episode-Aware Sync**: Command sequencing with smarter episode transition detection and echo suppression for smoother series binges.
- **Server Security**: Caddy CSP headers, no external dependencies in extension.
- Build script improvements for safer minified output.

---

## Versioning Policy

- **MAJOR** (x.0.0): Breaking protocol changes, architecture rewrites, or major feature milestones.
- **MINOR** (0.x.0): New features, significant enhancements, new translations, or UI redesigns.
- **PATCH** (0.0.x): Bug fixes, minor improvements, and documentation updates. PATCH releases may not receive individual changelog entries if bundled with a MINOR release.
