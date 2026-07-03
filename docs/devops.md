# DevOps Release Workflow

This document describes the deployment and release process for KoalaSync.

## Tag-Based Releases

KoalaSync uses a fully automated release pipeline triggered by Git tags. 

> [!IMPORTANT]
> **DO NOT** manually bump the version numbers in any files (such as `package.json`, `manifest.base.json`, `shared/constants.js`, etc.) before creating a release. 
> Bumping versions manually is redundant, leads to conflicts, and is completely handled by the CI/CD pipeline.

### How it Works

When you push a Git tag matching `v*` (e.g., `v2.5.1`), the GitHub Actions release workflow (`.github/workflows/release.yml`) is triggered. The workflow performs the following actions:

1. **Extracts the version** from the tag (e.g., `2.5.1` from `v2.5.1`).
2. **Injects the version** automatically into the following files:
   - `extension/manifest.base.json`
   - `shared/constants.js` (updates `APP_VERSION`)
   - `package.json`
   - `website/version.json`
   - `website/template.html` (updates `softwareVersion` schema)
   - `README.md` (updates badge and announcement banner)
   - `website/sitemap.xml` (updates `lastmod` dates)
3. **Commits and pushes** these version updates back to the `main` branch automatically with the commit message `chore(release): update versions to vX.X.X [skip ci]`.
4. **Builds the extension** for both Chrome and Firefox and publishes the zipped archives.
5. **Builds the website** and uploads website artifacts.
6. **Builds and publishes** the Docker image for the relay server to the GitHub Container Registry (`ghcr.io`).

---

## Steps to Deploy a New Release

To release a new version (e.g., `v2.5.1`), follow these steps:

1. Make sure your local repository is synced on `main`:
   ```bash
   git checkout main
   git pull origin main
   ```
2. Create a local Git tag:
   ```bash
   git tag v2.5.1
   ```
3. Push the tag to GitHub:
   ```bash
   git push origin v2.5.1
   ```

The release pipeline will take care of the rest! You can monitor the progress under the **Actions** tab of the GitHub repository.
