# Offerte Videogiochi

App personale (PWA, installabile sul telefono) che cerca le offerte migliori su **giochi fisici PS4, PS5 e Nintendo Switch**, nuovi e usati, in Italia.

## Cosa fa
- **Wishlist**: gioco, piattaforma, condizione (nuovo / usato / entrambi), prezzo massimo.
- **Ricerca periodica** su eBay.it (Browse API ufficiale), di default ogni 60 minuti, più il pulsante "Cerca".
- **Risultati ordinati per prezzo totale** (prezzo + spedizione verso il tuo CAP), con filtri per piattaforma, nuovo/usato e "sotto soglia".
- Scarta automaticamente codici digitali, solo custodia, accessori, edizioni Switch 2 e annunci di altre piattaforme.
- **Avvisi** quando un annuncio nuovo scende sotto la soglia: nella scheda Avvisi, come notifica del browser e, se configuri un bot, su **Telegram**.
- Opzionale: **prezzo di riferimento PriceCharting** per capire se un usato conviene davvero.

Senza chiave eBay parte in **modalità demo** con prezzi finti, così puoi provare l'interfaccia.

## Metterla online gratis (Cloudflare Workers)
Il piano gratuito di Cloudflare basta per uso personale: sempre acceso, ricerca automatica ogni ora, nessuna carta di credito.

1. Crea un account gratuito su https://dash.cloudflare.com/sign-up
2. Sul computer, con Node.js 20 o più recente, nella cartella del progetto:
   ```bash
   npm install
   npx wrangler login                 # apre il browser per collegare l'account
   npx wrangler kv namespace create DB
   ```
   Copia l'`id` che ti restituisce al posto di `INCOLLA_QUI_ID_KV` in `wrangler.toml`.
3. Imposta password e chiavi (ognuno ti chiede il valore):
   ```bash
   npx wrangler secret put APP_PASSWORD
   npx wrangler secret put EBAY_CLIENT_ID
   npx wrangler secret put EBAY_CLIENT_SECRET
   npx wrangler secret put TELEGRAM_BOT_TOKEN   # facoltativo
   npx wrangler secret put TELEGRAM_CHAT_ID     # facoltativo
   ```
4. Pubblica: `npm run deploy`. Ti dà un indirizzo tipo `https://offerte-giochi.<tuonome>.workers.dev`.
5. Aprilo dal telefono, inserisci la password (nome utente qualsiasi) e scegli "Aggiungi a schermata Home".

Con il piano gratuito ogni ricerca può fare al massimo 50 chiamate esterne: la wishlist regge bene fino a circa 20 giochi.

Per cambiare il CAP usato per stimare la spedizione modifica `ZIP` in `wrangler.toml`.

## Provarla sul computer
Nessuna dipendenza da installare per la versione locale:
```bash
cp .env.example .env    # poi compila le chiavi
npm start               # apri http://localhost:8080
```

## Chiave eBay (gratuita)
1. Registrati su https://developer.ebay.com
2. Vai su *Application Keys* e crea una chiave **Production**.
3. Copia *App ID (Client ID)* e *Cert ID (Client Secret)* in `.env`.

## Avvisi Telegram (opzionale)
1. Su Telegram scrivi a @BotFather, crea un bot, copia il token in `TELEGRAM_BOT_TOKEN`.
2. Scrivi un messaggio al tuo bot, poi apri `https://api.telegram.org/bot<TOKEN>/getUpdates` e copia il `chat.id` in `TELEGRAM_CHAT_ID`.

## Struttura
- `core.js`: logica dell'app (wishlist, ricerca, avvisi, API), condivisa tra le due versioni.
- `worker.js` e `wrangler.toml`: versione Cloudflare, dati nell'archivio KV.
- `server.js`: versione locale, dati in `data/db.json`.
- `sources/`: un file per fonte (`ebay.js`, `pricecharting.js`, `demo.js`) e i filtri piattaforma (`platforms.js`).
- `public/`: l'app (HTML, CSS, JS, manifest, service worker).

## Prossime fonti
Subito.it, Amazon.it, GameStop.it non hanno API pubbliche: si aggiungono come nuovi file in `sources/` dopo aver valutato i termini d'uso.
