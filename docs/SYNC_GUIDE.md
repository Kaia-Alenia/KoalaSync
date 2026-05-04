# KoalaSync Protocol Synchronization Guide

## Why do we need to sync?
KoalaSync uses a "Single Source of Truth" for its communication protocol constants located in the root `shared/` directory. However, Chrome Extensions (Manifest V3) are strictly sandboxed and **cannot load or import files from outside their root directory**.

To ensure that the extension and the relay server are always using the exact same event names and protocol versions, we maintain a mirrored copy of the shared files within the `extension/shared/` folder.

## When should you run the build script?
You MUST run the build script in any of the following scenarios:
1. **After a fresh `git clone` or `git pull`** (as the synced files are ignored by git).
2. **After modifying** `shared/constants.js`.
3. **After modifying** `shared/blacklist.js`.
4. **Before committing** changes to the repository if any protocol-related files were touched.
5. **Before deploying** the server or releasing the extension.

## How to sync

Run the Node.js build script from the repository root:
```bash
node scripts/build-extension.js
```

## What does it do?
The build script performs the following actions:
1. Synchronizes protocol constants by copying `shared/constants.js` and `shared/blacklist.js` into `extension/shared/`.
2. Compiles browser-specific manifest files.
3. Packages the final ready-to-publish extension artifacts for Chrome and Firefox into the `dist/` directory.

## Protocol Versioning
As of v1.0.0-RC5, the system enforces a strict `protocolVersion` check during the `JOIN_ROOM` handshake. 
- The version is defined in `shared/constants.js`.
- If the extension and server versions mismatch, the server will reject the connection with an `Incompatible protocol version` error.
- **Always run the build script** after bumping the version number to ensure both components are updated.

> [!CAUTION]
> **NEVER** edit the files inside `extension/shared/` directly. They will be overwritten the next time the build script is run. Always edit the files in the root `shared/` directory and then run the build script.
