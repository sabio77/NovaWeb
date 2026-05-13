'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 5173);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp'
};

function safeFilePath(urlPath) {
  const clean = decodeURIComponent(String(urlPath || '/').split('?')[0]);
  const relative = clean === '/' ? '/index.html' : clean;
  const target = path.resolve(root, `.${relative}`);
  if (!target.startsWith(root)) return null;
  return target;
}

const server = http.createServer((req, res) => {
  const target = safeFilePath(req.url);
  if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Archivo no encontrado.');
    return;
  }
  const type = contentTypes[path.extname(target)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  fs.createReadStream(target).pipe(res);
});

server.listen(port, () => {
  console.log(`Nova IA Nube Web disponible en http://localhost:${port}`);
});
