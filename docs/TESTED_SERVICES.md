# Tested Streaming Services

This document tracks which streaming platforms and media servers have been tested with KoalaSync.

| Service | Sync Works | Media Title | Episode Auto-Sync | Notes |
|---------|:----------:|:-----------:|:-----------------:|-------|
| **YouTube** | ✅ Full | ✅ Full | ❌ | Individual videos, not episodes — no episode auto-sync. |
| **Twitch** | ✅ Full | ✅ Full | ❌ | Individual streams/VODs, not episodes — no episode auto-sync. |
| **Netflix** | ✅ Full | ❌ | ❌ | No media title exposed. |
| **Emby** | ✅ Full | ✅ Full | ✅ Full | Best-in-class support. |
| **Jellyfin** | ✅ Full | ✅ Full | ✅ Full | — |
| **Plex** | Not tested | Not tested | Not tested | — |
| **Disney+** | ✅ Full | ⚠️ Partial | ❌ | Series title only (e.g. "The Simpsons"), no episode info. |
| **Prime Video** | ✅ Full  | ✅ Full  | ❌ | — |
| **HBO Max / Max** | Not tested | Not tested | Not tested | — |
| **Crunchyroll** | Not tested | Not tested | Not tested | — |
| **Vimeo** | Not tested | Not tested | Not tested | — |
| **Dailymotion** | Not tested | Not tested | Not tested | — |
| **ARD / ZDF Mediathek** | Not tested | Not tested | Not tested | — |
| **Vix** | ✅ Full | ✅ Full | ✅ Full | Everything works correctly. |

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
- **DRM/Copy Protection** (e.g., Widevine on Netflix) which restricts access to media metadata like title and playback state
- **Shadow DOM encapsulation** that hides video elements from content scripts
- **Strict Content Security Policies** (CSP) that block script injection

Websites with heavily obfuscated custom players (e.g., complex Shadow DOM, iframe isolation) may require platform-specific workarounds in `content.js`.
