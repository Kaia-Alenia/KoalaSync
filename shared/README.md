# KoalaSync Shared Constants

This directory contains constants and protocol definitions used by both the extension and the server.

## Syncing with the Extension
> [!IMPORTANT]
> Every time this directory is modified, you must run `node scripts/build-extension.cjs` to keep the extension's copy up to date.

Because Browser Extensions (Manifest V3) cannot load files outside their root directory, all files in this directory must be copied to `extension/shared/` whenever they are modified. The build script handles this automatically.

## Security & Versioning Constants
- `OFFICIAL_SERVER_TOKEN`: A 32-byte hex token required to connect to the official relay server.
- `APP_VERSION`: The current version of the extension. Automatically injected from the git tag during CI release builds.
- `OFFICIAL_SERVER_URL`: The default endpoint for the official KoalaSync relay.

## Protocol Events
For the complete and current event list, see the `EVENTS` object in [`constants.js`](constants.js). Key events include:

| Event | Direction | Purpose |
|:------|:----------|:--------|
| `JOIN_ROOM` | Client → Server | Request to join a room with credentials |
| `LEAVE_ROOM` | Client → Server | Leave the current room |
| `ROOM_DATA` | Server → Client | Current room state (peers list) |
| `PLAY` / `PAUSE` / `SEEK` | Bidirectional relay | Media control commands |
| `PEER_STATUS` | Bidirectional relay | Heartbeat or join/leave notification |
| `FORCE_SYNC_PREPARE` | Bidirectional relay | Phase 1: Pause & seek to target time |
| `FORCE_SYNC_ACK` | Bidirectional relay | Phase 1 confirmation: peer is buffered |
| `FORCE_SYNC_EXECUTE` | Bidirectional relay | Phase 2: Resume playback simultaneously |
| `EVENT_ACK` | Server → Client | Delivery confirmation for UI feedback |
| `EPISODE_LOBBY` | Bidirectional relay | Episode transition: waiting for all peers |
| `EPISODE_READY` | Bidirectional relay | Episode confirmation: peer has loaded |
| `GET_ROOMS` / `ROOM_LIST` | Client ↔ Server | Room discovery |
| `ERROR` | Server → Client | Error message |
