# KoalaSync Relay Server

A Node.js relay server for synchronized video playback.

## Key Features
- **Zero-Persistence**: No database. All state is held in RAM.
- **Privacy First**: No tracking, no persistent logging of user data.
- **WebSocket Only**: Minimal overhead with efficient transport.

## Setup

### Environment
Copy `.env.example` to `.env` and configure your settings.
```bash
PORT=3000
MAX_ROOMS=1000
MAX_PEERS_PER_ROOM=50
MIN_VERSION=1.0.0
```

### Docker (Recommended)
The server is available as a pre-built image on GHCR.
```bash
# Pull from GHCR
docker pull ghcr.io/shik3i/koalasync:latest

# Or build from the repository root
docker build -t koala-sync-server -f server/Dockerfile .
```
See [docker-compose.caddy.example.yml — Docker network](../docker-compose.caddy.example.yml) or [docker-compose.ip.example.yml — Static IP](../docker-compose.ip.example.yml) in the root directory for ready-to-use Docker Compose files.

### Manual Setup
```bash
cd server
npm install
npm start
```

## Security
- **Rate Limiting**: IP-based connection limits and socket-based event limits.
- **Token Handshake**: Requires a valid token defined in the root `shared/constants.js`.
- **Single Source of Truth**: The server imports constants directly from the root `shared/` directory.
- **In-Memory**: Rooms are automatically pruned after 2 hours of inactivity.
