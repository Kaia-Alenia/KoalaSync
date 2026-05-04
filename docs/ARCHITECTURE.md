# KoalaSync Architecture

This document describes the communication flows and internal logic of the KoalaSync system.

## 1. Extension Startup & Connection
- **Initialization**: On startup, `background.js` reads settings (Server URL, Username, Last Room) from `chrome.storage.sync`.
- **WebSocket Handshake**:
  1. Background creates a `new WebSocket` to `/socket.io/?EIO=4&transport=websocket&version=1.0.0`.
  2. Server performs security checks:
     - **IP Rate Limit**: Checks if the IP has exceeded connection limits.
     - **Protocol Version**: Client must match the server's protocol (currently `1.0.0`).
  3. Server responds with Engine.IO handshake (`0`) and the client joins the namespace (`40`).
- **Room Join**: Background emits `JOIN_ROOM` containing `roomId`, `password`, `peerId`, and `username`.
- **Deduplication**: If a user joins with a `peerId` that already has an active socket, the server kills the old socket to prevent "Ghost Peers".

## 2. Media Event Synchronization
When a user interacts with a video:
1. **Detection**: `content.js` listens to native events (`play`, `pause`, `seeked`) on the `<video>` element.
2. **Prevention of Loops**: Uses `lastTargetState` to distinguish between user actions and programmatic actions triggered by the extension.
3. **Reporting**: `content.js` sends a `CONTENT_EVENT` to `background.js`.
4. **Relay**: The Server forwards the event to all other peers in the room.
5. **Execution**: Remote peers receive the command and call `video.play()`, `video.pause()`, or `video.currentTime = targetTime`.

## 3. Two-Phase Force Sync
Ensures all peers are frame-perfect and buffered before resuming:
1. **Prepare**: Initiator sends `FORCE_SYNC_PREPARE` with the target timestamp.
2. **Buffer**: Peers seek and pause. Once buffered (`readyState >= 3`), they send a `FORCE_SYNC_ACK`. (Note: `content.js` limits polling to 8000ms).
3. **Execute**: Once the Initiator collects ACKs (or after an 8.5s timeout), they send `FORCE_SYNC_EXECUTE`.
   > [!IMPORTANT]
   > **Network Transit Buffer Rule**: The orchestrator (`background.js`) must always use a timeout at least 500ms longer than the worker (`content.js`) to account for IPC and network transit time. Never align them exactly 1:1, as this will introduce a race condition on slow connections.
4. **Resume**: All peers call `play()` simultaneously.

## 4. Episode Auto-Sync
Maintains continuous synchronized viewing when watching series:
1. **Detection**: `content.js` monitors the Media Session API for title changes.
2. **Lobby Creation**: When a new title is detected, the peer initiates an `EPISODE_LOBBY` and broadcasts the new title.
3. **Wait State**: All peers freeze their video until they have also loaded the exact same title.
4. **Mid-Lobby Joins**: If a new user joins the room during an active lobby, the lobby initiator broadcasts the active lobby state so the newcomer can sync up.
5. **Resume**: Once all peers report `EPISODE_READY`, the lobby is resolved and playback resumes perfectly.

## 5. Peer Lifecycle & Dual Heartbeat
To maintain a clean room state and eliminate "Ghost Peers":
- **Session Heartbeat (Background)**: Every 30 seconds, `background.js` sends an "I'm alive" signal to the server. This keeps you in the room even if no video is playing.
- **Video Heartbeat (Content)**: Every 15 seconds, `content.js` sends current playback metadata (time, title, state) if a video is found.
- **Server Pruning**: The server runs a "Reaper" every 2 minutes. If a peer has sent **zero** activity (no events and no heartbeats) for 5 minutes, they are forcefully disconnected.
- **Immediate Cleanup**: Rooms are deleted instantly when the last peer leaves or disconnects.

> [!CAUTION]
> **Identity Rule**: Differentiate between `peerId` and `socket.id`. Use `socket.id` exclusively for ephemeral transport routing on the server. Use `peerId` exclusively for identity, state management, and room tracking across the stack.

## 6. Broadcast Protocol & Routing
KoalaSync uses a megaphone routing approach to minimize server logic:
- **`emit()` Broadcast Behavior**: Any `emit()` from the extension client is unconditionally broadcast to **all other peers in the room**. It is not a direct message. 
- **Storm Prevention**: When dispatching state updates in response to a new user joining (e.g., an active lobby state), ensure ONLY the initiator (or a designated leader) calls `emit()` to prevent $O(N)$ broadcast storms.

## 7. Security & Stability
- **Service Worker Lifecycle**: Uses `chrome.alarms` to prevent the Manifest V3 service worker from suspending while in an active room.
- **Rate Limiting**: Server-side per-socket and per-IP rate limits to prevent sync-spamming or DoS.
- **Noise Filtering**: Uses a curated blacklist of domains (Search Engines, Social Media) to declutter the "Target Tab" selector in the popup.
- **Diagnostics**: A "Dev" tab provides real-time access to the underlying `<video>` state (`readyState`, `paused`, `currentTime`) for easier troubleshooting.

## 8. Constant Synchronization & Consistency
To maintain a "Single Source of Truth" across the server and extension without using a bundler:
- **Relay Server & Extension Modules**: `background.js` and `popup.js` import constants directly from `shared/constants.js`.
- **Content Scripts**: To ensure zero-latency execution, `content.js` uses a manual mirror of `EVENTS`. 
- **Synchronization**: The `node scripts/build-extension.js` script ensures that the `shared/` folder within the `extension/` directory is kept up-to-date with the root `shared/` source while packaging artifacts.
- **Verification**: Any protocol change requires a manual verification sweep across all three constant locations (Shared, Server, and Content Script Mirror).
