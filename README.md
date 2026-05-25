# <img src="extension/icons/icon128.png" width="32" valign="middle"> KoalaSync

<p align="center">
  <a href="https://github.com/Shik3i/KoalaSync/actions/workflows/release.yml"><img src="https://github.com/Shik3i/KoalaSync/actions/workflows/release.yml/badge.svg" alt="Release Status"></a>
  <a href="https://github.com/Shik3i/KoalaSync/releases"><img src="https://img.shields.io/github/v/release/Shik3i/KoalaSync" alt="GitHub release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Shik3i/KoalaSync?color=blue" alt="License"></a>
  <a href="https://addons.mozilla.org/de/firefox/addon/koalasync/"><img src="https://img.shields.io/badge/Firefox-Download-orange?logo=firefoxbrowser&logoColor=white" alt="Firefox Add-on"></a>
  <a href="https://chromewebstore.google.com/detail/koalasync/obbnmkmlaaddodakcbdljknjpagklifc"><img src="https://img.shields.io/badge/Chrome-Download-blue?logo=googlechrome&logoColor=white" alt="Chrome Extension"></a>
</p>

KoalaSync is a lightweight Browser Extension and Relay Server for synchronized video playback across any website—YouTube, Twitch, and custom HTML5 players. Built with a focus on **Data Sovereignty** and **Performance**.

### 🌟 Why KoalaSync?

*   **🛡️ Security-First**: Volatile RAM-based relay with built-in brute-force protection and zero-persistence architecture.
*   **📡 Direct Logic**: Manual Socket.IO wire implementation for reliable synchronization.
*   **🛠️ Clean Build**: Dependency-free extension runtime with no library overhead.
*   **🌐 Universal**: Works on any website with a `<video>` tag.

---

### ✨ Key Features

- **Global Synchronization**: Synchronize Play, Pause, and Seeking on any website with a `<video>` tag.
- **Episode Auto-Sync**: Perfectly sync series binges. All peers wait until everyone has loaded the next episode before starting together.
- **Smart Matching**: Automatically highlights tabs containing matching video titles.
- **Dual Heartbeat Architecture**: Robust session tracking that prevents ghost rooms and stale connections.
- **Efficient Relay**: Minimal overhead WebSocket message forwarding.
- **Seamless Invitations**: Smart links that automatically configure server and room credentials for your friends.

---

### 📂 Repository Structure

- `extension/`: Browser Extension (Chrome & Firefox).
- `server/`: Node.js + Socket.IO Relay Server (Containerized).
- `website/`: Marketing landing page & Invitation Bridge.
- `shared/`: **Single Source of Truth** for protocol constants.
- `scripts/`: Automated build and synchronization utilities.
- `docs/`: Technical deep-dives ([Architecture](docs/ARCHITECTURE.md), [Sync Guide](docs/SYNC_GUIDE.md)).

---

### 🚀 Quick Start

#### For Users (Installation)
The easiest way to install KoalaSync is to download the pre-compiled version from the [Releases](https://github.com/Shik3i/KoalaSync/releases) page.
1. Download the latest `koalasync-chrome.zip` or `koalasync-firefox.zip`.
2. Extract the file and load it as an "Unpacked Extension" in your browser's Developer Mode.

#### For Developers (Building)
To build the extension from source and synchronize protocol constants:
```bash
npm install
node scripts/build-extension.js
```
The compiled artifacts will be available in the `dist/` directory.

#### For Self-Hosting (Docker)
Deploy your own private relay server using our official image:
```bash
# Pull the latest image
docker pull ghcr.io/shik3i/koalasync:latest

# Or use our example compose file
cp docker-compose.example.yml docker-compose.yml
docker-compose up -d
```
The server will be available at `ws://localhost:3000`. See [docker-compose.example.yml](docker-compose.example.yml) for advanced configuration.

To connect your extension to a self-hosted server, open the popup → **Room** tab → select **Custom Server** → enter your server's WebSocket URL (e.g., `ws://localhost:3000`).

> **⚠️ Note**: `ws://` only works for `localhost`. If you deploy to a real domain, you **must** use `wss://` (e.g., `wss://sync.yourdomain.com`). This requires a TLS-terminating reverse proxy (e.g., Caddy, Nginx, or Traefik) in front of the relay server. See [Caddyfile.example](Caddyfile.example) for a production-ready template.

---

### 📖 Documentation & Links

- **[PRIVACY.md](PRIVACY.md)**: Data Handling and Privacy Policy.
- **[CONTRIBUTING.md](CONTRIBUTING.md)**: How to help make KoalaSync better.
- **[HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md)**: Step-by-step walkthrough of the complete user flow.
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)**: Deep-dive into the two-phase sync and heartbeat logic.
- **[SECURITY.md](SECURITY.md)**: Disclosure policy and security practices.
- **[Caddyfile.example](Caddyfile.example)**: Production Caddy configuration for website and relay.

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/Shik3i">Shik3i</a>. KoalaSync is Open Source under the <a href="LICENSE">MIT License</a>.</sub>
</div>
