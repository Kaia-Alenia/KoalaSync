# KoalaSync Changelog

All notable changes to the KoalaSync browser extension and relay server.

---

## [v2.3.1] — 2026-06-15

### Fixed
- **Server: Race condition on concurrent peer joins**: Added a per-peerId serialization lock (`peerJoinLocks`) that prevents two connections with the same `peerId` from both passing the deduplication check and simultaneously registering in `peerToSocket`. Previously, rapid reconnects could leave stale mappings that caused cross-room ACK/PING misdelivery.
- **Server: Crash-safe error handling in teardown paths**: Wrapped `removePeerFromRoom` calls in the disconnect, leave, and reaper handlers with try/catch to prevent an unhandled exception in any teardown path from crashing the process.
- **Server: Smart unhandled rejection handling**: Replaced the immediate `process.exit(1)` on any `unhandledRejection` with a rate-limited approach — the server now exits only after 5 unhandled rejections within 60 seconds, surviving transient errors while still failing fast on cascading crashes.
- **Server: Reduced GC pressure in admin health metrics**: Replaced the three-pass `Array.from()` / `map()` / `reduce()` / `filter()` pattern in `buildHealthPayload()` with a single `for-of` loop, eliminating temporary array allocations proportional to the number of active rooms.
- **Server: Test isolation for rate-limit denial counters**: `stopServerForTests()` now resets the `rateLimitDenied` counters between test runs.

---

## [v2.3.0] — 2026-06-14

### Added
- **Extension: New Interactive Onboarding Tour**: A fully redesigned, interactive step-by-step onboarding experience.
- **Extension: Auto-Switch to Sync Tab**: The UI now intelligently switches to the Sync tab when you join a room to guide video selection.
- **Extension: Uninstall URL Integration**: Prepared an uninstall URL setup that works natively across Chrome and Firefox, cleanly attaching browser context for analytics.

### Fixed
- **Extension: Infinite Seek Loop Prevention**: Replaced the fragile time-based seek suppression with an exact target-time verification mechanism, entirely eliminating infinite seek loops on slow buffers.
- **Extension: Zombie Connections Resolved**: Implemented a forced disconnect upon ping timeouts, ensuring the extension reliably auto-reconnects when the WebSocket hangs in a half-open state.
- **Extension: Room Switching Architecture**: Joining a new room while already connected now explicitly severs the old connection first, preventing state cross-contamination. 
- **Extension: Join/Leave Race Conditions**: Added UI locks to prevent users from accidentally sending conflicting connection commands via rapid double-clicking.
- **Extension: Same-Room Invite Bypass**: Clicking an invite link for the room you are currently in no longer triggers a redundant reconnect, instead instantly confirming the join.
- **Extension: Audio settings now propagate immediately to video tabs**: Changes made in the audio options page are now instantly applied to the active video tab. Previously, settings saved to `chrome.storage.local` were not picked up by the background listener, which only watched `chrome.storage.sync`.
- **Extension: Audio compressor now logs enable/disable state and resume failures**: The compressor reports when it is activated or bypassed, and warns if the `AudioContext` cannot be resumed (e.g. browser autoplay policy requires a user gesture on the page first).
- **Extension: Video heartbeat no longer sent when alone in a room**: The full media metadata `PEER_STATUS` is now only emitted when other peers are present. The session keepalive (background heartbeat) continues to run unaffected, preventing the server reaper from disconnecting idle peers.
- **Server: Increased `failedAuthAttempts` eviction threshold from 50k to 200k**: Reduces frequency of expensive batch evictions under high auth-failure volumes, smoothing heap usage.

---

## [v2.2.4] — 2026-06-10

### Fixed
- **Extension: Error notifications now respect `browserNotifications` setting**: Server error events (e.g. "Server is restarting") no longer trigger a browser notification when the user has disabled notifications in the extension settings.
- **Server: Misleading reconnect message corrected**: The graceful shutdown message no longer tells users to manually reconnect — the extension handles this automatically.

---

## [v2.2.3] — 2026-06-10

### Added
- **Artifact Attestations (Supply Chain Security)**: All release artifacts (Docker images, extension ZIPs) are now published with signed [SLSA provenance attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations) via `actions/attest@v4`. Anyone can verify that an artifact was built from this repository using `gh attestation verify`.
- **Admin health: `rateLimits.denied` counters**: New rolling counters track actual rate-limit denials (429 responses), separate from `rateLimits.trackedClients` which reports unique IPs in the tracking window.
- **Docker HEALTHCHECK**: Container health is now checked every 30s via `GET /health`.
- **`npm start` script**: Server can now be started with `npm start`.

### Fixed
- **Server: `activeLobby` no longer silently overwritten**: If a second peer sends `EPISODE_LOBBY` while a lobby is already active, the request is now ignored instead of destroying the first peer's lobby.
- **CORS log sanitization**: Rejected origin headers are sanitized (`\r\n` stripped) to prevent log injection.
- **Extension: pagehide resource leak**: `keepAlivePort`, `lobbyPollTimer`, heartbeats, and `MutationObserver` are now properly cleaned up when a tab is hidden or enters bfcache.
- **Extension: unhandled storage rejections**: `chrome.storage.session.set()` calls in the disconnect handler now have `.catch(() => {})`.
- **`'Pixel'` duplicate in name generator**: Second occurrence replaced with `'Nitro'` for better name diversity.
- **`'opposum'` typo**: Corrected to `'opossum'` in the emoji map and added `'Opossum'` to `USERNAME_NOUNS`.
- **Test reliability**: `test-server-routes.mjs` now sets `ADMIN_METRICS_TOKEN` before importing the server module, fixing standalone test execution.
- **`MAX_PEERS_PER_ROOM` konsistent**: `.env` auf 25 gesetzt (wie `.env.example`).
- **pt-BR.json duplicate removed**: Duplicate `FOOTER_DISCLAIMER` key removed from website locale.

### Changed
- **Admin health: `rateLimitEntries` renamed to `rateLimits.trackedClients`**: The field now accurately describes that it tracks unique clients in the rate-limit window, not denial counts. Update your json_exporter/Grafana config accordingly.
- **README restructured**: Sections reordered by progressive technical depth. New "Supply Chain Security" subsection under "For Developers & Self-Hosters" with verification commands.

---

## [v2.2.2] — 2026-06-09

### Added
- **Chrome Web Store i18n Support**: Added `default_locale: "en"` to manifest and created `_locales/*/messages.json` for all 13 supported languages. This unlocks the language selection dropdown in the Chrome Web Store dashboard, allowing translated store listings (title, description) per locale. The extension's own UI translations (`locales/*.json` + `i18n.js`) remain unchanged.
- **Locale test coverage**: Extended `scripts/test-locales.js` to validate all `_locales/*/messages.json` files (correct format, required keys, no duplicates) and verify `default_locale` is set in the manifest.

### Fixed
- **Copy Logs button alignment**: Removed stray `margin-top: 8px` inherited from `.secondary` class that pushed the button 8px down in the connection status row.

---

## [v2.2.1] — 2026-06-09

### Added
- **Server Ping Display**: Measures round-trip latency to the relay server via application-level ping/pong events. The extension sends `PING { t }` every 15 seconds; the server responds with `PONG { t }`. Round-trip time is calculated client-side and displayed in the Status tab, color-coded (<50ms green, 50–150ms yellow, >150ms red). No ping value is shown when disconnected or if the server does not respond within 5 seconds.
- **Peer Ping Response (Future-Proof)**: The extension can now respond to incoming `PING { t, sender }` events from other peers by sending back `PONG { t, target: sender }`. The relay server forwards `PING` to the target peer and routes `PONG` back to the original sender. Both client and server validate that peers are in the same room before forwarding/routing. Peer-to-peer ping initiation will be activated in a future extension update without requiring a server restart.

---

## [v2.2.0] — 2026-06-08

### Added
- **Web Audio API Compressor**: Built-in audio dynamic range compression with four presets (Recommended, Dynamic Range, Vocal Enhancement, Smooth) and fully customizable sliders (threshold, ratio, knee, attack, release). Uses dry/wet crossfade (40ms linear ramp) to avoid clicks. Configured via the new Audio Options page accessible from the Settings tab.
- **Audio Options Page** (`audio-options.html`): Dedicated settings page with master toggle, compressor preset selector, real-time custom sliders, and equalizer placeholder. Dark theme matching the popup design.
- **Feature Hint System**: Generic `dismissedHints` array in sync storage for announcing new features. First hint highlights the Audio Options entry in Settings. Extensible for future features.

### Changed
- **Ko-Fi Support Links**: Static footer badges on the Settings and Status tabs linking to the developer's support page. README and website footer updated with Ko-Fi badge.

### Fixed
- **Portuguese (PT) locale**: Removed Italian contamination — "sincronizzazione" → "sincronização", "tempo reale" → "tempo real", "Link di Invito" → "Link de Convite", "Sair della Sala" → "Sair da Sala".
- **Korean locale**: Fixed broken character in `HOWTO_STEP_2_TEXT` (`클rip보드` → `클립보드`).
- **Website COMP_FEAT_6_KOALA**: Normalized from inconsistent "6 Languages" to "13 Languages" across all locale files (en, de, es, fr, pt-BR, ru).
- **Debug report showing wrong logs**: Fixed `logs.slice(-50)` and `history.slice(-20)` in the "Copy Debug Report" feature. Since `addLog()` and `addToHistory()` use `unshift` (inserting entries at index 0), the arrays are ordered newest-first. `slice(-N)` took the N **oldest** entries instead of the N **newest**. Changed to `slice(0, N).reverse()` to correctly include the most recent logs and display them chronologically.

---

## [v2.1.2] — 2026-06-06

### Fixed
- **Episode guard regex**: Fixed `isDifferentEpisode()` not detecting episode changes when the MediaSession title uses `Sxx:Exx` format (colon separator, as used by Jellyfin/Emby). The regex character class `[\s\-\.]` was replaced with `[^a-zA-Z0-9]` to match **any** non-alphanumeric separator between season and episode numbers, preventing play/pause/seek commands from a different episode leaking through and incorrectly manipulating a peer's playback.
- **Per-device storage isolation**: Migrated `username`, `roomId`, `password`, `serverUrl`, and `useCustomServer` from `chrome.storage.sync` (synced across Google account) to `chrome.storage.local` (per-device). This prevents the extension from automatically joining the same room with the same name on multiple devices. Existing user data is migrated silently on first run; all preferences (`filterNoise`, `autoSyncNextEpisode`, etc.) remain synced.

### Changed
- Added one-time migration fallback in `getSettings()` and popup `init()` to copy existing user settings from `storage.sync` to `storage.local` on first launch after the update.

---

## [v2.1.0] — 2026-06-04

### Added
- Added full translation support for 7 new languages to both the browser extension popup settings and landing website: Italian (`it`), Polish (`pl`), Turkish (`tr`), Dutch (`nl`), Japanese (`ja`), Korean (`ko`), and European Portuguese (`pt`).
- Implemented robust, centralized browser system language detection mapping `pt-BR` to Brazilian Portuguese and other `pt` locales (like `pt-PT`) automatically to European Portuguese.
- Added flag emojis to language selector dropdowns in both the extension popup and landing/utility web pages for quicker visual identification.
- Added 181 translation keys parity validation suite checks for the new languages.

### Fixed & Hardened (Extension Audit)
- Guarded all website `localStorage` interactions to prevent initialization/join flow script failures on privacy-hardened or cookie-blocked browser configurations.
- Added robust validation null-guards to `chrome.runtime.onMessage` listeners across all extension scripts (`bridge.js`, `content.js`, `background.js`, `popup.js`) to reject unexpected runtime messages.
- Guarded CustomEvent payload destructuring in `bridge.js` to ensure stability when receiving third-party page events.
- Wrapped `video.currentTime` seeking adjustments during forced sync in content scripts with exception handling to absorb uninitialized video state DOMExceptions.
- Added payload validation guards on incoming Socket.IO events within the background script's event handlers to secure against malformed server updates.
- Prevented noisy browser console exceptions from context invalidation in target tabs by catching promise rejections on extension message dispatches.

### Performance
- Implemented in-memory language dictionary caching in the background script to completely avoid redundant extension package filesystem reads during translations.


---

## [v2.0.8] — 2026-06-03

### Fixed
- Fixed a bug where switching language inside the extension popup overwrote dynamic fields (such as active room ID, connection status, active server details, and video debug info) with default localized placeholder texts.
- Fixed a version reporting mismatch where the copied logs (debug reports) and connection handshake parameters incorrectly reported the hardcoded `1.9.0` version instead of the actual installed manifest version.

---

## [v2.0.7] — 2026-06-03

### Added
- Added a `DEBUG_LOGGING` environment variable to the relay server (defaulting to `"0"` / disabled) to prevent console spam from verbose connection (`CONN`), room activity (`ROOM`, `DEDUPE`), and `CORS` events under load. Critical logs like `SERVER`, `SECURITY`, `AUTH`, and `ERROR` remain enabled at all times.

---

## [v2.0.6] — 2026-06-03

### Performance & Security Hardening
- Optimized failed authentication attempts cache eviction algorithm to $O(1)$ by exploiting Javascript `Map` insertion-order properties. This completely removes the previous array copying and sorting bottleneck, neutralizing a potential main-thread blocking DoS vector under heavy brute-force password traffic.

---

## [v2.0.5] — 2026-06-03

### Security & Hardening
- Hardened extension room idle auto-leave detection to correctly recognize when the target tab's video heartbeat goes stale (e.g., after tab navigation or media closure).
- Exported cleaner graceful shutdown and lifecycle methods (`stopServerForTests`) from the relay server to prevent socket leaks and port-binding conflicts during verify checks.

### Added
- Added a validation step in `test-locales.js` to ensure the supported language list in `extension/i18n.js` is perfectly synchronized with the actual JSON translation files in the locales directory.
- Added a robust route verification test suite (`scripts/test-server-routes.mjs`) covering rate limit throttling, caching headers, and admin metrics access control.

---

## [v2.0.4] — 2026-06-03

### Security & Hardening
- Hardened relay health endpoints against simple flood traffic: `GET /` and `GET /health` are now limited to 10 requests per minute per client IP.
- Added lazy 60-second server-side caching for `GET /`, basic `/health`, and admin `/health` JSON responses to reduce repeated health-check work under noisy polling.
- Added stricter brute-force throttling for invalid admin metrics bearer attempts.
- Added startup warning for short `ADMIN_METRICS_TOKEN` values and documented that production Node ports must stay private behind Caddy or another trusted reverse proxy.
- Lowered the default maximum peers per room to 25.

### Added
- Optional privacy-preserving admin metrics on `/health` when `ADMIN_METRICS_TOKEN` is configured and a valid bearer token is supplied. Metrics are aggregate-only and exclude room IDs, peer IDs, usernames, IP addresses, media titles, passwords, and other user-level data.

### Changed
- Removed `bcryptjs`; temporary room passwords continue to use keyed SHA-256/HMAC hashing as documented.
- Public room discovery is now rate-limited server-side to one refresh every 10 seconds per socket, with the extension refresh button locked for 11 seconds.

### Fixed
- Improved Shadow DOM video detection so real embedded players are not hidden by smaller light-DOM preview or placeholder videos.
- Fixed join-button timeout cleanup after join status responses.

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
