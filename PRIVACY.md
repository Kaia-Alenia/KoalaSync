# Privacy Policy

KoalaSync is designed with a **Security-First & Volatile** architecture. This means we prioritize keeping your data out of persistent storage, though certain technical data must be processed temporarily to ensure service stability and security.

## 1. Data Processing (In-Memory Only)
KoalaSync does not use a database. All active session data exists only in the server's RAM and is purged immediately when no longer needed.
- **Session Data**: To synchronize playback, the server must temporarily hold your `peerId`, `username`, and the `title` of the video you are watching. Additionally, playback metadata (`mediaTitle`, `playbackState`, `currentTime`, `volume`, `muted`) is held per peer for the duration of the session. All of this is deleted as soon as you leave the room.
- **Room Passwords**: If you set a room password, it is stored only as a secure **bcrypt hash** in RAM. The server never sees or stores your plaintext password.
- **Routing Maps**: The server maintains ephemeral lookup tables (`socketToRoom`, `peerToSocket`) to route messages between peers. These contain only transport identifiers and are purged on disconnect.

## 2. Security & Rate Limiting
To prevent abuse and brute-force attacks, the following data is processed:
- **Brute-Force Protection**: If multiple failed password attempts are detected, the server stores the `IP address` and `Room ID` in a temporary RAM-based lockout list for a maximum of 15 minutes.
- **Connection Rate Limiting**: IP addresses are tracked for 60 seconds to prevent connection-flooding (DoS) attacks.
- **Event Rate Limiting**: Per-socket event counters are tracked for 10-second windows to prevent event-spamming. These are keyed by ephemeral socket IDs and cleaned up periodically.
- **Console Logging**: The official relay server (`sync.shik3i.net`) outputs connection events (including IP addresses) to the server console for real-time monitoring. These logs are ephemeral and are not archived, sold, or linked to any persistent user identity.

## 3. Extension Permissions
The browser extension requires the following permissions:
- `storage`: To remember your local preferences.
- `tabs` & `scripting`: To detect and control video elements on the pages you choose to sync.
- **No History Access**: We do not read, store, or transmit your browsing history. We only interact with the specific tab you have actively selected for synchronization.

## 4. Zero Third-Party Requests
KoalaSync is completely self-contained:
- **No CDNs or External Libraries**: All scripts and styles are self-hosted.
- **No Analytics**: We do not use Google Analytics, tracking pixels, or any third-party telemetry.
- **No External Fonts**: We use system font stacks to prevent tracking via font services.

---

**Auditable & Open Source**: Because KoalaSync is open source, you can verify these claims by reviewing the [Server Source Code](https://github.com/Shik3i/KoalaSync/blob/main/server/index.js) and the [Extension Logic](https://github.com/Shik3i/KoalaSync/blob/main/extension/content.js).
