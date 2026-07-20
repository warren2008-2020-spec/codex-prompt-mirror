const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { summarizeSessions } = require('./parser');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PROMPT_MIRROR_PORT || 4318);
const APP_DIR = __dirname;
const STATIC_FILES = new Set([
  '/index.html',
  '/app.js',
  '/styles.css',
  '/demo.css',
  '/demo-a.html',
  '/demo-b.html',
]);

const SESSION_ROOTS = [
  path.join(process.env.USERPROFILE || 'C:\\Users\\Administrator', '.codex', 'sessions'),
  path.join(process.env.USERPROFILE || 'C:\\Users\\Administrator', '.codex', 'archived_sessions'),
];

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload, null, 2));
}

function serveStatic(requestPath, response) {
  const normalizedPath = requestPath === '/' ? '/index.html' : requestPath;
  if (!STATIC_FILES.has(normalizedPath)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const filePath = path.join(APP_DIR, normalizedPath.slice(1));
  const content = fs.readFileSync(filePath);
  response.writeHead(200, {
    'Content-Type': contentTypeFor(filePath),
    'Cache-Control': 'no-store',
  });
  response.end(content);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === '/api/summary') {
    try {
      const limit = Number(url.searchParams.get('limit') || 18);
      const summary = summarizeSessions(SESSION_ROOTS, limit);
      writeJson(response, 200, {
        roots: SESSION_ROOTS,
        ...summary,
      });
    } catch (error) {
      writeJson(response, 500, {
        error: 'Failed to read local Codex sessions.',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  serveStatic(url.pathname, response);
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Prompt Mirror running at http://${HOST}:${PORT}\n`);
});
