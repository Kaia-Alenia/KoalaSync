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
MAX_PEERS_PER_ROOM=25
MIN_VERSION=1.0.0
# Optional: enables aggregate-only admin metrics on /health with Authorization: Bearer <token>
ADMIN_METRICS_TOKEN=
```

### Health & Metrics
`GET /` and `GET /health` are IP-rate-limited. By default `/health` returns only basic service status, uptime, room count, connection count, and a timestamp.

If `ADMIN_METRICS_TOKEN` is set, requests with `Authorization: Bearer <token>` receive additional aggregate metrics such as total peers, average peers per room, max room size, active lobby count, rate-limit map sizes, and process memory usage. The metrics response does not include room IDs, peer IDs, usernames, IP addresses, media titles, or other user-level data.

### Docker (Recommended)
The server is available as a pre-built image on GHCR.
```bash
# Pull from GHCR
docker pull ghcr.io/shik3i/koalasync:latest

# Or build from the repository root
docker build -t koala-sync-server -f server/Dockerfile .
```
See [Docker network compose](../docker-compose.caddy.example.yml) or [Static IP compose](../docker-compose.ip.example.yml) in the root directory for ready-to-use Docker Compose files.

### Manual Setup
```bash
cd server
npm install
npm start
```

## Security
- **Rate Limiting**: IP-based connection limits and socket-based event limits.
- **Room Discovery Throttle**: Room-list refreshes are rate-limited server-side to one request every 10 seconds per socket.
- **Token Handshake**: Requires a valid token defined in the root `shared/constants.js`.
- **Single Source of Truth**: The server imports constants directly from the root `shared/` directory.
- **In-Memory**: Rooms are automatically pruned after 2 hours of inactivity.
