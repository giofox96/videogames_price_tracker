import http from 'node:http';
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PLATFORMS } from './sources/platforms.js';
import { ebayConfigured, searchEbay } from './sources/ebay.js';
import { pricechartingConfigured, referencePrice } from './sources/pricecharting.js';
import { demoResults } from './sources/demo.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Carica .env senza dipendenze esterne.
if (existsSync(path.join(ROOT, '.env'))) {
  for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.PORT || 8080);
const SCAN_MINUTES = Number(process.env.SCAN_MINUTES || 60);
const DB_FILE = process.env.DATA_FILE || path.join(ROOT, 'data', 'db.json');
const DEMO = !ebayConfigured();

// ---------- archivio su file JSON ----------
let db = { wishlist: [], results: {}, seen: {}, alerts: [], lastScan: null, errors: [] };
try { db = { ...db, ...JSON.parse(await fs.readFile(DB_FILE, 'utf8')) }; } catch {}
let saving = Promise.resolve();
const save = () => (saving = saving.then(() => fs.mkdir(path.dirname(DB_FILE), { recursive: true })
  .then(() => fs.writeFile(DB_FILE + '.tmp', JSON.stringify(db, null, 2)))
  .then(() => fs.rename(DB_FILE + '.tmp', DB_FILE))));

// ---------- avvisi ----------
async function notifyTelegram(text) {
  const { TELEGRAM_BOT_TOKEN: t, TELEGRAM_CHAT_ID: chat } = process.env;
  if (!t || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: false }),
    });
  } catch (e) { console.error('Telegram:', e.message); }
}

// ---------- ricerca ----------
async function scanItem(item) {
  const offers = DEMO ? demoResults(item) : await searchEbay(item);
  offers.sort((a, b) => a.total - b.total);
  const reference = await referencePrice(item).catch(() => null);
  db.results[item.id] = { scannedAt: new Date().toISOString(), offers, reference };
  db.lastScan = db.results[item.id].scannedAt;

  const seen = new Set(db.seen[item.id] || []);
  for (const o of offers) {
    const isNew = !seen.has(o.id);
    seen.add(o.id);
    if (isNew && item.maxPrice && o.total <= item.maxPrice) {
      const alert = { id: crypto.randomUUID(), itemId: item.id, offerId: o.id, at: new Date().toISOString(), read: false,
        text: `${item.name} (${PLATFORMS[item.platform].label}) a ${o.total.toFixed(2)} € su ${o.source}`, url: o.url };
      db.alerts.unshift(alert);
      if (!o.demo) await notifyTelegram(`🎮 ${alert.text}\n${o.url}`);
    }
  }
  db.seen[item.id] = [...seen].slice(-1000);
  db.alerts = db.alerts.slice(0, 200);
}

let scanning = false;
async function scanAll() {
  if (scanning) return;
  scanning = true;
  db.errors = [];
  for (const item of db.wishlist) {
    try { await scanItem(item); } catch (e) {
      console.error(`Errore su ${item.name}:`, e.message);
      db.errors.push({ itemId: item.id, message: e.message, at: new Date().toISOString() });
    }
  }
  db.lastScan = new Date().toISOString();
  scanning = false;
  await save();
}

// ---------- API ----------
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((ok, ko) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { ko(e); } }); });

function cleanItem(b, prev = {}) {
  const name = String(b.name ?? prev.name ?? '').trim().slice(0, 120);
  const platform = String(b.platform ?? prev.platform ?? '').toUpperCase();
  const condition = ['NEW', 'USED', 'ANY'].includes(b.condition) ? b.condition : prev.condition || 'ANY';
  const raw = 'maxPrice' in b ? b.maxPrice : prev.maxPrice;
  const maxPrice = raw === '' || raw == null ? null : Number(raw);
  if (!name || !PLATFORMS[platform] || Number.isNaN(maxPrice) || maxPrice < 0) return null;
  return { id: prev.id || crypto.randomUUID(), name, platform, condition, maxPrice, addedAt: prev.addedAt || new Date().toISOString() };
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  if (req.method === 'GET' && parts[1] === 'state') {
    return json(res, 200, {
      wishlist: db.wishlist, results: db.results, alerts: db.alerts, lastScan: db.lastScan, errors: db.errors, scanning,
      config: { demo: DEMO, pricecharting: pricechartingConfigured(), telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN), scanMinutes: SCAN_MINUTES },
    });
  }
  if (parts[1] === 'wishlist') {
    if (req.method === 'POST') {
      const item = cleanItem(await readBody(req));
      if (!item) return json(res, 400, { error: 'Nome, piattaforma (PS4/PS5/SWITCH) e prezzo valido sono obbligatori' });
      db.wishlist.push(item); await save();
      scanItem(item).then(save).catch((e) => console.error(e.message));
      return json(res, 201, item);
    }
    const idx = db.wishlist.findIndex((w) => w.id === parts[2]);
    if (idx < 0) return json(res, 404, { error: 'Gioco non trovato' });
    if (req.method === 'PUT') {
      const item = cleanItem(await readBody(req), db.wishlist[idx]);
      if (!item) return json(res, 400, { error: 'Dati non validi' });
      db.wishlist[idx] = item; await save();
      return json(res, 200, item);
    }
    if (req.method === 'DELETE') {
      const [removed] = db.wishlist.splice(idx, 1);
      delete db.results[removed.id]; delete db.seen[removed.id];
      db.alerts = db.alerts.filter((a) => a.itemId !== removed.id);
      await save();
      return json(res, 200, { ok: true });
    }
  }
  if (req.method === 'POST' && parts[1] === 'scan') { await scanAll(); return json(res, 200, { ok: true, lastScan: db.lastScan }); }
  if (req.method === 'POST' && parts[1] === 'alerts' && parts[2] === 'read') {
    db.alerts.forEach((a) => (a.read = true)); await save(); return json(res, 200, { ok: true });
  }
  json(res, 404, { error: 'Not found' });
}

// ---------- file statici (PWA) ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
async function serveStatic(res, pathname) {
  const file = path.join(ROOT, 'public', path.normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(path.join(ROOT, 'public'))) { res.writeHead(403); return res.end(); }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}

// Password facoltativa (consigliata online): APP_PASSWORD nel .env, utente qualsiasi.
function authorized(req) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return true;
  const [, b64] = (req.headers.authorization || '').split(' ');
  const given = Buffer.from(b64 || '', 'base64').toString().split(':').slice(1).join(':');
  const a = Buffer.from(given), b = Buffer.from(pw);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!authorized(req)) { res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Offerte Giochi"' }); return res.end('Password richiesta'); }
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return await serveStatic(res, url.pathname);
  } catch (e) { console.error(e); json(res, 500, { error: e.message }); }
}).listen(PORT, () => {
  console.log(`Offerte Videogames su http://localhost:${PORT} ${DEMO ? '(modalità DEMO: manca la chiave eBay)' : '(eBay.it attivo)'}`);
});

setInterval(scanAll, SCAN_MINUTES * 60_000);
if (db.wishlist.length) scanAll();
