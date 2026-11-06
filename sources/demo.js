// Dati finti per provare l'app senza chiavi eBay. Ogni risultato è marcato come demo.
export function demoResults(item) {
  const seed = [...(item.name + item.platform)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rnd = (i) => ((Math.sin(seed + i) + 1) / 2);
  const base = 20 + (seed % 40);
  return Array.from({ length: 8 }, (_, i) => {
    const used = item.condition === 'USED' || (item.condition === 'ANY' && i % 2 === 1);
    const price = +(base * (used ? 0.55 : 0.9) + rnd(i) * 25).toFixed(2);
    const shipping = i % 3 === 0 ? 0 : +(3 + rnd(i + 9) * 5).toFixed(2);
    return {
      id: `demo:${item.id}:${i}`,
      source: 'eBay.it (demo)',
      title: `${item.name} ${item.platform === 'SWITCH' ? 'Nintendo Switch' : item.platform} ${used ? 'usato ottime condizioni' : 'nuovo sigillato'} PAL ITA`,
      url: `https://www.ebay.it/sch/i.html?_nkw=${encodeURIComponent(item.name + ' ' + item.platform)}`,
      image: null,
      condition: used ? 'USED' : 'NEW',
      conditionLabel: used ? 'Usato' : 'Nuovo',
      price, shipping, total: +(price + shipping).toFixed(2),
      auction: i === 5, endsAt: null, seller: 'venditore_demo (99%)', location: 'Italia', demo: true,
    };
  });
}
