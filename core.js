// Logica dell'app condivisa tra il server locale (server.js) e Cloudflare Workers (worker.js).
// `store` sa leggere e scrivere lo stato; `env` contiene chiavi e impostazioni.
import { PLATFORMS } from './sources/platforms.js';
import { ebayConfigured, searchEbay } from './sources/ebay.js';
import { pricechartingConfigured, referencePrice } from './sources/pricecharting.js';
import { demoResults } from './sources/demo.js';

const EMPTY = () => ({ wishlist: [], results: {}, seen: {}, alerts: [], lastScan: null, errors: [] });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

export function createApp({ store, env, background = (p) => p.catch((e) => console.error(e)) }) {
  const demo = !ebayConfigured(env);
  const load = async () => ({ ...EMPTY(), ...((await store.get()) || {}) });

  async function notifyTelegram(text) {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
    try {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
      });
    } catch (e) { console.error('Telegram:', e.message); }
  }

  async function scanItem(db, item) {
    const offers = demo ? demoResults(item) : await searchEbay(item, env);
    offers.sort((a, b) => a.total - b.total);
    const reference = await referencePrice(item, env).catch(() => null);
    db.results[item.id] = { scannedAt: new Date().toISOString(), offers, reference };
    db.lastScan = db.results[item.id].scannedAt;

    const seen = new Set(db.seen[item.id] || []);
    for (const o of offers) {
      const isNew = !seen.has(o.id);
      seen.add(o.id);
      if (isNew && item.maxPrice != null && o.total <= item.maxPrice) {
        const alert = { id: crypto.randomUUID(), itemId: item.id, offerId: o.id, at: new Date().toISOString(), read: false,
          text: `${item.name} (${PLATFORMS[item.platform].label}) a ${o.total.toFixed(2)} € su ${o.source}`, url: o.url };
        db.alerts.unshift(alert);
        if (!o.demo) await notifyTelegram(`🎮 ${alert.text}\n${o.url}`);
      }
    }
    db.seen[item.id] = [...seen].slice(-500);
    db.alerts = db.alerts.slice(0, 200);
  }

  async function scanAll() {
    const db = await load();
    db.errors = [];
    for (const item of db.wishlist) {
      try { await scanItem(db, item); } catch (e) {
        console.error(`Errore su ${item.name}:`, e.message);
        db.errors.push({ itemId: item.id, message: e.message, at: new Date().toISOString() });
      }
    }
    db.lastScan = new Date().toISOString();
    await store.put(db);
    return db;
  }

  async function scanOne(id) {
    const db = await load();
    const item = db.wishlist.find((w) => w.id === id);
    if (!item) return;
    await scanItem(db, item);
    // Ricarica prima di salvare per non perdere modifiche fatte nel frattempo.
    const fresh = await load();
    if (!fresh.wishlist.some((w) => w.id === id)) return;
    fresh.results[id] = db.results[id]; fresh.seen[id] = db.seen[id];
    fresh.alerts = [...db.alerts.filter((a) => a.itemId === id && !fresh.alerts.some((f) => f.id === a.id)), ...fresh.alerts].slice(0, 200);
    fresh.lastScan = db.lastScan;
    await store.put(fresh);
  }

  function cleanItem(b, prev = {}) {
    const name = String(b.name ?? prev.name ?? '').trim().slice(0, 120);
    const platform = String(b.platform ?? prev.platform ?? '').toUpperCase();
    const condition = ['NEW', 'USED', 'ANY'].includes(b.condition) ? b.condition : prev.condition || 'ANY';
    const raw = 'maxPrice' in b ? b.maxPrice : prev.maxPrice;
    const maxPrice = raw === '' || raw == null ? null : Number(raw);
    if (!name || !PLATFORMS[platform] || Number.isNaN(maxPrice) || maxPrice < 0) return null;
    return { id: prev.id || crypto.randomUUID(), name, platform, condition, maxPrice, addedAt: prev.addedAt || new Date().toISOString() };
  }

  async function handleApi(request) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
    const body = async () => { try { return await request.json(); } catch { return {}; } };

    if (request.method === 'GET' && parts[1] === 'state') {
      const db = await load();
      return json({
        wishlist: db.wishlist, results: db.results, alerts: db.alerts, lastScan: db.lastScan, errors: db.errors,
        config: { demo, pricecharting: pricechartingConfigured(env), telegram: Boolean(env.TELEGRAM_BOT_TOKEN), scanMinutes: Number(env.SCAN_MINUTES || 60) },
      });
    }
    if (parts[1] === 'wishlist') {
      const db = await load();
      if (request.method === 'POST') {
        const item = cleanItem(await body());
        if (!item) return json({ error: 'Nome, piattaforma (PS4/PS5/SWITCH) e prezzo valido sono obbligatori' }, 400);
        db.wishlist.push(item);
        await store.put(db);
        background(scanOne(item.id));
        return json(item, 201);
      }
      const idx = db.wishlist.findIndex((w) => w.id === parts[2]);
      if (idx < 0) return json({ error: 'Gioco non trovato' }, 404);
      if (request.method === 'PUT') {
        const item = cleanItem(await body(), db.wishlist[idx]);
        if (!item) return json({ error: 'Dati non validi' }, 400);
        db.wishlist[idx] = item;
        await store.put(db);
        return json(item);
      }
      if (request.method === 'DELETE') {
        const [removed] = db.wishlist.splice(idx, 1);
        delete db.results[removed.id]; delete db.seen[removed.id];
        db.alerts = db.alerts.filter((a) => a.itemId !== removed.id);
        await store.put(db);
        return json({ ok: true });
      }
    }
    if (request.method === 'POST' && parts[1] === 'scan') {
      const db = await scanAll();
      return json({ ok: true, lastScan: db.lastScan });
    }
    if (request.method === 'POST' && parts[1] === 'alerts' && parts[2] === 'read') {
      const db = await load();
      db.alerts.forEach((a) => (a.read = true));
      await store.put(db);
      return json({ ok: true });
    }
    return json({ error: 'Not found' }, 404);
  }

  return { handleApi, scanAll };
}

// Password facoltativa (consigliata online): APP_PASSWORD, nome utente qualsiasi.
export function authorized(request, env) {
  const pw = env.APP_PASSWORD;
  if (!pw) return true;
  const [scheme, b64] = (request.headers.get('Authorization') || '').split(' ');
  if (scheme !== 'Basic' || !b64) return false;
  let given = '';
  try { given = atob(b64).split(':').slice(1).join(':'); } catch { return false; }
  if (given.length !== pw.length) return false;
  let diff = 0;
  for (let i = 0; i < pw.length; i++) diff |= given.charCodeAt(i) ^ pw.charCodeAt(i);
  return diff === 0;
}

export const unauthorized = () => new Response('Password richiesta', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Offerte Giochi"' } });
