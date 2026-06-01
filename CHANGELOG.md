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

### New Features
- **6-Language Website Mockup**: The interactive extension preview on the landing page now renders in all 6 supported languages (EN/DE/FR/ES/PT-BR/RU), dynamically compiled from locale files.
- **Copy Debug Report**: The *Copy Logs* button in the Status tab now copies a fully formatted Markdown report containing system info, connection status, video debug data, action history, and logs — ready to paste into GitHub issues.
- **Platform Auto-Detection**: The Dev tab now identifies streaming platforms (YouTube, Netflix, Twitch, Prime Video, Disney+, HBO Max, Vimeo, Dailymotion) and displays the detected platform.
- **Enhanced Video Debug Info**: 20+ new fields in the Status tab including network state, buffered ranges, dimensions (with 0×0 warning), media error codes, shadow DOM status, seeking/ended/loop flags, volume, playback speed, and data attributes.
- **No-Video Diagnostic Mode**: When no video is found, the Status tab shows platform, page title, video count, shadow DOM presence, and MediaSession data to help troubleshoot.

### Changed
- **New TwoPointZero Branding**: Updated extension icons (16/32/48/96/128px), website favicon (PNG 16×16 + 32×32), Apple touch icon (192×192), and web manifest icons.
- **Larger Logo Display**: Popup logo increased to 48px; website nav logo to 64px with improved vertical centering.
- **Higher Quality AVIF**: Build script AVIF quality raised from 70 to 80, speed improved from 6 to 4, and minimum file size threshold removed so all assets get AVIF variants.
- **Prime Video Unblocked**: Removed `amazon.` from the tab blacklist so Amazon/Prime Video tabs appear in the video selector.
- **Improved Browser Detection**: Debug report now includes the full User-Agent string for accurate browser identification.

---

## [v1.9.3] — 2026-05-23

### Fixed
- Smart disconnect handling when leaving rooms
- Human-readable room ID generation with expanded word lists
- WEB_JOIN_REQUEST and join button for custom server invite flows
- Custom server reconnection strategy improvements
- YouTube and Twitch sync status refinements
- Hardcoded strings, missing translation keys, and SW notification race conditions
- ESLint warnings and syntax consistency

### Added
- Relay reachability check hint in README
- Crawlable language navigation links for SEO
- Per-locale HowTo and FAQPage schema markup
- TESTED_SERVICES.md compatibility matrix
- Visible FAQ section on landing page with FAQPage schema

---

## [v1.9.0] — 2026-05-18

### New Features
- **Full Dynamic i18n**: The browser extension now supports 6 languages (EN/DE/FR/ES/PT-BR/RU) with real-time language switching without reload.
- **6-Language Website**: Landing page, join page, and legal pages now available in all 6 languages with proper hreflang tags and canonical URLs.

### Changed
- **Episode-Aware Sync**: Command sequencing with smarter episode transition detection and echo suppression for smoother series binges.
- Build script improvements for safer minified output (`.min.*` naming).
- Website SEO overhaul: Clean URLs, sitemap improvements, meta description optimization.
- Privacy improvements: Email obfuscation, Caddy CSP headers, no external dependencies.

---

## Versioning Policy

- **MAJOR** (x.0.0): Breaking protocol changes, architecture rewrites, or major feature milestones.
- **MINOR** (0.x.0): New features, significant enhancements, new translations, or UI redesigns.
- **PATCH** (0.0.x): Bug fixes, minor improvements, and documentation updates. PATCH releases may not receive individual changelog entries if bundled with a MINOR release.
