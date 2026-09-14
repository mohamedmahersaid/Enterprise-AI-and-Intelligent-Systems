#!/usr/bin/env node
// Serve the built site locally, with no dependencies.
//
// Opening site/index.html directly from the filesystem does not work: the
// search index is fetched, and file:// requests are blocked by CORS. This
// serves over http so the page behaves exactly as it will on Pages.

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve('site');
const PORT = Number(process.env.PORT || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

if (!existsSync(ROOT)) {
  console.error('site/ does not exist. Run "npm run build:site" first.');
  process.exit(1);
}

const server = createServer((request, response) => {
  const requested = decodeURIComponent((request.url || '/').split('?')[0]);
  let target = normalize(join(ROOT, requested));

  // Never serve outside the build directory, whatever the request path claims.
  if (!target.startsWith(ROOT)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.html');
  if (!existsSync(target)) {
    response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<h1>404</h1><p><a href="/">Back to the curriculum</a></p>');
    return;
  }

  response.writeHead(200, {
    'content-type': TYPES[extname(target)] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  response.end(readFileSync(target));
});

server.listen(PORT, () => {
  console.log(`Serving ${ROOT} at http://localhost:${PORT}/`);
  console.log('Press Ctrl+C to stop.');
});
