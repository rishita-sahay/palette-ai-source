import type { HarmonyMode, InterpretedTerm, Oklch } from '@/types';
import { HARMONY_LABELS } from './harmony';

/**
 * Deterministic prompt interpretation (PS-001).
 *
 * This is a keyword lookup table — NOT an AI model. Words in the prompt are matched
 * against the dictionaries below and mapped to hue / chroma / lightness / harmony
 * parameters. Unrecognised words are ignored and reported back. The same prompt
 * always produces the same result.
 */

interface HueEntry {
  h: number;
  l?: number;
  c?: number;
}

/** Exported for the interpretation layer's colour-name lookup (read-only use). */
export const NAMED_HUES: Record<string, HueEntry> = {
  red: { h: 27 }, crimson: { h: 20 }, scarlet: { h: 30 }, coral: { h: 35, l: 0.72, c: 0.16 },
  orange: { h: 55, l: 0.7 }, amber: { h: 75, l: 0.77 }, gold: { h: 88, l: 0.79, c: 0.15 }, golden: { h: 88, l: 0.79, c: 0.15 },
  yellow: { h: 100, l: 0.87 }, lime: { h: 128, l: 0.8 }, green: { h: 148 }, emerald: { h: 160 },
  mint: { h: 165, l: 0.85, c: 0.09 }, teal: { h: 185 }, turquoise: { h: 195, l: 0.72 }, aqua: { h: 205, l: 0.76 },
  cyan: { h: 210, l: 0.72 }, sky: { h: 235, l: 0.72, c: 0.14 }, azure: { h: 250 }, blue: { h: 258 }, cobalt: { h: 262 },
  navy: { h: 262, l: 0.32, c: 0.1 }, indigo: { h: 275, l: 0.5 }, violet: { h: 293 }, purple: { h: 305 },
  lavender: { h: 300, l: 0.76, c: 0.09 }, lilac: { h: 310, l: 0.78, c: 0.09 }, plum: { h: 325, l: 0.42, c: 0.13 },
  magenta: { h: 335 }, fuchsia: { h: 328 }, pink: { h: 355, l: 0.72, c: 0.17 }, rose: { h: 10 },
  burgundy: { h: 15, l: 0.36, c: 0.12 }, maroon: { h: 22, l: 0.34, c: 0.11 }, brown: { h: 55, l: 0.45, c: 0.07 },
  terracotta: { h: 42, l: 0.58, c: 0.12 }, peach: { h: 55, l: 0.82, c: 0.09 }, beige: { h: 85, l: 0.86, c: 0.04 },
  sand: { h: 85, l: 0.82, c: 0.05 }, cream: { h: 95, l: 0.93, c: 0.04 }, olive: { h: 115, l: 0.55, c: 0.1 },
  sage: { h: 145, l: 0.7, c: 0.05 }, forest: { h: 150, l: 0.4, c: 0.1 }, slate: { h: 250, l: 0.5, c: 0.03 },
  charcoal: { h: 260, l: 0.3, c: 0.012 },
};

const TEMPERATURES: Record<string, { h: number; label: string }> = {
  warm: { h: 55, label: 'warm' }, warmer: { h: 55, label: 'warm' }, sunny: { h: 85, label: 'warm' },
  cool: { h: 245, label: 'cool' }, cooler: { h: 245, label: 'cool' }, cold: { h: 235, label: 'cold' },
  icy: { h: 225, label: 'icy' }, frosty: { h: 225, label: 'icy' },
};

interface MoodEntry {
  chroma?: number; // multiplier
  lightness?: number; // delta
  harmony?: HarmonyMode;
  hue?: number; // fallback hue if nothing stronger sets one
}

const MOODS: Record<string, MoodEntry> = {
  vibrant: { chroma: 1.25 }, bold: { chroma: 1.2, harmony: 'complementary' }, energetic: { chroma: 1.25, harmony: 'triadic' },
  playful: { chroma: 1.2, harmony: 'triadic', lightness: 0.04 }, bright: { chroma: 1.15, lightness: 0.05 }, punchy: { chroma: 1.3 },
  neon: { chroma: 1.5, lightness: 0.08 }, loud: { chroma: 1.3 }, fun: { chroma: 1.15, harmony: 'triadic' },
  calm: { chroma: 0.75, harmony: 'analogous' }, soft: { chroma: 0.8, lightness: 0.04 }, muted: { chroma: 0.65 },
  subtle: { chroma: 0.8 }, gentle: { chroma: 0.75, lightness: 0.04 }, pastel: { chroma: 0.6, lightness: 0.16 },
  quiet: { chroma: 0.7 }, serene: { chroma: 0.75, harmony: 'analogous' }, minimal: { chroma: 0.8, harmony: 'monochromatic' },
  minimalist: { chroma: 0.8, harmony: 'monochromatic' }, clean: { chroma: 0.9 },
  premium: { chroma: 0.88, lightness: -0.05, harmony: 'analogous' }, luxury: { chroma: 0.82, lightness: -0.1, harmony: 'analogous' },
  luxurious: { chroma: 0.82, lightness: -0.1, harmony: 'analogous' }, elegant: { chroma: 0.82, lightness: -0.04 },
  sophisticated: { chroma: 0.8, lightness: -0.05 }, refined: { chroma: 0.85 },
  dark: { lightness: -0.14 }, moody: { lightness: -0.14, chroma: 0.85 }, deep: { lightness: -0.1 },
  light: { lightness: 0.07 }, airy: { lightness: 0.09, chroma: 0.85 }, fresh: { lightness: 0.05, hue: 160 },
  earthy: { chroma: 0.7, hue: 65 }, natural: { chroma: 0.75, hue: 140 }, organic: { chroma: 0.75, hue: 140 }, rustic: { chroma: 0.7, hue: 50 },
  trustworthy: { chroma: 0.95, hue: 255 }, professional: { chroma: 0.9, hue: 255 }, corporate: { chroma: 0.9, hue: 255 },
  serious: { chroma: 0.85, hue: 260, lightness: -0.04 }, friendly: { chroma: 1.05, lightness: 0.04, hue: 60 },
  modern: { hue: 262 }, futuristic: { hue: 280, chroma: 1.15 }, retro: { chroma: 0.82, hue: 45, harmony: 'split-complementary' },
  vintage: { chroma: 0.72, hue: 50, harmony: 'split-complementary' },
};

const INDUSTRIES: Record<string, HueEntry & { harmony?: HarmonyMode }> = {
  saas: { h: 258 }, software: { h: 258 }, tech: { h: 262 }, startup: { h: 265 }, fintech: { h: 262 }, finance: { h: 255 },
  financial: { h: 255 }, bank: { h: 250 }, banking: { h: 250 }, insurance: { h: 245 }, crypto: { h: 290 }, ai: { h: 280 },
  health: { h: 195 }, healthcare: { h: 195 }, medical: { h: 205 }, wellness: { h: 165 }, fitness: { h: 30 }, eco: { h: 150 },
  sustainability: { h: 150 }, sustainable: { h: 150 }, food: { h: 40 }, restaurant: { h: 35 }, hospitality: { h: 60, c: 0.13 },
  hotel: { h: 70, c: 0.11 }, coffee: { h: 55, l: 0.45, c: 0.07 }, cafe: { h: 55, l: 0.48, c: 0.08 }, bakery: { h: 65, l: 0.72, c: 0.1 },
  kids: { h: 330, harmony: 'triadic' }, children: { h: 330, harmony: 'triadic' }, gaming: { h: 295 }, fashion: { h: 350 },
  beauty: { h: 5, l: 0.7, c: 0.12 }, travel: { h: 220 }, education: { h: 250 }, legal: { h: 265, l: 0.4, c: 0.1 },
  law: { h: 265, l: 0.4, c: 0.1 }, music: { h: 310 }, ecommerce: { h: 40 }, retail: { h: 30 }, logistics: { h: 240 },
};

const ACCENT_WORDS = new Set(['accent', 'accents', 'highlight', 'highlights', 'pop']);
const NEUTRAL_WORDS = new Set(['neutral', 'neutrals', 'surface', 'surfaces', 'background', 'backgrounds', 'grey', 'gray', 'greys', 'grays']);
const PRIMARY_WORDS = new Set(['undertone', 'undertones', 'primary', 'base', 'main']);

const STOPWORDS = new Set(
  ('a an the with and or for of to in on at by from that this is are be it its as but not no into feel feels feeling look looks ' +
    'looking very quite some touch hint bit little more less brand branding app application product website site web colour color ' +
    'colours colors palette palettes theme themes design system scheme tone tones tinted tint shade shades style vibe vibes mood ' +
    'ui ux platform company business tool dashboard landing page pages interface use using used want need make give like inspired').split(' '),
);

export const PROMPT_MAX_LENGTH = 300;

export const EXAMPLE_PROMPTS = [
  'A premium SaaS brand with cool blue undertones, soft neutral surfaces and a subtle lavender accent.',
  'Earthy hospitality brand, warm terracotta with sage accents.',
  'Playful kids education app, bright and friendly with a teal accent.',
  'Dark, moody fintech dashboard in emerald.',
];

export interface PromptInterpretation {
  status: 'success' | 'partial' | 'empty';
  interpreted: InterpretedTerm[];
  unmatched: string[];
  anchor: Oklch;
  harmony: HarmonyMode;
  chromaBias: number;
  lightnessBias: number;
  accentHue: number | null;
  neutralHue: number | null;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const pct = (m: number) => `${m >= 1 ? '+' : '−'}${Math.round(Math.abs(m - 1) * 100)}%`;

function lookAheadRole(tokens: string[], i: number): 'accent' | 'neutral' | 'primary' | null {
  for (let k = i + 1; k <= i + 2 && k < tokens.length; k++) {
    const t = tokens[k];
    if (ACCENT_WORDS.has(t)) return 'accent';
    if (NEUTRAL_WORDS.has(t)) return 'neutral';
    if (PRIMARY_WORDS.has(t)) return 'primary';
    // Stop scanning at the next colour word so "blue and lavender accent" binds only lavender.
    if (NAMED_HUES[t] || TEMPERATURES[t]) return null;
  }
  return null;
}

/** "subtle lavender accent" / "soft neutral surfaces": a mood word directly describing an accent or neutral applies there only. */
function moodScope(tokens: string[], i: number): 'accent' | 'neutral' | null {
  for (let k = i + 1; k <= i + 2 && k < tokens.length; k++) {
    if (ACCENT_WORDS.has(tokens[k])) return 'accent';
    if (NEUTRAL_WORDS.has(tokens[k])) return 'neutral';
    if (MOODS[tokens[k]] || INDUSTRIES[tokens[k]] || STOPWORDS.has(tokens[k])) return null;
  }
  return null;
}

export function interpretPrompt(prompt: string): PromptInterpretation {
  const tokens = prompt
    .slice(0, PROMPT_MAX_LENGTH)
    .toLowerCase()
    .replace(/e-commerce/g, 'ecommerce')
    .split(/[^a-z]+/)
    .filter(Boolean);

  const interpreted: InterpretedTerm[] = [];
  const used = new Set<number>();
  const note = (i: number, category: InterpretedTerm['category'], effect: string) => {
    used.add(i);
    interpreted.push({ term: tokens[i], category, effect });
  };

  let primary: (HueEntry & { from: string }) | null = null;
  let accentHue: number | null = null;
  let neutralHue: number | null = null;
  let temperature: { h: number; from: string } | null = null;
  let industry: (HueEntry & { from: string }) | null = null;
  let moodHue: { h: number; from: string } | null = null;
  let harmony: { mode: HarmonyMode; from: string } | null = null;
  let chroma = 1;
  let accentChroma = 1;
  let lightness = 0;

  tokens.forEach((t, i) => {
    if (NAMED_HUES[t]) {
      const entry = NAMED_HUES[t];
      const role = lookAheadRole(tokens, i);
      if (role === 'accent' && accentHue === null) {
        accentHue = entry.h;
        note(i, 'hue', `accent hue ${entry.h}°`);
      } else if (role === 'neutral' && neutralHue === null) {
        neutralHue = entry.h;
        note(i, 'hue', `neutral tint ${entry.h}°`);
      } else if (!primary) {
        primary = { ...entry, from: t };
        note(i, 'hue', `primary hue ${entry.h}°`);
      } else if (accentHue === null) {
        accentHue = entry.h;
        note(i, 'hue', `accent hue ${entry.h}° (second colour named)`);
      } else {
        note(i, 'hue', 'recognised, not used — primary and accent were already set');
      }
      return;
    }
    if (TEMPERATURES[t]) {
      const entry = TEMPERATURES[t];
      const role = lookAheadRole(tokens, i);
      if (role === 'neutral' && neutralHue === null) {
        neutralHue = entry.h;
        note(i, 'temperature', `${entry.label} tint on neutrals (${entry.h}°)`);
      } else if (!temperature) {
        temperature = { h: entry.h, from: t };
        note(i, 'temperature', `${entry.label} bias`);
      } else {
        note(i, 'temperature', `recognised, not used — “${temperature.from}” came first`);
      }
      return;
    }
    if (MOODS[t]) {
      const m = MOODS[t];
      const scope = moodScope(tokens, i);
      if (scope === 'accent' && m.chroma) {
        accentChroma *= m.chroma;
        note(i, 'mood', `accent chroma ${pct(m.chroma)}`);
        return;
      }
      if (scope === 'neutral') {
        note(i, 'mood', 'describes the neutrals — kept low-chroma');
        return;
      }
      const parts: string[] = [];
      if (m.chroma) {
        chroma *= m.chroma;
        parts.push(`chroma ${pct(m.chroma)}`);
      }
      if (m.lightness) {
        lightness += m.lightness;
        parts.push(m.lightness > 0 ? 'lighter' : 'deeper');
      }
      if (m.harmony && !harmony) {
        harmony = { mode: m.harmony, from: t };
        parts.push(`${HARMONY_LABELS[m.harmony].toLowerCase()} harmony`);
      }
      if (m.hue !== undefined && !moodHue) {
        moodHue = { h: m.hue, from: t };
        parts.push(`suggests hue ${m.hue}°`);
      }
      note(i, 'mood', parts.join(', ') || 'recognised');
      return;
    }
    if (INDUSTRIES[t]) {
      if (!industry) {
        industry = { ...INDUSTRIES[t], from: t };
        if (INDUSTRIES[t].harmony && !harmony) harmony = { mode: INDUSTRIES[t].harmony!, from: t };
        note(i, 'industry', `suggests hue ${INDUSTRIES[t].h}°`);
      } else {
        note(i, 'industry', `recognised, not used — “${industry.from}” came first`);
      }
      return;
    }
  });

  // Role words count as interpreted when they stand in the prompt at all.
  tokens.forEach((t, i) => {
    if (used.has(i)) return;
    if (ACCENT_WORDS.has(t)) note(i, 'role', accentHue !== null ? 'accent seed uses the named hue' : 'accent seed derived from harmony');
    else if (NEUTRAL_WORDS.has(t)) note(i, 'role', neutralHue !== null ? 'neutral seed uses the named tint' : 'low-chroma neutral seed');
    else if (PRIMARY_WORDS.has(t)) used.add(i);
  });

  const unmatched = [...new Set(tokens.filter((t, i) => !used.has(i) && !STOPWORDS.has(t) && t.length > 2))];

  // Dominant signal for the primary hue: named hue > industry > temperature > mood.
  const p = primary as (HueEntry & { from: string }) | null;
  const ind = industry as (HueEntry & { from: string }) | null;
  const temp = temperature as { h: number; from: string } | null;
  const mh = moodHue as { h: number; from: string } | null;
  const source: HueEntry | null = p ?? ind ?? (temp ? { h: temp.h } : null) ?? (mh ? { h: mh.h } : null);

  // Annotate signals that lost to a stronger one, so the user can see what was decisive.
  if (p) {
    for (const term of interpreted) {
      if (term.category === 'industry' && term.effect.startsWith('suggests')) term.effect = `recognised — hue already set by “${p.from}”`;
    }
  }
  if (p && temp) {
    // A temperature word nudges a named hue slightly instead of replacing it.
    const warm = temp.h < 180;
    for (const term of interpreted) {
      if (term.category === 'temperature' && term.term === temp.from) term.effect = `nudges “${p.from}” ${warm ? 'warmer' : 'cooler'} by 6°`;
    }
  }

  const hasSignal = interpreted.length > 0 && (source !== null || accentHue !== null || chroma !== 1 || lightness !== 0);
  const baseHue = source?.h ?? 258;
  let hue = baseHue;
  if (p && temp) {
    const warm = temp.h < 180;
    // Move toward the warm (≈60°) or cool (≈240°) pole along the shorter arc.
    const pole = warm ? 60 : 240;
    const diff = ((pole - hue + 540) % 360) - 180;
    hue = (hue + Math.sign(diff) * Math.min(6, Math.abs(diff)) + 360) % 360;
  }

  const anchor: Oklch = {
    l: clamp((source?.l ?? 0.58) + lightness, 0.28, 0.9),
    c: clamp((source?.c ?? 0.17) * chroma, 0.02, 0.32),
    h: hue,
  };

  const h = harmony as { mode: HarmonyMode; from: string } | null;
  return {
    status: !hasSignal ? 'empty' : unmatched.length > 0 ? 'partial' : 'success',
    interpreted,
    unmatched,
    anchor,
    harmony: h?.mode ?? 'analogous',
    chromaBias: clamp(accentChroma, 0.5, 1.5),
    lightnessBias: clamp(lightness * 0.5, -0.1, 0.1),
    accentHue,
    neutralHue,
  };
}
