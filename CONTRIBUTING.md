# Contributing to KoalaSync

Thank you for your interest in contributing to KoalaSync! We welcome all contributions, from bug reports to new features.

## Development Workflow

### 1. Prerequisites
- Node.js (v18+)
- Docker (for local server testing)

### 2. Setup
1. Clone the repository.
2. Run `npm install` in the root directory to install build dependencies.
3. Run the build script to synchronize protocol constants and generate browser bundles:
   ```bash
   node scripts/build-extension.js
   ```

### 3. Testing Locally
1. Load `dist/chrome/` as an "Unpacked Extension" in Chrome (`chrome://extensions/` → Developer Mode → Load Unpacked).
2. For Firefox, load `dist/firefox/` via `about:debugging` → "Load Temporary Add-on".
3. Start the relay server: `docker-compose up --build`.
4. Use **two different browser profiles** (or Chrome + Firefox) to test multi-peer synchronization.
5. Use the extension's **Dev tab** to verify real-time video element metadata (`readyState`, `currentTime`, `paused`).

### 4. Protocol Synchronization
KoalaSync uses a "Single Source of Truth" for protocol constants in `shared/constants.js`. 
- **CRITICAL**: If you modify the constants, you MUST run the build script:
  ```bash
  node scripts/build-extension.js
  ```
  This will automatically synchronize the changes to the extension and generate the browser-specific bundles in the `dist/` folder.

### 5. Code Standards
- **Vanilla JS**: The extension must remain dependency-free. Do not add npm packages to the `extension/` directory.
- **Privacy**: Do not add external requests (CDNs, fonts, analytics, etc.).
- **Comments**: Maintain the existing documentation style, especially for complex sync logic.
- **Room IDs**: Room IDs are restricted to `[a-zA-Z0-9-]` (alphanumeric + hyphens only). Ensure any UI that generates room IDs follows this constraint.

### 6. Version Numbers
> [!IMPORTANT]
> **Do NOT manually bump version numbers.** The CI pipeline automatically injects the version from the git tag into `manifest.base.json`, `shared/constants.js`, and `package.json` during release builds. Manually changing version numbers in a PR will cause conflicts.

## Pull Request Process
1. Create a new branch for your feature or bugfix.
2. Ensure your code is tested locally (Chrome and Firefox).
   - For website changes: run `node website/build.js` and verify the output.
3. Update relevant documentation (e.g., `docs/ARCHITECTURE.md` if you change the protocol).
4. Submit your PR with a clear description of the changes.

## Bug Reports
When reporting a bug, please include:
- **Browser**: Chrome / Firefox / Edge + version number.
- **Extension Version**: Visible in the popup's Dev tab.
- **Dev Tab Output**: Copy the connection status, logs, and video debug info from the Dev tab.
- **Steps to Reproduce**: A clear sequence of actions that triggers the issue.

## Security
If you find a security vulnerability, please do not open a public issue. Instead, refer to our [SECURITY.md](SECURITY.md) for responsible disclosure instructions.
