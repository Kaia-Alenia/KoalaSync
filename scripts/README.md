# Development Scripts

This directory contains utility scripts for the KoalaSync development workflow.

## build-extension.js

The primary build tool for KoalaSync. This Node.js script automates two critical tasks:

1.  **Protocol Synchronization**: Copies the "Single Source of Truth" constants (`shared/constants.js`) and the domain blacklist (`shared/blacklist.js`) from the root `/shared` directory into the `extension/shared/` directory.
2.  **Content Script Injection**: Injects protocol constants directly into `content.js` using marker-based replacement. This is necessary because `content.js` executes synchronously and cannot use ES module imports.
3.  **Artifact Generation**: Compiles the extension into browser-specific bundles for Chrome and Firefox, located in the `dist/` directory.

### Usage

From the **repository root**, run:

```bash
node scripts/build-extension.js
```

### Why this script exists
KoalaSync uses **Vanilla JS** in the extension to maintain zero runtime dependencies and maximum privacy. Since we don't use a bundler (like Webpack or Vite) inside the extension, this script serves as our lightweight "pre-build" step to ensure that the protocol constants remain synchronized between the extension and the relay server.

### Content Injection Markers

The build script uses marker comments in `content.js` to locate and replace constant blocks:

| Marker Pair | Injected Value | Source |
|:---|:---|:---|
| `SHARED_EVENTS_INJECT_START` / `END` | The full `EVENTS` object | `shared/constants.js` |
| `SHARED_HEARTBEAT_INJECT_START` / `END` | `HEARTBEAT_INTERVAL` value | `shared/constants.js` |

> **⚠️ Do NOT remove or modify these marker comments in `content.js`.** They are required for the build script to function. If the markers are missing, the build will fail with a clear error message.
