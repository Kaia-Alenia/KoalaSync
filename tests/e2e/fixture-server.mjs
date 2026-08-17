#!/usr/bin/env node
/**
 * Static file server for the E2E fixtures. Local only, no directory listing,
 * paths are resolved and then checked to stay inside the fixture root.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const port = Number(process.argv[2] || 4173);

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mp4': 'video/mp4',
    '.json': 'application/json'
};

const server = http.createServer((req, res) => {
    const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (requested === '/redirect/hidden-player') {
        res.writeHead(302, {
            Location: `http://127.0.0.1:${port}/pages/frames/player-frame-2.html?redirected=hidden`,
            'Cache-Control': 'no-store'
        }).end();
        return;
    }
    const filePath = path.resolve(root, `.${requested}`);

    if (!filePath.startsWith(root + path.sep)) {
        res.writeHead(403).end('forbidden');
        return;
    }

    fs.stat(filePath, (statErr, stat) => {
        if (statErr || !stat.isFile()) {
            res.writeHead(404).end('not found');
            return;
        }

        const contentType = TYPES[path.extname(filePath)] || 'application/octet-stream';
        // Media needs byte ranges: without them Chromium reports an empty
        // seekable range and seeking silently does nothing, which would make
        // the remote-seek test fail for a reason that has nothing to do with
        // the extension.
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
        if (range) {
            const start = range[1] ? Number(range[1]) : 0;
            const end = range[2] ? Number(range[2]) : stat.size - 1;
            if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stat.size) {
                res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
                return;
            }
            res.writeHead(206, {
                'Content-Type': contentType,
                'Content-Length': end - start + 1,
                'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-store'
            });
            fs.createReadStream(filePath, { start, end }).pipe(res);
            return;
        }

        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stat.size,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-store'
        });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(port, '127.0.0.1', () => {
    console.log(`fixture server on http://localhost:${port}`);
});
