// Versione locale: `npm start`, poi apri http://localhost:8080. Dati salvati in data/db.json.
import http from 'node:http';
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, authorized, unauthorized } from './core.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Carica .env senza dipendenze esterne.
if (existsSync(path.join(ROOT, '.env'))) {
  for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const env = process.env;
const PORT = Number(env.PORT || 8080);
const DB_FILE = env.DATA_FILE || path.join(ROOT, 'data', 'db.json');

let writing = Promise.resolve();
const store = {
  get: async () => { try { return JSON.parse(await fs.readFile(DB_FILE, 'utf8')); } catch { return null; } },
  put: (db) => (writing = writing.then(async () => {
    await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
    await fs.writeFile(DB_FILE + '.tmp', JSON.stringify(db, null, 2));
    await fs.rename(DB_FILE + '.tmp', DB_FILE);
  })),
};
const app = createApp({ store, env });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const PUBLIC = path.join(ROOT, 'public');

async function toRequest(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
}

async function send(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

http.createServer(async (req, res) => {
  try {
    const request = await toRequest(req);
    if (!authorized(request, env)) return send(res, unauthorized());
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) return send(res, await app.handleApi(request));
    const file = path.join(PUBLIC, path.normalize(pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    const data = await fs.readFile(file).catch(() => null);
    if (!data) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch (e) { console.error(e); res.writeHead(500); res.end(e.message); }
}).listen(PORT, () => {
  console.log(`Offerte Videogames su http://localhost:${PORT} ${env.EBAY_CLIENT_ID ? '(eBay.it attivo)' : '(modalità DEMO: manca la chiave eBay)'}`);
});

const minutes = Number(env.SCAN_MINUTES || 60);
setInterval(() => app.scanAll().catch(console.error), minutes * 60_000);
app.scanAll().catch(console.error);
