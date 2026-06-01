# Tested Streaming Services

This document tracks which streaming platforms and media servers have been tested with KoalaSync.

| Service | Sync Works | Media Title | Episode Auto-Sync | Notes |
|---------|:----------:|:-----------:|:-----------------:|-------|
| **YouTube** | ✅ Full | ✅ Full | ❌ | Best-in-class support. Native player API, reliable title detection. |
| **Twitch** | ✅ Full | ✅ Full | ❌ | Live-only platform. Tested on regular streams. |
| **Netflix** | ✅ Full | ⚠️ Hidden | ⚠️ Manual | Sync works perfectly, but DRM prevents media title detection. Episode transitions may require manual lobby. |
| **Emby** | ✅ Full | ✅ Full | ✅ Full | Self-hosted. Full HTML5 player access. |
| **Jellyfin** | ✅ Full | ✅ Full | ✅ Full | Self-hosted. Full HTML5 player access. |
| **Plex** | Not tested | Not tested | Not tested | Community reports indicate compatibility via HTML5 player mode. |
| **Disney+** | Not tested | Not tested | Not tested | Widevine DRM may restrict title detection similar to Netflix. |
| **Prime Video** | ⚠️ Partial | ⚠️ Partial | ❌ | Video elements detected (2 on page, picks larger one). Playback state + time readable. However, the preview/trailer video may be selected instead of the main content. Play/Pause commands may not reach the correct player. Title detection from MediaSession API may work for some content. |
| **HBO Max / Max** | Not tested | Not tested | Not tested | — |
| **Crunchyroll** | Not tested | Not tested | Not tested | — |
| **Vimeo** | Not tested | Not tested | Not tested | — |
| **Dailymotion** | Not tested | Not tested | Not tested | — |
| **ARD / ZDF Mediathek** | Not tested | Not tested | Not tested | German public broadcasters. HTML5 players expected to work. |

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ Full | Works without limitations. |
| ⚠️ Partial | Works with caveats (see Notes). |
| ❌ N/A | Not applicable or not supported. |

## How to Contribute

Tested a service that's not listed? Found different behavior than documented?

1. Test KoalaSync on the service with two browser profiles
2. Use the extension's **Dev tab** to check `readyState`, `currentTime`, and media title
3. Open a GitHub issue or PR updating this table

## Technical Background

KoalaSync works on any website with a **standard HTML5 `<video>` element** that allows script injection. 

Limited functionality on certain platforms is typically caused by:
- **DRM/Copy Protection** (e.g., Widevine on Netflix, Disney+) which restricts access to media metadata like title and playback state
- **Shadow DOM encapsulation** that hides video elements from content scripts
- **Strict Content Security Policies** (CSP) that block script injection

Websites with heavily obfuscated custom players (e.g., complex Shadow DOM, iframe isolation) may require platform-specific workarounds in `content.js`.
