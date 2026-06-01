/**
 * KoalaSync Static Site Generator (i18n compiler)
 * Pure, dependency-free Node.js build pipeline.
 */

const fs = require('fs');
const path = require('path');

// Minify CSS: strips comments, collapses whitespace, removes trailing semicolons
function minifyCSS(code) {
    return code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\s*([{}:;,])\s*/g, '$1')
        .replace(/\s+/g, ' ')
        .replace(/;\}/g, '}')
        .trim();
}

// Minify JS: state-machine that tracks string context so
// // inside URLs (https://) inside strings is never mistaken for a comment.
function minifyJS(code) {
    var out = '';
    var inSingle = false, inDouble = false, inTemplate = false;
    var templateBrace = 0;
    var i = 0;

    while (i < code.length) {
        var ch = code[i];
        var next = code[i + 1] || '';

        // --- Escape handling (must come before string toggle) ---
        if (ch === '\\' && (inSingle || inDouble || inTemplate)) {
            out += ch + next;
            i += 2;
            continue;
        }

        // --- String toggle ---
        if (!inDouble && !inTemplate && ch === "'") { inSingle = !inSingle; out += ch; i++; continue; }
        if (!inSingle && !inTemplate && ch === '"') { inDouble = !inDouble; out += ch; i++; continue; }
        if (!inSingle && !inDouble) {
            if (ch === '`' && !inTemplate) { inTemplate = true; templateBrace = 0; out += ch; i++; continue; }
            if (inTemplate && ch === '`' && templateBrace === 0) { inTemplate = false; out += ch; i++; continue; }
        }

        // --- Template interpolation depth tracking ---
        if (inTemplate && !inSingle && !inDouble) {
            if (ch === '$' && next === '{') { templateBrace++; out += ch + next; i += 2; continue; }
            if (ch === '}' && templateBrace > 0) { templateBrace--; out += ch; i++; continue; }
        }

        // --- Inside a string / template literal → output as-is ---
        if (inSingle || inDouble || inTemplate) { out += ch; i++; continue; }

        // --- Outside strings: handle comments ---
        if (ch === '/' && next === '/') {
            while (i < code.length && code[i] !== '\n') i++;
            out += '\n';
            i++;
            continue;
        }
        if (ch === '/' && next === '*') {
            i += 2;
            while (i < code.length - 1) {
                if (code[i] === '*' && code[i + 1] === '/') { i += 2; break; }
                if (code[i] === '\n') out += '\n';
                i++;
            }
            continue;
        }

        out += ch;
        i++;
    }

    // Collapse horizontal whitespace (preserve newlines)
    return out
        .replace(/[^\S\n]+/g, ' ')
        .replace(/^ +/gm, '')
        .replace(/ +$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// Helper to recursively copy directories
function copyDirSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (let entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            // Binary assets (images, etc.) are copied as-is
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function compile() {
    console.log('Starting KoalaSync i18n compilation...');

    const websiteDir = __dirname;
    const wwwDir = path.join(websiteDir, 'www');

    // 1. Create build directories
    fs.mkdirSync(wwwDir, { recursive: true });

    // 2. Read template
    const templatePath = path.join(websiteDir, 'template.html');
    if (!fs.existsSync(templatePath)) {
        console.error('Error: template.html not found! Run from website/ directory or repo root.');
        process.exit(1);
    }
    const templateContent = fs.readFileSync(templatePath, 'utf8');

    const localesDir = path.join(websiteDir, 'locales');
    const languages = ['en', 'de', 'fr', 'es', 'pt-BR', 'ru'];

    // 3. Compile helper function
    function compilePage(locale, assetPath, lang) {
        let compiled = templateContent;

        // Inject asset path prefix first
        compiled = compiled.replace(/\{\{ASSET_PATH\}\}/g, assetPath);

        // Inject selected state for the dropdown
        languages.forEach(l => {
            const placeholder = `{{SELECTED_${l.toUpperCase()}}}`;
            compiled = compiled.replace(new RegExp(placeholder, 'g'), l === lang ? 'selected' : '');
        });

        // Inject all translations
        for (let [key, value] of Object.entries(locale)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            compiled = compiled.replace(regex, value);
        }

        return compiled;
    }

    // 4. Generate HTML files
    for (let lang of languages) {
        const localePath = path.join(localesDir, `${lang}.json`);
        if (!fs.existsSync(localePath)) {
            console.warn(`Warning: Locale file for ${lang} not found.`);
            continue;
        }
        const locale = JSON.parse(fs.readFileSync(localePath, 'utf8'));

        if (lang === 'en') {
            console.log('Compiling English version (index.html)...');
            const enHtml = compilePage(locale, '', lang);
            fs.writeFileSync(path.join(wwwDir, 'index.html'), enHtml, 'utf8');
        } else {
            console.log(`Compiling ${lang.toUpperCase()} version (${lang}/index.html)...`);
            const langDir = path.join(wwwDir, lang);
            fs.mkdirSync(langDir, { recursive: true });
            const langHtml = compilePage(locale, '../', lang);
            fs.writeFileSync(path.join(langDir, 'index.html'), langHtml, 'utf8');
        }
    }

    // 5. Clean stale minified output from previous builds
    const staleGlobs = ['style.css', 'style.min.css', 'app.js', 'app.min.js', 'lang-init.js', 'lang-init.min.js'];
    for (let f of staleGlobs) {
        const p = path.join(wwwDir, f);
        if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    // 6. Copy static assets
    console.log('Copying assets and static website files...');
    const staticFiles = [
        'style.css',
        'app.js',
        'lang-init.js',
        'robots.txt',
        'sitemap.xml',
        'version.json',
        'join.html',
        'impressum.html',
        'datenschutz.html'
    ];

    for (let file of staticFiles) {
        const srcPath = path.join(websiteDir, file);
        // Rename .css → .min.css and .js → .min.js in output
        const destName = file.endsWith('.css') ? file.replace(/\.css$/, '.min.css')
                     : file.endsWith('.js')  ? file.replace(/\.js$/, '.min.js')
                     : file;
        const destPath = path.join(wwwDir, destName);
        if (fs.existsSync(srcPath)) {
            if (file.endsWith('.css')) {
                const raw = fs.readFileSync(srcPath, 'utf8');
                const minified = minifyCSS(raw);
                fs.writeFileSync(destPath, minified, 'utf8');
                const saved = ((raw.length - minified.length) / raw.length * 100).toFixed(0);
                console.log(`Minified: ${file} → ${destName} (-${saved}%)`);
            } else if (file.endsWith('.js')) {
                const raw = fs.readFileSync(srcPath, 'utf8');
                const minified = minifyJS(raw);
                fs.writeFileSync(destPath, minified, 'utf8');
                const saved = ((raw.length - minified.length) / raw.length * 100).toFixed(0);
                console.log(`Minified: ${file} → ${destName} (-${saved}%)`);
            } else {
                fs.copyFileSync(srcPath, destPath);
                console.log(`Copied: ${file}`);
            }
        } else {
            console.warn(`Warning: Static file ${file} not found.`);
        }
    }

    // Copy assets folder recursively
    const srcAssets = path.join(websiteDir, 'assets');
    const destAssets = path.join(wwwDir, 'assets');
    if (fs.existsSync(srcAssets)) {
        copyDirSync(srcAssets, destAssets);
        console.log('Copied assets directory recursively.');
    } else {
        console.error('Error: assets/ directory not found in website/.');
    }

    console.log('KoalaSync compilation finished successfully! Output is in website/www/');
}

compile();
