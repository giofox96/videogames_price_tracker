import { PLATFORMS } from './platforms.js';

const CONSOLE = { PS4: 'Playstation 4', PS5: 'Playstation 5', SWITCH: 'Nintendo Switch' };
export const pricechartingConfigured = () => Boolean(process.env.PRICECHARTING_TOKEN);

// Prezzi di riferimento (PAL quando disponibile). I valori dell'API sono in centesimi di dollaro.
export async function referencePrice(item) {
  if (!pricechartingConfigured() || !PLATFORMS[item.platform]) return null;
  const q = `${item.name} PAL ${CONSOLE[item.platform]}`;
  const res = await fetch(`https://www.pricecharting.com/api/product?t=${process.env.PRICECHARTING_TOKEN}&q=${encodeURIComponent(q)}`);
  if (!res.ok) return null;
  const j = await res.json();
  if (j.status !== 'success') return null;
  const usd = (c) => (c ? +(c / 100).toFixed(2) : null);
  return { product: `${j['product-name']} (${j['console-name']})`, usedUSD: usd(j['cib-price']), looseUSD: usd(j['loose-price']), newUSD: usd(j['new-price']) };
}
