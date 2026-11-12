import { NAMED_HUES } from '@/lib/colour-engine/prompt-keywords';
import raw from './vibe-db.generated.json';

/**
 * Vibe Intelligence Database — read-only lookups over the generated JSON.
 * Every record carries where it came from and how much weight it deserves.
 */

/** research: aggregated study data · editorial: a publisher's judgement · inferred: written by Palette AI · reference: plain vocabulary · stated: the user said so. */
export type EvidenceTier = 'research' | 'editorial' | 'inferred' | 'reference' | 'stated';
export type DescriptorKind = 'emotion' | 'vibe' | 'aesthetic' | 'sensory';

export interface DescriptorRecord {
  id: string;
  kind: DescriptorKind;
  synonyms: string[];
  temperature: number | null; // −1 cool … 1 warm
  lightness: number | null;
  chroma: number | null;
  contrast: number | null;
  hue: number | null;
  /** Tier of the hue value specifically (an emotion's hue can be research-backed while its other priors are inferred). */
  hueTier?: EvidenceTier;
  source: string;
  tier: EvidenceTier;
}

interface EmotionRow {
  id: string; name: string; family: string; valence: number; arousal: number; neighbours: string[]; editorialColour: string;
  source: string; tier: string; prior: { lightness: number; chroma: number; contrast: number; tier: string };
}
interface Db {
  version: string;
  sources: Record<string, { title: string; url?: string; licence: string; licenceUrl?: string; citation?: string; note?: string }>;
  emotions: EmotionRow[];
  emotionColour: { emotion: string; colour: string; count: number; responses: number; strength: number; source: string; tier: string }[];
  descriptors: (Omit<DescriptorRecord, 'kind' | 'tier'> & { kind: string; tier: string })[];
  colourNames: { id: string; name: string; hue: number | null; lightness: number; chroma: number; source: string }[];
  paletteRefs: { byMood: Record<string, { id: string; title: string; hexes: string[]; era: string; url: string }[]> };
}
const db = raw as unknown as Db;

export const VIBE_DB_VERSION = db.version;
export const VIBE_DB_SOURCES = db.sources;
export const VIBE_DB_STATS = {
  emotions: db.emotions.length,
  researchAssociations: db.emotionColour.length,
  descriptors: db.descriptors.length,
  colourNames: db.colourNames.length,
};

// ---------- colour families (used for explicit preferences and exclusions) ----------

export type HueRange = [from: number, to: number]; // degrees, may wrap past 360

/** OKLCH hue ranges for the everyday colour words. Excluding "orange" excludes the whole range. */
export const COLOUR_FAMILIES: Record<string, { range: HueRange; centre: number }> = {
  red: { range: [12, 40], centre: 27 },
  orange: { range: [40, 75], centre: 55 },
  yellow: { range: [75, 112], centre: 98 },
  green: { range: [118, 168], centre: 148 },
  teal: { range: [168, 212], centre: 190 },
  blue: { range: [215, 272], centre: 255 },
  purple: { range: [285, 325], centre: 305 },
  pink: { range: [325, 12], centre: 352 },
  brown: { range: [35, 80], centre: 55 },
};
const FAMILY_ALIASES: Record<string, string> = {
  reds: 'red', oranges: 'orange', yellows: 'yellow', greens: 'green', blues: 'blue', purples: 'purple', pinks: 'pink', browns: 'brown',
  violet: 'purple', violets: 'purple', cyan: 'teal', turquoise: 'teal', aqua: 'teal', gold: 'yellow', golden: 'yellow', magenta: 'pink',
};
const ACHROMATIC = new Set(['black', 'white', 'grey', 'gray', 'greys', 'grays', 'silver', 'monochrome']);
const COLOUR_NAME_INDEX = new Map(db.colourNames.filter((c) => c.hue !== null).map((c) => [c.name, c]));

export type ColourLookup =
  | { kind: 'family'; name: string; hue: number; range: HueRange; tier: EvidenceTier }
  | { kind: 'named'; name: string; hue: number; range: HueRange; lightness?: number; chroma?: number; tier: EvidenceTier }
  | { kind: 'achromatic'; name: string }
  | null;

const NAMED_SPREAD = 14;
const wrap = (h: number) => ((h % 360) + 360) % 360;

function lookupWord(word: string): ColourLookup {
  const family = COLOUR_FAMILIES[word] ? word : FAMILY_ALIASES[word];
  if (family) return { kind: 'family', name: family, hue: COLOUR_FAMILIES[family].centre, range: COLOUR_FAMILIES[family].range, tier: 'reference' };
  if (ACHROMATIC.has(word)) return { kind: 'achromatic', name: word };
  const named = NAMED_HUES[word];
  if (named) return { kind: 'named', name: word, hue: named.h, range: [wrap(named.h - NAMED_SPREAD), wrap(named.h + NAMED_SPREAD)], lightness: named.l, chroma: named.c, tier: 'reference' };
  const listed = COLOUR_NAME_INDEX.get(word);
  if (listed && listed.hue !== null) return { kind: 'named', name: word, hue: listed.hue, range: [wrap(listed.hue - NAMED_SPREAD), wrap(listed.hue + NAMED_SPREAD)], tier: 'reference' };
  return null;
}

/** Resolves a colour phrase ("dusty rose", "deep navy", "oranges") to a hue. Values come from the tables, never from the model. */
export function lookupColour(phrase: string): ColourLookup {
  const text = normalise(phrase);
  if (!text) return null;
  const whole = lookupWord(text);
  if (whole) return whole;
  const words = text.split(' ');
  // The colour word usually comes last ("dusty rose"); fall back to any word in the phrase.
  for (let i = words.length - 1; i >= 0; i--) {
    const hit = lookupWord(words[i]);
    if (hit) return hit;
  }
  return null;
}

// ---------- descriptors ----------

export function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

const RESEARCH_HUE = new Map(
  db.emotionColour
    .filter((r) => COLOUR_FAMILIES[r.colour])
    .sort((a, b) => a.strength - b.strength)
    .map((r) => [r.emotion, { hue: COLOUR_FAMILIES[r.colour].centre, colour: r.colour, strength: r.strength, count: r.count, responses: r.responses }]),
);

const emotionRecords: DescriptorRecord[] = db.emotions.map((e) => {
  const research = RESEARCH_HUE.get(e.id);
  return {
    id: e.id, kind: 'emotion', synonyms: [],
    temperature: null,
    lightness: e.prior.lightness, chroma: e.prior.chroma, contrast: e.prior.contrast,
    // An emotion only gets a hue when the survey supports one. The dictionary's own colour is not used.
    hue: research ? research.hue : null,
    hueTier: research ? 'research' : undefined,
    source: research ? 'emotion-dictionary + colour-emotion-survey' : 'emotion-dictionary',
    tier: 'inferred', // visual priors are derived by us from the dictionary's valence/arousal
  };
});
const curatedRecords = db.descriptors.map((d) => ({ ...d, hueTier: d.hue === null ? undefined : d.tier }) as DescriptorRecord);

const index = new Map<string, DescriptorRecord>();
// Curated vibes first (they hold the synonyms people actually type), then collection aesthetics, then the emotion dictionary.
for (const record of [...curatedRecords, ...emotionRecords]) {
  for (const key of [record.id.replace(/-/g, ' '), ...record.synonyms]) {
    const k = normalise(key);
    if (k && !index.has(k)) index.set(k, record);
  }
}
const emotionIds = db.emotions.map((e) => e.id);

const SUFFIXES = ['fulness', 'iness', 'ness', 'ically', 'ical', 'ful', 'ing', 'ity', 'ous', 'ive', 'ic', 'al', 'ly', 'ed', 'y', 's'];

export interface DescriptorMatch {
  term: string;
  record: DescriptorRecord;
  via: 'exact' | 'synonym' | 'stem' | 'phrase';
}

/**
 * Deterministic match of one descriptor to a canonical entry: exact id → synonym → shared stem
 * ("nostalgic" → nostalgia) → a known word inside a phrase ("rainy evening"). Returns null when
 * nothing fits; callers keep the term as unresolved rather than guessing.
 */
export function matchDescriptor(term: string): DescriptorMatch | null {
  const text = normalise(term);
  if (!text) return null;
  const direct = index.get(text);
  if (direct) return { term, record: direct, via: normalise(direct.id.replace(/-/g, ' ')) === text ? 'exact' : 'synonym' };

  if (!text.includes(' ')) {
    for (const suffix of SUFFIXES) {
      if (!text.endsWith(suffix)) continue;
      const stem = text.slice(0, -suffix.length);
      if (stem.length < 5) continue;
      const viaIndex = index.get(stem);
      if (viaIndex) return { term, record: viaIndex, via: 'stem' };
      const id = emotionIds.find((e) => e.startsWith(stem) && e.length - stem.length <= 5);
      if (id) return { term, record: index.get(id)!, via: 'stem' };
    }
    const longer = emotionIds.find((e) => e.startsWith(text) && text.length >= 5 && e.length - text.length <= 4);
    if (longer) return { term, record: index.get(longer)!, via: 'stem' };
    return null;
  }

  const words = text.split(' ');
  for (let size = Math.min(3, words.length - 1); size >= 1; size--) {
    for (let i = 0; i + size <= words.length; i++) {
      const hit = index.get(words.slice(i, i + size).join(' '));
      if (hit) return { term, record: hit, via: 'phrase' };
    }
  }
  return null;
}

export function emotionFacts(id: string) {
  const e = db.emotions.find((x) => x.id === id);
  if (!e) return null;
  return { name: e.name, family: e.family, valence: e.valence, arousal: e.arousal, neighbours: e.neighbours, research: RESEARCH_HUE.get(id) ?? null };
}

/** Editorial reference palettes for a mood tag (colorcombinations.org). Example material only. */
export function paletteReferences(mood: string) {
  return db.paletteRefs.byMood[normalise(mood)] ?? [];
}
