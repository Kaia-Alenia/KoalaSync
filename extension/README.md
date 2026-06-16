# KoalaSync Browser Extension

A Manifest V3 Browser Extension (Chrome & Firefox) for synchronized video playback across any website.

## Key Features
- **Manifest V3**: Optimized Service Worker architecture with session persistence.
- **Pure Vanilla JS**: No external dependencies or heavy libraries.
- **Smart Peer IDs**: Hexadecimal IDs combined with customizable Usernames for easy identification.
- **Dual Heartbeat**: Advanced session tracking (Background) and video synchronization (Content) to prevent ghost sessions.
- **Live Diagnostics**: Built-in "Dev" tab for real-time video state debugging (ReadyState, CurrentTime, etc.).
- **Dynamic i18n (Multi-Language)**: Fully localized in 6 languages (`en`, `de`, `fr`, `es`, `pt-BR`, `ru`) with auto-detected fallback and dynamic on-the-fly language selectors.

## Tab Overview
1. **Room**: Manage connections, view active peers, and share invitation links.
2. **Sync**: Control video playback (Play/Pause/Force Sync) and view recent activity.
3. **Settings**: Customize your Username, toggle domain-based Noise Filtering, and switch the App Language.
4. **Dev**: Monitor connection status and view real-time video element metadata for debugging.

## Privacy & Permissions
KoalaSync requires `<all_urls>` permission to detect and interact with video elements (`<video>`) on websites.
- **No Browsing History**: We do not track or store your browsing history.
- **State Management**: Sensitive data (Room Passwords) is stored locally using `chrome.storage`.
- **Zero Telemetry**: No analytics or external tracking scripts.
- **Zero Runtime Dependencies**: The extension is built with pure Vanilla JS and contains no external libraries or tracking scripts, ensuring performance and privacy.

## Installation
1. **Prepare Extension**: From the repository root, run:
   ```bash
   node scripts/build-extension.js
   ```
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `dist/chrome` folder.

## Development
If you modify `shared/constants.js`, you must synchronize the changes by running the build script from the root:
```bash
node scripts/build-extension.js
```
This ensures that the `extension/shared` folder is updated with the latest protocol constants.

## Module Structure

| File | Purpose |
|---|---|
| `background.js` | Service worker: message routing, tab listeners, startup |
| `content.js` | Video detection, audio processing, episode transition (IIFE) |
| `popup.js` | Popup UI: join/create, tabs, status, settings |
| `bridge.js` | Landing page bridge (injected into sync.koalastuff.net) |
| `episode-utils.js` | Shared `extractEpisodeId()` / `sameEpisode()` — used by background.js, injected into content.js at build time |
| `i18n.js` | Translation loader |
| `shared/` | Constants, blacklist, name generator |
