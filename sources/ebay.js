import { PLATFORMS, isRelevant } from './platforms.js';

const CATEGORY_VIDEOGAMES = '139973'; // Videogiochi > Giochi
let token = null;
let tokenExpires = 0;

export const ebayConfigured = (env) => Boolean(env.EBAY_CLIENT_ID && env.EBAY_CLIENT_SECRET);

async function getToken(env) {
  if (token && Date.now() < tokenExpires - 60_000) return token;
  const auth = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
  });
  if (!res.ok) throw new Error(`eBay OAuth ${res.status}: ${await res.text()}`);
  const j = await res.json();
  token = j.access_token;
  tokenExpires = Date.now() + j.expires_in * 1000;
  return token;
}

// condition: 'NEW' | 'USED' | 'ANY'
export async function searchEbay(item, env) {
  const p = PLATFORMS[item.platform];
  const filters = ['deliveryCountry:IT', 'priceCurrency:EUR', 'buyingOptions:{FIXED_PRICE|AUCTION}'];
  if (item.condition === 'NEW') filters.push('conditions:{NEW}');
  if (item.condition === 'USED') filters.push('conditions:{USED}');
  const params = new URLSearchParams({
    q: `${item.name} ${p.query}`,
    category_ids: CATEGORY_VIDEOGAMES,
    filter: filters.join(','),
    sort: 'price',
    limit: '50',
  });
  const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
    headers: {
      Authorization: `Bearer ${await getToken(env)}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_IT',
      'Accept-Language': 'it-IT',
      'X-EBAY-C-ENDUSERCTX': `contextualLocation=country%3DIT%2Czip%3D${env.ZIP || '20100'}`,
    },
  });
  if (!res.ok) throw new Error(`eBay search ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return (j.itemSummaries || [])
    .filter((it) => isRelevant(it.title, item.platform, item.name))
    .map((it) => {
      const price = Number(it.price?.value ?? it.currentBidPrice?.value ?? 0);
      const ship = it.shippingOptions?.[0]?.shippingCost;
      const shipping = ship ? Number(ship.value) : null;
      return {
        id: `ebay:${it.itemId}`,
        source: 'eBay.it',
        title: it.title,
        url: it.itemWebUrl,
        image: it.image?.imageUrl || it.thumbnailImages?.[0]?.imageUrl || null,
        condition: /nuovo|new/i.test(it.condition || '') ? 'NEW' : 'USED',
        conditionLabel: it.condition || '',
        price,
        shipping,
        total: shipping == null ? price : +(price + shipping).toFixed(2),
        auction: (it.buyingOptions || []).includes('AUCTION') && !(it.buyingOptions || []).includes('FIXED_PRICE'),
        endsAt: it.itemEndDate || null,
        seller: it.seller ? `${it.seller.username} (${it.seller.feedbackPercentage ?? '?'}%)` : '',
        location: it.itemLocation?.city || it.itemLocation?.country || '',
      };
    });
}
