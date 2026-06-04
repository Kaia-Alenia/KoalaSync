/**
 * KoalaSync Static Site Generator (i18n compiler)
 * Build pipeline: esbuild + AVIF + hashing + SVG min.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const esbuild = require('esbuild');
const { optimize: svgoOptimize } = require('svgo');

// CSS minifier: simple regex-based (proven, 27% reduction, no deps)
function minifyCSS(code) {
    return code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\s*([{}:;,])\s*/g, '$1')
        .replace(/\s+/g, ' ')
        .replace(/;\}/g, '}')
        .trim();
}
const MIN_AVIF_KB = 0;

function copyDirSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        entry.isDirectory() ? copyDirSync(s, d) : fs.copyFileSync(s, d);
    }
}

function sha8(buf) { return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8); }

async function minifyJS(raw) {
    const result = await esbuild.transform(raw, {
        loader: 'js',
        minify: true,
        target: 'es2020'
    });
    return result.code;
}

function injectAvifPictures(html) {
    return html.replace(/<img\b([^>]*)>/gi, (match, attrs) => {
        const srcMatch = attrs.match(/\bsrc="([^"]*)"/i);
        if (!srcMatch) return match;
        if (!/\.webp"$/i.test(srcMatch[0])) return match;
        const src = srcMatch[1];
        const avifSrc = src.replace(/\.webp$/i, '.avif');
        const srcsetMatch = attrs.match(/\bsrcset="([^"]*)"/i);
        if (srcsetMatch) {
            const avifSrcset = srcsetMatch[1].replace(/\.webp/gi, '.avif');
            return `<picture><source srcset="${avifSrcset}" type="image/avif"><img${attrs}></picture>`;
        }
        return `<picture><source srcset="${avifSrc}" type="image/avif"><img${attrs}></picture>`;
    });
}

function minifyInlineSvgs(html) {
    const svgRegex = /<svg\b[\s\S]*?<\/svg>/gi;
    return html.replace(svgRegex, (svg) => {
        try {
            const result = svgoOptimize(svg, { multipass: true, plugins: ['preset-default'] });
            return result.data;
        } catch { return svg; }
    });
}

async function compile() {
    console.log('Starting KoalaSync i18n compilation...');
    const websiteDir = __dirname;
    const wwwDir = path.join(websiteDir, 'www');
    fs.mkdirSync(wwwDir, { recursive: true });

    // ── 0. Auto-generate website logo sizes and sync favicons ──
    console.log('Generating responsive website logos...');
    const rawLogoSrc = path.join(websiteDir, '..', 'assets', 'icon', 'TwoPointZero_Logo_Icon_600.webp');
    const targetAssetsDir = path.join(websiteDir, 'assets');
    
    if (fs.existsSync(rawLogoSrc)) {
        fs.mkdirSync(targetAssetsDir, { recursive: true });
        
        // Generate NewLogoIcon_64.webp (64x64)
        await sharp(rawLogoSrc)
            .resize(64, 64)
            .toFile(path.join(targetAssetsDir, 'NewLogoIcon_64.webp'));
            
        // Generate NewLogoIcon_128.webp (128x128)
        await sharp(rawLogoSrc)
            .resize(128, 128)
            .toFile(path.join(targetAssetsDir, 'NewLogoIcon_128.webp'));
            
        // Generate NewLogoIcon.webp (256x256)
        await sharp(rawLogoSrc)
            .resize(256, 256)
            .toFile(path.join(targetAssetsDir, 'NewLogoIcon.webp'));
            
        console.log('  ✓ WebP logo variants successfully generated in website/assets/');
    } else {
        console.warn(`  ⚠️ Warning: Source logo ${rawLogoSrc} not found. Skipping auto-generation.`);
    }

    const pngMappings = [
        { src: 'TwoPointZero_Logo_Icon_16.png', dest: 'favicon-16x16.png' },
        { src: 'TwoPointZero_Logo_Icon_32.png', dest: 'favicon-32x32.png' },
        { src: 'TwoPointZero_Logo_Icon_256.png', dest: 'apple-touch-icon.png' },
        { src: 'TwoPointZero_Logo_Icon_256.png', dest: 'icon-192x192.png' }
    ];
    for (const mapping of pngMappings) {
        const srcPath = path.join(websiteDir, '..', 'assets', 'icon', mapping.src);
        const destPath = path.join(targetAssetsDir, mapping.dest);
        if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, destPath);
        } else {
            console.warn(`  ⚠️ Warning: Source PNG ${srcPath} not found.`);
        }
    }
    console.log('  ✓ Favicons/touch icons successfully synced to website/assets/');

    // ── 1. Minify CSS/JS (must happen first so hashes go into HTML) ──
    console.log('Minifying CSS/JS...');
    const styleRaw = fs.readFileSync(path.join(websiteDir, 'style.css'), 'utf8');
    const styleMin = minifyCSS(styleRaw);
    const styleHash = sha8(styleMin);
    const styleName = `style.${styleHash}.min.css`;

    const appRaw = fs.readFileSync(path.join(websiteDir, 'app.js'), 'utf8');
    const appMin = await minifyJS(appRaw);
    const appHash = sha8(appMin);
    const appName = `app.${appHash}.min.js`;

    const langRaw = fs.readFileSync(path.join(websiteDir, 'lang-init.js'), 'utf8');
    const langMin = await minifyJS(langRaw);
    const langHash = sha8(langMin);
    const langName = `lang-init.${langHash}.min.js`;

    const stylePct = ((1 - styleMin.length / styleRaw.length) * 100).toFixed(0);
    const appPct   = ((1 - appMin.length / appRaw.length) * 100).toFixed(0);
    const langPct  = ((1 - langMin.length / langRaw.length) * 100).toFixed(0);
    console.log(`  CSS: ${styleName} (${(styleMin.length/1024).toFixed(1)} KB, -${stylePct}%)`);
    console.log(`  App: ${appName} (${(appMin.length/1024).toFixed(1)} KB, -${appPct}%)`);
    console.log(`  Lang: ${langName} (${(langMin.length/1024).toFixed(1)} KB, -${langPct}%)`);

    // ── 2. Clean stale minified output ──
    for (const f of fs.readdirSync(wwwDir)) {
        if (/\.min\.(css|js)$/.test(f) || /\.(css|js)$/.test(f)) {
            const p = path.join(wwwDir, f);
            if (fs.statSync(p).isFile()) fs.unlinkSync(p);
        }
    }

    // Write minified files
    fs.writeFileSync(path.join(wwwDir, styleName), styleMin);
    fs.writeFileSync(path.join(wwwDir, appName), appMin);
    fs.writeFileSync(path.join(wwwDir, langName), langMin);

    // ── 3. Compile HTML templates ──
    const templatePath = path.join(websiteDir, 'template.html');
    if (!fs.existsSync(templatePath)) {
        console.error('Error: template.html not found!');
        process.exit(1);
    }
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    const localesDir = path.join(websiteDir, 'locales');
    const languages = ['en', 'de', 'fr', 'es', 'pt-BR', 'ru'];

    // Read version for build-time injection (SEO: crawlers see real version)
    const versionJson = JSON.parse(fs.readFileSync(path.join(websiteDir, 'version.json'), 'utf8'));
    const buildVersion = versionJson.version || '?';

    const englishHtml = {}; // track for join-page cross-ref

    function compilePage(locale, assetPath, lang) {
        let compiled = templateContent;
        compiled = compiled.replace(/\{\{ASSET_PATH\}\}/g, assetPath);
        compiled = compiled.replace(/\{\{VERSION\}\}/g, buildVersion);
        languages.forEach(l => {
            compiled = compiled.replace(new RegExp(`\\{\\{SELECTED_${l.toUpperCase()}\\}\\}`, 'g'), l === lang ? 'selected' : '');
        });
        for (const [key, value] of Object.entries(locale)) {
            compiled = compiled.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
        }
        return compiled;
    }

    for (const lang of languages) {
        const localePath = path.join(localesDir, `${lang}.json`);
        if (!fs.existsSync(localePath)) { console.warn(`Warning: Locale ${lang} not found.`); continue; }
        const locale = JSON.parse(fs.readFileSync(localePath, 'utf8'));

        if (lang === 'en') {
            console.log('Compiling English (index.html)...');
            const html = compilePage(locale, '', lang);
            fs.writeFileSync(path.join(wwwDir, 'index.html'), html);
            englishHtml[''] = html;
        } else {
            console.log(`Compiling ${lang.toUpperCase()} (${lang}/index.html)...`);
            const langDir = path.join(wwwDir, lang);
            fs.mkdirSync(langDir, { recursive: true });
            const html = compilePage(locale, '../', lang);
            fs.writeFileSync(path.join(langDir, 'index.html'), html);
            englishHtml[lang] = html;
        }
    }

    // ── 4. Copy static HTML files (join, impressum, datenschutz) ──
    console.log('Copying static pages...');
    const staticHtml = ['join.html', 'impressum.html', 'datenschutz.html'];
    for (const file of staticHtml) {
        const src = path.join(websiteDir, file);
        const dest = path.join(wwwDir, file);
        if (fs.existsSync(src)) { fs.copyFileSync(src, dest); console.log(`  Copied: ${file}`); }
    }

    // ── 5. Copy generic static files ──
    const genericFiles = ['robots.txt', 'sitemap.xml', 'site.webmanifest', 'version.json'];
    for (const file of genericFiles) {
        const src = path.join(websiteDir, file);
        const dest = path.join(wwwDir, file);
        if (fs.existsSync(src)) { fs.copyFileSync(src, dest); }
    }

    // ── 6. Copy assets ──
    console.log('Copying assets...');
    const srcAssets = path.join(websiteDir, 'assets');
    const destAssets = path.join(wwwDir, 'assets');
    if (fs.existsSync(srcAssets)) {
        copyDirSync(srcAssets, destAssets);
        console.log('  Assets copied.');
    }

    // ── 7. Convert all WebP to AVIF (quality 70) ──
    console.log('Converting WebP → AVIF...');
    let avifCount = 0;
    const webpFiles = fs.readdirSync(destAssets).filter(f => f.endsWith('.webp'));
    for (const f of webpFiles) {
        const src = path.join(destAssets, f);
        const stat = fs.statSync(src);
        if (stat.size < MIN_AVIF_KB * 1024) continue;
        const dest = path.join(destAssets, f.replace(/\.webp$/, '.avif'));
        if (fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= stat.mtimeMs) continue;
        await sharp(src).avif({ quality: 80, speed: 4 }).toFile(dest);
        avifCount++;
    }
    console.log(`  ${avifCount} AVIF files generated.`);

    // ── 8. Post-process ALL HTML files ──
    console.log('Post-processing HTML...');
    function walkHtml(dir, fn) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, entry.name);
            if (entry.isDirectory()) { walkHtml(p, fn); }
            else if (entry.name.endsWith('.html')) { fn(p); }
        }
    }

    walkHtml(wwwDir, (filePath) => {
        let html = fs.readFileSync(filePath, 'utf8');

        // 8a. Replace hashed asset refs
        html = html.replace(/href="(?:\.\.\/)?style\.min\.css"/g, (m) => {
            const prefix = m.includes('../') ? '../' : '';
            return `href="${prefix}${styleName}"`;
        });
        html = html.replace(/src="(?:\.\.\/)?app\.min\.js"/g, (m) => {
            const prefix = m.includes('../') ? '../' : '';
            return `src="${prefix}${appName}"`;
        });
        html = html.replace(/src="(?:\.\.\/)?lang-init\.min\.js"/g, (m) => {
            const prefix = m.includes('../') ? '../' : '';
            return `src="${prefix}${langName}"`;
        });
        // Also update preload directives
        html = html.replace(/href="(?:\.\.\/)?style\.min\.css"/g, (m) => {
            const prefix = m.includes('../') ? '../' : '';
            return `href="${prefix}${styleName}"`;
        });

        // 8b. Inject AVIF <picture> wrappers
        html = injectAvifPictures(html);

        // 8c. Minify inline SVGs
        html = minifyInlineSvgs(html);

        fs.writeFileSync(filePath, html);
    });

    console.log('KoalaSync build finished successfully! Output: website/www/');
}

compile().catch(err => { console.error('Build failed:', err); process.exit(1); });
