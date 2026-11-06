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

## Avvio
Serve Node.js 20 o più recente, nessuna dipendenza da installare.

```bash
cp .env.example .env    # poi compila le chiavi
npm start               # apri http://localhost:8080
```

Dal telefono: apri l'indirizzo del server e scegli "Aggiungi a schermata Home".

## Metterla online (Render)
1. Crea un account su https://render.com e collega GitHub.
2. *New > Blueprint*, scegli questo repository: Render legge `render.yaml`.
3. Compila le variabili richieste (`APP_PASSWORD`, chiavi eBay, Telegram) e conferma.
4. Apri l'indirizzo `https://offerte-giochi-xxxx.onrender.com` dal telefono e aggiungilo alla schermata Home.

Il piano `starter` (circa 7 $/mese) resta sempre acceso e ha un disco per la wishlist. Il piano gratuito si spegne dopo 15 minuti senza visite, quindi non cerca in background e perde la wishlist a ogni riavvio.

## Chiave eBay (gratuita)
1. Registrati su https://developer.ebay.com
2. Vai su *Application Keys* e crea una chiave **Production**.
3. Copia *App ID (Client ID)* e *Cert ID (Client Secret)* in `.env`.

## Avvisi Telegram (opzionale)
1. Su Telegram scrivi a @BotFather, crea un bot, copia il token in `TELEGRAM_BOT_TOKEN`.
2. Scrivi un messaggio al tuo bot, poi apri `https://api.telegram.org/bot<TOKEN>/getUpdates` e copia il `chat.id` in `TELEGRAM_CHAT_ID`.

## Struttura
- `server.js`: server HTTP, API, ricerca periodica, avvisi. Dati salvati in `data/db.json`.
- `sources/`: un file per fonte (`ebay.js`, `pricecharting.js`, `demo.js`) e i filtri piattaforma (`platforms.js`).
- `public/`: l'app (HTML, CSS, JS, manifest, service worker).

## Prossime fonti
Subito.it, Amazon.it, GameStop.it non hanno API pubbliche: si aggiungono come nuovi file in `sources/` dopo aver valutato i termini d'uso.
