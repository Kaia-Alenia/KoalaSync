# KoalaSync AI Onboarding (AI_INIT.md)

Welcome to the KoalaSync project. This file is the primary entry point for any developer or AI agent working on this codebase. It defines the architecture, non-negotiables, and workflows required to maintain the stability and security of the system.

> [!IMPORTANT]
> **Privacy & Data Sovereignty**: KoalaSync follows a strict **Zero-External-Requests Policy**: The extension and website must not make requests to any third-party domains (Google Fonts, CDNs, etc.). All assets (fonts, icons, scripts) must be self-hosted or use system defaults.
> - **Font Stack**: Use a modern system font stack (e.g., -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif) to maintain a premium look without external dependencies. Prohibit the use of `@import` or `<link>` for external font services.

---

## 1. Project Overview
KoalaSync is a specialized tool for **synchronized video playback** across multiple remote peers. It supports YouTube, Twitch, and native HTML5 video elements. 
- **Users**: Friends or groups wanting to watch synchronized content together.
- **Workflow**: A user creates a room, shares an invitation link, and all peers in that room are synchronized via a Node.js relay server.
- **Identity**: Users are identified by a unique hex `peerId` combined with a customizable `username`.

## 2. Repository Structure
- `extension/`: Browser Extension (Chrome & Firefox, Manifest V3). Contains background service worker, content scripts, and popup UI.
- `server/`: Node.js Relay Server using Socket.IO (WebSocket-only).
- `website/`: **Landing Page** & Invitation Bridge (Marketing, Tutorials, and Downloads).
- `shared/`: **Single Source of Truth** for protocol constants and event names.
- `scripts/`: Development utilities (e.g., `build-extension.js`).
- `docker-compose.yml`: Root-level orchestration for the relay server.

> [!IMPORTANT]
> **Single Source of Truth**: `shared/constants.js` and `shared/blacklist.js` are the master files. They must be synchronized to the `extension/shared/` directory using `node scripts/build-extension.js`. 
> - **Extension Modules** (`background.js`, `popup.js`) import directly from `./shared/constants.js`.
> - **Content Scripts** (`content.js`) use a **marker-injected synchronous copy** of the constants. The build script automatically replaces the marked blocks — no manual mirroring needed.

## 3. Mandatory Reading
Before touching any code, you MUST read the following documents in order:
1. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) – Detailed communication flows, Dual Heartbeat, and two-phase sync protocol.
2. [extension/README.md](extension/README.md) – Extension components, tab structure, and loading process.
3. [docs/SYNC_GUIDE.md](docs/SYNC_GUIDE.md) – Protocol constants and synchronization requirements.

## 4. The "Vanilla JS Mirror" Pattern
To avoid boot-time race conditions in Manifest V3 without a bundler, the following architectural trade-off is enforced:
- **Synchronous Execution**: `content.js` MUST execute synchronously to catch early media events. 
- **Automated Injection**: The build script (`node scripts/build-extension.js`) automatically injects `EVENTS` and `HEARTBEAT_INTERVAL` into `content.js` using marker-based replacement (see `scripts/README.md` for marker details).
- **Maintenance**: After modifying `shared/constants.js`, simply run the build script. No manual mirroring is required.

## 5. File Responsibility Map

| File | Responsibility |
|:-----|:---------------|
| `background.js` | WebSocket client, state orchestrator, event router, session persistence |
| `content.js` | Video element detection, media control, event origin detection (loop prevention) |
| `popup.js` | UI rendering, user input handling, peer display, invitation link generation |
| `bridge.js` | Landing page ↔ extension communication for invitation join flow |
| `server/index.js` | Room management, message relay, rate limiting, authentication, peer lifecycle |

## 6. Design Guidelines
The popup UI follows a strict design system. Do not modify these variables or the layout structure without explicit approval.
- **Font**: System font stack. **MANDATORY**: No external CDNs or Google Fonts to ensure 100% privacy.
- **Popup Width**: Fixed at `320px`.
- **Tab Structure**: Must maintain the **Room**, **Sync**, **Settings**, and **Dev** tabs.
- **CSS Variables**:
  | Variable | Value | Purpose |
  | :--- | :--- | :--- |
  | `--bg` | `#0f172a` | Main background |
  | `--card` | `#1e293b` | Form and info cards |
  | `--accent` | `#6366f1` | Primary actions and branding |
  | `--success` | `#22c55e` | Success states / Online dot |
  | `--error` | `#ef4444` | Errors / Offline dot |

## 7. Non-Negotiables (Core Logic)
The following features are critical and must not be removed or fundamentally altered:
- **Two-Phase Force Sync**: The `Prepare` → `ACK` → `Execute` flow ensures all peers are buffered before playback resumes.
- **Episode Auto-Sync**: Ensures series binges stay perfectly synced. A lobby initiates during title transitions, freezing peers until everyone is ready.
- **Dual Heartbeat**: 
    - **Background Heartbeat (30s)**: Ensures session persistence even without a video element.
    - **Content Heartbeat (15s)**: Transmits current video metadata (time, title).
- **Dead Peer Pruning**: Server "Reaper" disconnects peers after 5 minutes of total silence (no heartbeats or events).
- **Deduplication**: Server kills old sockets if a user re-joins with the same `peerId` to prevent ghosts.
- **Platform Specifics**: Specialized click-logic for YouTube (`.ytp-play-button`) and Twitch.
- **pollSeekReady()**: Polling mechanism that checks `video.readyState` before acknowledging sync.
- **SW Keep-alive**: Use of `chrome.alarms` to prevent the Manifest V3 Service Worker from suspending.
- **Diagnostics**: The "Dev" tab provides real-time access to the underlying `<video>` state for troubleshooting.
- **Persistence**: `peerId` and `username` must be stored to remain stable across sessions.
- **Room ID Format**: Room IDs are restricted to `[a-zA-Z0-9-]` only (alphanumeric + hyphens). This is enforced server-side.

## 8. Technical Constraints
- **No Bundler**: The extension uses plain ES Modules. Do not introduce build steps or npm packages into the `extension/` folder.
- **Manual Protocol**: `background.js` implements a subset of the Socket.IO wire protocol natively.
- **Server Transport**: Restricted to `websocket` only. Polling is disabled.
- **Docker Context**: The Docker build must run from the **Repo Root**.
- **Manifest Settings**: `run_at` must remain `document_idle`, and `all_frames` must remain `false`.

## 9. Security & Deployment
- **Tokens**: Security tokens are intentionally managed via `shared/constants.js` and server `.env`.
- **Environment**: `.env` is excluded via `.gitignore`. Only `.env.example` should be committed.
- **Revocation**: `MIN_VERSION` check on the server is used to deprecate old extension versions.
- **Invitation Links**: Correctly propagate server URLs, Room IDs, and Passwords via the URL hash to the bridge.

## 10. Common Workflows

### ⚠️ Pre-Session Git Sync (MANDATORY)
Before starting any task, committing, or pushing, you **MUST** run `git pull --rebase` to ensure your local branch is up-to-date with `origin/main`. CI pipelines and other agents may push commits concurrently. Skipping this step will cause merge conflicts and rejected pushes.

### Releasing a New Version (CRITICAL WORKFLOW FOR AI AGENTS)
> [!CAUTION]
> **AI AGENTS MUST FOLLOW THIS EXACT SEQUENCE WHEN RELEASING A NEW VERSION OR TAGGING.**
> The CI pipeline automatically injects the version from the git tag into `manifest.base.json`, `shared/constants.js`, and `package.json`. You do NOT need to manually bump version numbers.
> - **Website Versioning**: **NEVER** manually modify the version fallback strings in `website/index.html`. The website dynamically fetches the latest version and release date from `website/version.json` at runtime using `website/app.js`. Manual bumps in the HTML file are completely redundant and should be avoided.
1. **MANDATORY SYNTAX CHECK**: Before staging, committing, or pushing any changes, you **MUST** run a syntax validation check using `node -c` on every single modified JavaScript file (e.g., `node -c extension/background.js` and `node -c extension/content.js`). **NEVER** commit or push code that fails this check.
2. Commit all verified code changes and push to `main`.
3. Create and push a new tag. **MANDATORY**: Tags MUST start with a `v` (e.g., `v1.4.0`). The GitHub Actions release workflow is strictly configured to ignore any tags without the `v` prefix.
4. The CI will extract the version from the tag (e.g., `v1.4.0` → `1.4.0`), inject it into all source files, build the extension artifacts, publish the Docker image, and create a GitHub Release.
5. Verify the release builds on GitHub Actions.

### Adding a Protocol Event
1. Add the event name to `shared/constants.js`.
2. Run the build script (`node scripts/build-extension.js`).
3. Implement the handler in `server/index.js` and `background.js`.

### Testing Locally
1. Run the build script: `node scripts/build-extension.js`.
2. Load `dist/chrome/` as an "Unpacked Extension" in Chrome (or `dist/firefox/` in Firefox).
3. Start the server from the root: `docker-compose up --build`.
4. Use **different browser profiles** or vendors to test multi-peer logic.
5. Use the **Dev tab** to verify real-time video element metadata.

### Locking Old Versions
1. Update `MIN_VERSION` in the server's `.env` file to the minimum acceptable version.
2. Restart the server. Older extensions will be rejected with a "Version too old" error.
