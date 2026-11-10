import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const base = resolve(root);
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
await stat(base);
const server = createServer(async (req, res) => {
  try {
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end('Invalid request path'); return; }
    const file = resolve(base, `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(`${base}${sep}`)) { res.writeHead(403); res.end('Forbidden'); return; }
    const contents = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(contents);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') { res.writeHead(404); res.end('Not found'); }
    else { console.error('Request failed:', error); res.writeHead(500); res.end('Server error'); }
  }
});
server.on('error', error => { console.error('Server failed:', error); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Seattle Restaurant Watch: http://127.0.0.1:${port}`));
