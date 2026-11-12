// Builds src/lib/vibe-db/vibe-db.generated.json from data/sources, data/derived and data/curated.
// Run: npm run build:db
// Every record carries a `source` id and an evidence `tier`:
//   research  — aggregated from a peer-reviewed open dataset
//   editorial — assigned by the publisher of a dataset (their judgement, not a study)
//   inferred  — written or derived by Palette AI
//   reference — plain vocabulary (colour names → values), no claim about meaning
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { converter, parse } from 'culori';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(root + p, 'utf8').replace(/^﻿/, '');
const toOklch = converter('oklch');

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.length > 1);
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const round = (n, dp = 3) => Number(n.toFixed(dp));
const hueOf = (hex) => {
  const o = toOklch(parse(hex));
  return o && o.c > 0.02 && Number.isFinite(o.h) ? round(o.h, 1) : null;
};
const clamp01 = (n) => Math.min(1, Math.max(0, n));

const SOURCES = {
  'emotion-dictionary': {
    title: 'The Emotion Dictionary v1.0.0', url: 'https://emotioninside.org/', licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    note: 'Adapted: only slug, name, family, valence, arousal, neighbours and colour are carried into the database; descriptions stay in the source file. Licence as stated by the project owner.',
  },
  'colour-emotion-survey': {
    title: 'Free Association Database for a 62-Word Dataset Including Emotion and Colour Terms (English subset)',
    url: 'https://osf.io/xzcbg/', citation: 'Jonauskaite, Epicoco & Mohr (2025), Journal of Open Psychology Data 13:4. doi:10.5334/jopd.140',
    licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    note: 'Adapted: aggregated to colour-word counts per emotion cue. No participant-level data is stored.',
  },
  colorcombinations: {
    title: 'The Dictionary of Color Combinations (colorcombinations.org)', url: 'https://colorcombinations.org/',
    licence: 'Site curation CC BY 4.0; Wada plates public domain; digitisation by mattdesl (MIT)',
    note: 'Adapted: hex values, colour names, hand-assigned mood tags and collection keywords only. Descriptive copy is not carried over.',
  },
  'palette-ai-curated': { title: 'Palette AI curated vibe layer', licence: 'Project-owned', note: 'Application-inferred associations. Not research.' },
};

// ---- emotions (editorial) with visual priors derived from valence/arousal (inferred) ----
const emotionRows = parseCsv(read('data/sources/emotion-dictionary-v1.0.0.csv'));
const emotions = emotionRows.map((r) => {
  const valence = Number(r.valence), arousal = Number(r.arousal);
  return {
    id: r.slug, name: r.name, family: r.family, code: r.id_code,
    valence, arousal, // source scale: −1…1. Dominance is not in the source and is not invented here.
    neighbours: r.neighbours.split('|').filter(Boolean),
    editorialColour: r.colour, // publisher's illustrative colour; preserved, never used to choose a hue
    source: 'emotion-dictionary', tier: 'editorial',
    // Direction follows Valdez & Mehrabian (1994): pleasant ↔ lighter, aroused ↔ more saturated. Magnitudes are ours.
    prior: {
      lightness: round(clamp01(0.52 + 0.22 * valence - 0.06 * Math.max(arousal, 0))),
      chroma: round(clamp01(0.42 + 0.34 * arousal + 0.06 * valence)),
      contrast: round(clamp01(0.44 + 0.32 * arousal)),
      tier: 'inferred',
    },
  };
});

// ---- research-backed emotion → colour-term associations ----
const MIN_COUNT = 12, MIN_SHARE = 0.025;
const emotionColour = parseCsv(read('data/derived/survey-emotion-colour-counts.csv'))
  .map((r) => ({ emotion: r.cue, colour: r.colour, count: Number(r.count), responses: Number(r.valid_responses) }))
  .filter((r) => r.count >= MIN_COUNT && r.count / r.responses >= MIN_SHARE)
  .map((r) => ({ ...r, strength: round(r.count / r.responses), source: 'colour-emotion-survey', tier: 'research' }));

// ---- curated vibes / aesthetics / sensory (inferred) ----
const curated = JSON.parse(read('data/curated/vibes.json')).entries.map(([id, kind, synonyms, temperature, lightness, chroma, contrast, hue]) => ({
  id, kind, synonyms, temperature, lightness, chroma, contrast, hue, source: 'palette-ai-curated', tier: 'inferred',
}));

// ---- aesthetics from collections (editorial), skipping plain colour-name and use-case collections ----
const SKIP = new Set(['websites', 'branding', 'logo', 'interior', 'kitchen', 'bedroom', 'fashion', 'food', 'cafe', 'wedding', 'halloween', 'christmas',
  'indigo', 'green', 'red', 'pink', 'blue', 'purple', 'teal', 'terracotta', 'grey', 'black', 'sage', 'navy', 'neutral', 'monochromatic',
  'warm', 'dark', 'bold', 'muted', 'pastel', 'autumn', 'spring', 'summer', 'winter', 'sunset', 'ocean', 'forest', 'desert', 'nature', 'luxury', 'vintage', 'retro', 'minimalist']);
const collections = parseCsv(read('data/sources/collections.csv'))
  .filter((r) => !SKIP.has(r.slug))
  .map((r) => {
    const o = toOklch(parse(r.accent_hex));
    const label = r.slug.replace(/-/g, ' ');
    return {
      id: r.slug, kind: 'aesthetic', synonyms: label === r.slug ? [] : [label], // collection keywords are SEO phrases, so only the name itself is used
      temperature: null, lightness: round(clamp01((o.l - 0.15) / 0.8)), chroma: round(clamp01(o.c / 0.22)), contrast: null,
      hue: hueOf(r.accent_hex), accentHex: r.accent_hex, source: 'colorcombinations', tier: 'editorial', url: r.canonical_url,
    };
  });

// ---- colour vocabulary (reference) ----
const colourNames = parseCsv(read('data/sources/colors.csv')).map((r) => {
  const o = toOklch(parse(r.hex));
  return { id: r.slug, name: r.name.toLowerCase(), meaning: r.meaning || undefined, hex: r.hex.toUpperCase(), hue: hueOf(r.hex), lightness: round(o.l), chroma: round(o.c), source: 'colorcombinations', tier: 'reference' };
});

// ---- palette references by hand-assigned mood tag (editorial) ----
const paletteRefs = {};
for (const r of parseCsv(read('data/sources/palettes.csv'))) {
  const hexes = [r.hex_1, r.hex_2, r.hex_3, r.hex_4].filter(Boolean).map((h) => h.toUpperCase());
  for (const mood of r.moods.split('|').filter(Boolean)) {
    (paletteRefs[mood] ??= []).push({ id: r.slug, title: r.title, hexes, era: r.era, url: r.canonical_url });
  }
}
// Keep a small, varied sample per mood: the dataset is 88% red/yellow/orange-dominant, so it is example material, not a hue source.
for (const mood of Object.keys(paletteRefs)) paletteRefs[mood] = paletteRefs[mood].filter((_, i, a) => i % Math.ceil(a.length / 8) === 0).slice(0, 8);

const body = { sources: SOURCES, emotions, emotionColour, descriptors: [...curated, ...collections], colourNames, paletteRefs: { source: 'colorcombinations', tier: 'editorial', byMood: paletteRefs } };
const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 10);
writeFileSync(root + 'src/lib/vibe-db/vibe-db.generated.json', JSON.stringify({ version, generatedBy: 'scripts/build-vibe-db.mjs', ...body }));
console.log(`vibe-db ${version}: ${emotions.length} emotions, ${emotionColour.length} research associations, ${curated.length} curated + ${collections.length} collection descriptors, ${colourNames.length} colour names, ${Object.keys(paletteRefs).length} mood tags`);
