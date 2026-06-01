# Contributing to KoalaSync

Thanks for your interest in improving KoalaSync. All contributions are welcome — from bug reports and translations to core protocol changes.

---

## Ways to Contribute

| Area | Description |
|------|-------------|
| **Bug Reports** | Found a bug? Open an issue with repro steps (see template below). |
| **Code** | Fix bugs, add features, or improve the extension / server / website. |
| **Translations** | Help localize the extension and website into more languages. See [TRANSLATION.md](website/TRANSLATION.md). |
| **Documentation** | Improve docs, fix typos, or add missing examples. |
| **Security** | Found a vulnerability? See [SECURITY.md](SECURITY.md) — do NOT open a public issue. |

---

## Development Setup

### Prerequisites

- **Node.js** v18+
- **Docker** (for local relay server testing)

### Quick Start

```bash
git clone https://github.com/Shik3i/KoalaSync.git
cd KoalaSync
npm install
node scripts/build-extension.js
```

---

## Project Structure

| Directory | Purpose |
|-----------|---------|
| `extension/` | Browser extension (Manifest V3, Chrome & Firefox) |
| `server/` | Node.js + Socket.IO relay server (Dockerized) |
| `website/` | Landing page, invitation bridge, and marketing site |
| `shared/` | Protocol constants — single source of truth |
| `scripts/` | Build and sync utilities |
| `docs/` | Architecture, sync protocol, and deep-dive guides |

---

## Testing Locally

### Extension

1. Load `dist/chrome/` as an unpacked extension in Chrome (`chrome://extensions/` → Developer Mode → **Load unpacked**).
2. For Firefox: load `dist/firefox/` via `about:debugging` → **Load Temporary Add-on**.
3. Start the relay server: `docker compose up --build`.
4. Use **two different browser profiles** (or Chrome + Firefox) to test multi-peer sync.
5. Use the extension's **Dev tab** to inspect real-time video element state (`readyState`, `currentTime`, `paused`).

### Website

```bash
node website/build.js           # Compile static site → www/
python3 -m http.server 8080 -d website/www  # Serve locally
```

Then open `http://localhost:8080`. For multi-language testing: `http://localhost:8080/de/`.

---

## Protocol Constants

KoalaSync uses a **single source of truth** for all protocol constants in `shared/constants.js`.

> [!IMPORTANT]
> After modifying `shared/constants.js`, you **must** run the build script to sync changes to the extension:
> ```bash
> node scripts/build-extension.js
> ```
> This automatically injects constants into `content.js` and regenerates browser bundles in `dist/`.

---

## Code Standards

- **Vanilla JS**: The extension must remain dependency-free. No npm packages in `extension/`.
- **Privacy-first**: Zero external requests — no CDNs, fonts, analytics, or trackers. All assets self-hosted.
- **System font stack**: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ...` — never `@import` external fonts.
- **Room IDs**: Restricted to `[a-zA-Z0-9-]` (alphanumeric + hyphens only). Enforced server-side.
- **Comments**: Document complex sync logic. The codebase uses inline comments for protocol reasoning.

---

## Version Numbers

> [!CAUTION]
> **Never manually bump version numbers.** The CI pipeline injects the version from the git tag into `manifest.base.json`, `shared/constants.js`, and `package.json` during release builds. Manual bumps cause conflicts.

---

## Pull Request Process

1. **Branch** from `main` for your feature or fix.
2. **Test locally** on both Chrome and Firefox.
3. **Website changes**: Run `node website/build.js` and verify the compiled output in `www/`.
4. **Lint**: Ensure `npm run lint` passes with zero errors and zero warnings.
5. **Syntax**: Run `node -c` on every modified `.js` file.
6. **Protocol changes**: Update relevant documentation in `docs/`.
7. **Submit your PR** with a clear description and linked issue (if applicable).

---

## Bug Report Template

When filing a bug, include as much of the following as possible:

| Field | Example |
|-------|---------|
| **Browser** | Chrome 125, Firefox 128 |
| **Extension Version** | v1.9.3 (visible in Dev tab) |
| **Dev Tab Output** | Connection status, video debug info, log entries |
| **Steps to Reproduce** | 1. Create room → 2. Join from second browser → 3. Play video |
| **Expected Behavior** | Both peers play simultaneously |
| **Actual Behavior** | Peer B remains paused |

---

## Translation Contributions

KoalaSync supports 6 languages: English, German, French, Spanish, Portuguese (Brazilian), and Russian.

To add or improve translations:
1. Edit the locale files in `website/locales/` (for the website).
2. For extension translations, see [TRANSLATION.md](website/TRANSLATION.md).
3. Run `node website/build.js` to regenerate the static site.

---

## Security

If you discover a security vulnerability, **do not open a public issue**. Report it privately as described in [SECURITY.md](SECURITY.md).
