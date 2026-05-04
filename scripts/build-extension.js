const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const rootDir = path.join(__dirname, '..');
const extDir = path.join(rootDir, 'extension');
const distDir = path.join(rootDir, 'dist');
const baseManifestPath = path.join(extDir, 'manifest.base.json');

// Ensure dist directory exists
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Sync shared constants from root /shared to /extension/shared
console.log('Syncing protocol constants...');
const masterSharedDir = path.join(rootDir, 'shared');
const extSharedDir = path.join(extDir, 'shared');

if (!fs.existsSync(extSharedDir)) {
  fs.mkdirSync(extSharedDir, { recursive: true });
}

const sharedFiles = ['constants.js', 'blacklist.js'];
for (const file of sharedFiles) {
  const src = path.join(masterSharedDir, file);
  const dest = path.join(extSharedDir, file);
  if (!fs.existsSync(src)) {
    throw new Error(`CRITICAL: Source shared file missing: ${src}. Aborting build to prevent broken artifacts.`);
  }
  fs.copyFileSync(src, dest);
}
console.log('✓ constants.js and blacklist.js synced to extension/shared/');

// Read the base manifest
const baseManifest = JSON.parse(fs.readFileSync(baseManifestPath, 'utf8'));

// Helper to copy files, ignoring manifest.json and manifest.base.json
// Also injects shared constants into content.js
function copyExtensionFiles(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  
  // Read master constants for injection
  const masterConstantsPath = path.join(rootDir, 'shared', 'constants.js');
  const constantsContent = fs.readFileSync(masterConstantsPath, 'utf8');
  
  // Extract the EVENTS object using regex
  const eventsMatch = constantsContent.match(/export const EVENTS = ({[\s\S]+?});/);
  if (!eventsMatch) {
    throw new Error('CRITICAL: Could not find EVENTS object in shared/constants.js');
  }
  const eventsObject = eventsMatch[1];
  
  const items = fs.readdirSync(extDir);
  for (const item of items) {
    if (item === 'manifest.json' || item === 'manifest.base.json') continue;
    
    const srcPath = path.join(extDir, item);
    const destPath = path.join(targetDir, item);
    
    if (fs.lstatSync(srcPath).isDirectory()) {
      fs.cpSync(srcPath, destPath, { recursive: true });
    } else {
      if (item === 'content.js') {
        // Perform injection
        let content = fs.readFileSync(srcPath, 'utf8');
        const startMarker = '// --- SHARED_EVENTS_INJECT_START ---';
        const endMarker = '// --- SHARED_EVENTS_INJECT_END ---';
        
        const pattern = new RegExp(`${startMarker}[\\s\\S]+?${endMarker}`);
        const replacement = `${startMarker}\n    // This block is automatically updated by /scripts/build-extension.js\n    const EVENTS = ${eventsObject};\n    ${endMarker}`;
        
        if (pattern.test(content)) {
          content = content.replace(pattern, replacement);
          fs.writeFileSync(destPath, content);
          console.log('✓ Injected shared events into content.js');
        } else {
          console.warn('⚠️ WARNING: Markers not found in content.js, skipping injection.');
          fs.copyFileSync(srcPath, destPath);
        }
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

// Helper to zip a directory
function zipDirectory(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = fs.createWriteStream(outPath);

    archive
      .directory(sourceDir, false)
      .on('error', err => reject(err))
      .pipe(stream);

    stream.on('close', () => resolve());
    archive.finalize();
  });
}

async function buildBrowser(browserName, manifestModifier) {
  console.log(`Building for ${browserName}...`);
  const browserDistDir = path.join(distDir, browserName);
  
  // 1. Copy files
  copyExtensionFiles(browserDistDir);
  
  // 2. Modify and write manifest
  const browserManifest = manifestModifier(JSON.parse(JSON.stringify(baseManifest)));
  fs.writeFileSync(
    path.join(browserDistDir, 'manifest.json'),
    JSON.stringify(browserManifest, null, 2)
  );

  // 3. Zip it
  const zipPath = path.join(distDir, `koalasync-${browserName}.zip`);
  await zipDirectory(browserDistDir, zipPath);
  console.log(`Successfully built and zipped ${browserName} -> ${zipPath}`);
}

async function run() {
  try {
    // Build Chrome
    await buildBrowser('chrome', (manifest) => {
      manifest.background = {
        service_worker: "background.js",
        type: "module"
      };
      return manifest;
    });

    // Build Firefox
    await buildBrowser('firefox', (manifest) => {
      manifest.background = {
        scripts: ["background.js"],
        type: "module"
      };
      manifest.browser_specific_settings = {
        gecko: {
          id: "koalasync@shik3i.net"
        }
      };
      return manifest;
    });

    console.log('Build complete!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

run();
