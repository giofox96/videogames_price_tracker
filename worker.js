// Versione Cloudflare Workers (piano gratuito): API + PWA + ricerca oraria via Cron Trigger.
import { createApp, authorized, unauthorized } from './core.js';

const kvStore = (env) => ({
  get: () => env.DB.get('db', 'json'),
  put: (db) => env.DB.put('db', JSON.stringify(db)),
});

export default {
  async fetch(request, env, ctx) {
    if (!authorized(request, env)) return unauthorized();
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const app = createApp({ store: kvStore(env), env, background: (p) => ctx.waitUntil(p.catch((e) => console.error(e))) });
      return app.handleApi(request);
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(createApp({ store: kvStore(env), env }).scanAll());
  },
};
