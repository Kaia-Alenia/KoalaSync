const fs = require('fs');
const path = require('path');

const sitemapPath = path.join(__dirname, '../website/sitemap.xml');

const languages = [
  { code: 'en', prefix: '', hreflang: 'en' },
  { code: 'de', prefix: 'de/', hreflang: 'de' },
  { code: 'fr', prefix: 'fr/', hreflang: 'fr' },
  { code: 'es', prefix: 'es/', hreflang: 'es' },
  { code: 'pt-BR', prefix: 'pt-BR/', hreflang: 'pt-br' },
  { code: 'ru', prefix: 'ru/', hreflang: 'ru' },
  { code: 'it', prefix: 'it/', hreflang: 'it' },
  { code: 'pl', prefix: 'pl/', hreflang: 'pl' },
  { code: 'tr', prefix: 'tr/', hreflang: 'tr' },
  { code: 'nl', prefix: 'nl/', hreflang: 'nl' },
  { code: 'ja', prefix: 'ja/', hreflang: 'ja' },
  { code: 'ko', prefix: 'ko/', hreflang: 'ko' },
  { code: 'zh', prefix: 'zh/', hreflang: 'zh' },
  { code: 'uk', prefix: 'uk/', hreflang: 'uk' },
  { code: 'pt', prefix: 'pt/', hreflang: 'pt' }
];

const today = new Date().toISOString().split('T')[0];

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">`;

// 1. Static Legal pages
// Imprint
xml += `
  <url>
    <loc>https://sync.koalastuff.net/imprint</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>`;
xml += `
  <url>
    <loc>https://sync.koalastuff.net/privacy</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>`;
xml += `
  <url>
    <loc>https://sync.koalastuff.net/de/impressum</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>`;
xml += `
  <url>
    <loc>https://sync.koalastuff.net/de/datenschutz</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>`;

// Helper function to build localized urls for a relative path
function addPage(relativePath, changefreq, priority) {
  for (const lang of languages) {
    const loc = `https://sync.koalastuff.net/${lang.prefix}${relativePath}`;
    xml += `
  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>`;
    for (const alt of languages) {
      const altHref = `https://sync.koalastuff.net/${alt.prefix}${relativePath}`;
      xml += `
    <xhtml:link rel="alternate" hreflang="${alt.hreflang}" href="${altHref}"/>`;
    }
    // Add x-default
    const defaultHref = `https://sync.koalastuff.net/${relativePath}`;
    xml += `
    <xhtml:link rel="alternate" hreflang="x-default" href="${defaultHref}"/>
  </url>`;
  }
}

// 2. Landing Pages
// For landing page, relative path is ''
addPage('', 'weekly', '1.0');

// 3. Alternatives Hub
addPage('alternatives', 'weekly', '0.7');

// 4. Alternatives Sub-pages
const subpages = [
  'alternatives/teleparty',
  'alternatives/screen-sharing',
  'alternatives/watch2gether',
  'alternatives/scener',
  'alternatives/kosmi',
  'alternatives/twoseven'
];
for (const sub of subpages) {
  addPage(sub, 'weekly', '0.7');
}

xml += `
</urlset>
`;

fs.writeFileSync(sitemapPath, xml.trim() + '\n', 'utf8');
console.log('Successfully generated sitemap.xml!');
