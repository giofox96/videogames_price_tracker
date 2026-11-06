// Parole che identificano ogni piattaforma nel titolo di un annuncio.
export const PLATFORMS = {
  PS4: { label: 'PS4', query: 'PS4', match: [/\bps\s?4\b/i, /playstation\s?4/i] },
  PS5: { label: 'PS5', query: 'PS5', match: [/\bps\s?5\b/i, /playstation\s?5/i] },
  SWITCH: { label: 'Switch', query: 'Nintendo Switch', match: [/switch/i] },
};

// Annunci da scartare: codici digitali, solo custodia, accessori, ecc.
const NOISE = [
  /codice/i, /\bcode\b/i, /\bkey\b/i, /download/i, /digitale/i, /voucher/i, /dlc/i,
  /solo (custodia|scatola|cover|box)/i, /custodia vuota/i, /no gioco/i, /senza gioco/i,
  /\bcover\b(?!.*gioco)/i, /artbook/i, /steelbook(?! .*gioco)/i, /guida strategica/i,
  /switch 2/i, /\bposter\b/i, /\bfigure\b/i, /amiibo/i,
];

export function isRelevant(title, platform, gameName) {
  const p = PLATFORMS[platform];
  if (!p || !p.match.some((r) => r.test(title))) return false;
  if (platform === 'SWITCH' && /switch\s?2/i.test(title)) return false;
  if (NOISE.some((r) => r.test(title))) return false;
  // Tutte le parole significative del nome del gioco devono comparire nel titolo.
  const words = gameName.toLowerCase().split(/[^a-z0-9àèéìòù]+/).filter((w) => w.length > 2);
  const t = title.toLowerCase();
  return words.every((w) => t.includes(w));
}
