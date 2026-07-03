const fs = require('fs');
const path = require('path');
const https = require('https');

const websiteDir = __dirname;
const sitemapPath = path.join(websiteDir, 'sitemap.xml');

// 1. Find the IndexNow key file in the website directory
const files = fs.readdirSync(websiteDir);
let keyFile = null;

for (const file of files) {
    const isIndexNowFile = (/^[a-zA-Z0-9_-]{8,}\.txt$/i.test(file) || /^[a-f0-9-]{32,36}$/i.test(file)) && file !== 'robots.txt';
    if (isIndexNowFile) {
        keyFile = file;
        break;
    }
}

if (!keyFile) {
    console.error('Error: Could not find any IndexNow key file in the website/ directory (e.g. <key>.txt or UUID file).');
    process.exit(1);
}

const keyFilePath = path.join(websiteDir, keyFile);
const keyContent = fs.readFileSync(keyFilePath, 'utf8').trim();

// The key is either the file contents or the filename itself (excluding .txt)
const key = keyContent || keyFile.replace(/\.txt$/i, '');
const keyLocation = `https://sync.koalastuff.net/${keyFile}`;

console.log(`Found IndexNow Key: ${key}`);
console.log(`Key Location: ${keyLocation}`);

// 2. Parse URLs from sitemap.xml
if (!fs.existsSync(sitemapPath)) {
    console.error(`Error: sitemap.xml not found at ${sitemapPath}`);
    process.exit(1);
}

const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
const urlRegex = /<loc>(https:\/\/sync\.koalastuff\.net[^<]+)<\/loc>/g;
const urls = [];
let match;

while ((match = urlRegex.exec(sitemapContent)) !== null) {
    urls.push(match[1]);
}

if (urls.length === 0) {
    console.error('Error: No URLs found in sitemap.xml matching https://sync.koalastuff.net');
    process.exit(1);
}

console.log(`Parsed ${urls.length} URLs from sitemap.xml.`);

// 3. Prepare IndexNow payload
const payload = JSON.stringify({
    host: 'sync.koalastuff.net',
    key: key,
    keyLocation: keyLocation,
    urlList: urls
});

// 4. Send request to IndexNow API
function submitIndexNow() {
    const options = {
        hostname: 'api.indexnow.org',
        port: 443,
        path: '/indexnow',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    console.log('Sending request to https://api.indexnow.org/indexnow...');
    const req = https.request(options, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
            responseBody += chunk;
        });

        res.on('end', () => {
            console.log(`Response Status: ${res.statusCode} ${res.statusMessage}`);
            if (res.statusCode === 200 || res.statusCode === 202) {
                console.log('Success! IndexNow has accepted the URLs for re-indexing.');
            } else {
                console.error(`IndexNow submission failed. Response body: ${responseBody}`);
                process.exit(1);
            }
        });
    });

    req.on('error', (e) => {
        console.error(`Request error: ${e.message}`);
        process.exit(1);
    });

    req.write(payload);
    req.end();
}

submitIndexNow();
