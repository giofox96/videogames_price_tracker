const PL = { PS4: 'PS4', PS5: 'PS5', SWITCH: 'Switch' };
const COND = { ANY: 'Nuovo o usato', NEW: 'Solo nuovo', USED: 'Solo usato' };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => (n == null ? '?' : n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }));
const ago = (iso) => { if (!iso) return 'mai'; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'adesso' : m < 60 ? `${m} min fa` : `${Math.round(m / 60)} h fa`; };

let state = null;
const filters = { platform: '', cond: '', under: false };
try { Object.assign(filters, JSON.parse(localStorage.getItem('filters') || '{}')); } catch {}

async function call(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
async function load() {
  const prevUnread = state ? state.alerts.filter((a) => !a.read).length : null;
  state = await call('GET', '/api/state');
  const unread = state.alerts.filter((a) => !a.read);
  if (prevUnread != null && unread.length > prevUnread && Notification?.permission === 'granted') {
    unread.slice(0, unread.length - prevUnread).forEach((a) => new Notification('Offerta sotto soglia', { body: a.text, icon: '/icon.svg' }));
  }
  render();
}

function render() {
  const b = $('#banner');
  const msgs = [];
  if (state.config.demo) msgs.push('<b>Modalità demo:</b> i prezzi sono finti finché non aggiungi la chiave eBay nel file <code>.env</code>.');
  if (state.errors.length) msgs.push(`Errori nell'ultima ricerca: ${state.errors.map((e) => esc(e.message)).join('; ')}`);
  b.hidden = !msgs.length; b.innerHTML = msgs.join('<br>');
  $('#scanBtn').textContent = state.scanning ? '… cerco' : `↻ ${ago(state.lastScan)}`;
  renderOffers(); renderWishlist(); renderAlerts();
}

function renderOffers() {
  const el = $('#offers');
  if (!state.wishlist.length) { el.innerHTML = '<div class="empty">Aggiungi un gioco nella Wishlist per vedere le offerte.</div>'; return; }
  const groups = state.wishlist
    .filter((w) => !filters.platform || w.platform === filters.platform)
    .map((w) => {
      const r = state.results[w.id];
      let offers = r?.offers || [];
      if (filters.cond) offers = offers.filter((o) => o.condition === filters.cond);
      if (filters.under && w.maxPrice) offers = offers.filter((o) => o.total <= w.maxPrice);
      return { w, r, offers };
    })
    .sort((a, b) => (a.offers[0]?.total ?? 1e9) - (b.offers[0]?.total ?? 1e9));
  el.innerHTML = groups.map(({ w, r, offers }) => `
    <div class="group">
      <h2><span>${esc(w.name)} <span class="tag">${PL[w.platform]}</span></span><small>${w.maxPrice ? 'soglia ' + eur(w.maxPrice) : 'nessuna soglia'}</small></h2>
      ${r?.reference ? `<div class="ref">Riferimento PriceCharting: usato ~$${r.reference.usedUSD ?? '?'} · nuovo ~$${r.reference.newUSD ?? '?'}</div>` : ''}
      ${!r ? '<div class="card empty">Ricerca in corso…</div>' : offers.length ? offers.slice(0, 10).map((o) => offerCard(o, w)).join('') : '<div class="card empty">Nessuna offerta con questi filtri.</div>'}
    </div>`).join('');
}
function offerCard(o, w) {
  const under = w.maxPrice && o.total <= w.maxPrice;
  return `<a class="card offer ${under ? 'under' : ''}" href="${esc(o.url)}" target="_blank" rel="noopener">
    ${o.image ? `<img src="${esc(o.image)}" alt="" loading="lazy">` : '<div class="ph"></div>'}
    <div class="info">
      <div class="title">${esc(o.title)}</div>
      <div class="meta"><span class="tag ${o.condition === 'NEW' ? 'good' : ''}">${o.condition === 'NEW' ? 'Nuovo' : 'Usato'}</span>${o.auction ? '<span class="tag">Asta</span>' : ''}${esc(o.source)}${o.seller ? ' · ' + esc(o.seller) : ''}</div>
    </div>
    <div class="price"><b>${eur(o.total)}</b><span>${o.shipping == null ? 'sped. da verificare' : o.shipping === 0 ? 'sped. gratis' : 'incl. ' + eur(o.shipping) + ' sped.'}</span></div>
  </a>`;
}

function renderWishlist() {
  $('#wishlist').innerHTML = state.wishlist.length ? state.wishlist.map((w) => {
    const best = state.results[w.id]?.offers?.[0];
    return `<div class="card wish" data-id="${w.id}">
      <div><b>${esc(w.name)}</b> <span class="tag">${PL[w.platform]}</span><div class="meta">${COND[w.condition]} · migliore ora: ${best ? eur(best.total) : '—'}</div></div>
      <div class="row" style="flex:none;align-items:center">
        <input class="inline" type="number" step="0.5" min="0" value="${w.maxPrice ?? ''}" placeholder="max €" aria-label="Prezzo massimo">
        <button class="link" data-del title="Rimuovi">✕</button>
      </div>
    </div>`;
  }).join('') : '<div class="empty">La tua wishlist è vuota.</div>';
}

function renderAlerts() {
  const unread = state.alerts.filter((a) => !a.read).length;
  const c = $('#alertCount'); c.hidden = !unread; c.textContent = unread;
  $('#alerts').innerHTML = state.alerts.length ? state.alerts.map((a) => `
    <a class="card offer ${a.read ? '' : 'under'}" href="${esc(a.url)}" target="_blank" rel="noopener">
      <div class="info"><div class="title">${esc(a.text)}</div><div class="meta">${new Date(a.at).toLocaleString('it-IT')}</div></div>
    </a>`).join('') : '<div class="empty">Nessun avviso. Ti avviso qui quando un gioco scende sotto la tua soglia.</div>';
}

// ---------- eventi ----------
document.querySelectorAll('.tabs button').forEach((btn) => btn.addEventListener('click', async () => {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.tab').forEach((t) => (t.hidden = t.id !== 'tab-' + btn.dataset.tab));
  if (btn.dataset.tab === 'alerts' && state?.alerts.some((a) => !a.read)) {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    setTimeout(async () => { await call('POST', '/api/alerts/read'); load(); }, 1500);
  }
}));

$('#addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    await call('POST', '/api/wishlist', Object.fromEntries(f));
    e.target.reset();
    await load();
    setTimeout(load, 3000);
  } catch (err) { alert(err.message); }
});
$('#wishlist').addEventListener('click', async (e) => {
  if (!e.target.matches('[data-del]')) return;
  const id = e.target.closest('[data-id]').dataset.id;
  if (confirm('Rimuovere questo gioco dalla wishlist?')) { await call('DELETE', '/api/wishlist/' + id); load(); }
});
$('#wishlist').addEventListener('change', async (e) => {
  if (!e.target.matches('input.inline')) return;
  const id = e.target.closest('[data-id]').dataset.id;
  try { await call('PUT', '/api/wishlist/' + id, { maxPrice: e.target.value }); load(); } catch (err) { alert(err.message); }
});
$('#scanBtn').addEventListener('click', async () => { $('#scanBtn').textContent = '… cerco'; await call('POST', '/api/scan'); load(); });

for (const [id, key, prop] of [['#fPlatform', 'platform', 'value'], ['#fCond', 'cond', 'value'], ['#fUnder', 'under', 'checked']]) {
  $(id)[prop] = filters[key];
  $(id).addEventListener('change', (e) => { filters[key] = e.target[prop]; try { localStorage.setItem('filters', JSON.stringify(filters)); } catch {} renderOffers(); });
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
load();
setInterval(load, 60_000);
