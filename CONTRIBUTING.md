# Contributing to KoalaSync

Thank you for your interest in contributing to KoalaSync! We welcome all contributions, from bug reports to new features.

## Development Workflow

### 1. Prerequisites
- Node.js (v18+)
- Docker (for local server testing)

### 2. Setup
1. Clone the repository.
2. Run `npm install` in the root directory to install build dependencies.

### 3. Protocol Synchronization
KoalaSync uses a "Single Source of Truth" for protocol constants in `shared/constants.js`. 
- **CRITICAL**: If you modify the constants, you MUST run the build script:
  ```bash
  node scripts/build-extension.js
  ```
  This will automatically synchronize the changes to the extension and generate the browser-specific bundles in the `dist/` folder.

### 4. Code Standards
- **Vanilla JS**: The extension must remain dependency-free. Do not add npm packages to the `extension/` directory.
- **Privacy**: Do not add external requests (CDNs, fonts, etc.).
- **Comments**: Maintain the existing documentation style, especially for complex sync logic.

## Pull Request Process
1. Create a new branch for your feature or bugfix.
2. Ensure your code is tested locally (Chrome and Firefox).
3. Update relevant documentation (e.g., `docs/ARCHITECTURE.md` if you change the protocol).
4. Submit your PR with a clear description of the changes.

## Security
If you find a security vulnerability, please do not open a public issue. Instead, refer to our `SECURITY.md` for disclosure instructions.
