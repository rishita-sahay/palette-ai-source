import type { HarmonyMode, Oklch, Palette, PaletteColour, SeedRole } from '@/types';
import { makeColour, wrapHue } from './convert';
import { HARMONY_OFFSETS } from './harmony';

/**
 * Palette seeds from an anchor colour + harmony. Every seed is a pure function of
 * (anchor, harmony, biases, slot, roll), so the same inputs always give the same palette.
 */

export const MIN_SEEDS = 3;
export const MAX_SEEDS = 8;
export const DEFAULT_SEEDS = 5;

const ACCENT_NAMES = ['accent', 'secondary', 'tertiary', 'highlight', 'support', 'extra'];

/** Role names for n seeds: primary first, neutral last, harmony-derived accents between. */
export function slotNames(count: number): string[] {
  const accents = count - 2;
  const middle = ACCENT_NAMES.slice(0, accents);
  return ['primary', ...middle, 'neutral'];
}

// Small deterministic PRNG (mulberry32) seeded from a string hash.
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export interface SeedParams {
  anchor: Oklch;
  harmony: HarmonyMode;
  chromaBias: number;
  lightnessBias: number;
  roll: number;
  /** Optional explicit hue for the first accent / the neutral tint (set by prompt keywords). */
  accentHue?: number | null;
  neutralHue?: number | null;
  /** Optional, default off: hue ranges no seed may land in (user exclusions such as "no orange"). */
  excludedHues?: [number, number][];
  /** Optional, default 0: accents alternate lighter/darker than the anchor by this much (contrast). */
  accentLightnessOffset?: number;
}

function inHueRange(h: number, [from, to]: [number, number]): boolean {
  return from <= to ? h >= from && h <= to : h >= from || h <= to;
}

/** Nudges a hue to the nearest point outside every excluded range. No ranges → returns the hue untouched. */
function avoidExcluded(h: number | null, ranges?: [number, number][]): number | null {
  if (h === null || !ranges || ranges.length === 0) return h;
  const blocked = (x: number) => ranges.some((r) => inHueRange(wrapHue(x), r));
  if (!blocked(h)) return h;
  // Land clearly outside the range (10° of clearance), not on its edge.
  const tooClose = (x: number) => blocked(x) || blocked(x + 10) || blocked(x - 10);
  for (let step = 2; step <= 180; step += 2) {
    if (!tooClose(h + step)) return wrapHue(h + step);
    if (!tooClose(h - step)) return wrapHue(h - step);
  }
  return h;
}

/** The requested OKLCH for one slot. `accentIndex` is 0-based among the accent slots. */
export function seedFor(role: SeedRole, accentIndex: number, p: SeedParams): Oklch {
  const { anchor } = p;
  const rand = mulberry32(
    hashString(`${anchor.l.toFixed(4)}|${anchor.c.toFixed(4)}|${anchor.h ?? 'x'}|${p.harmony}|${role}|${accentIndex}|${p.roll}`),
  );
  // roll 0 is the "clean" harmony; later rolls explore around it.
  const j = (range: number) => (p.roll === 0 ? 0 : (rand() * 2 - 1) * range);
  const baseHue = anchor.h ?? 0;

  if (role === 'primary') {
    if (p.roll === 0) return anchor;
    return {
      l: clamp(anchor.l + j(0.06), 0.3, 0.85),
      c: clamp(anchor.c + j(0.03), 0, 0.37),
      h: avoidExcluded(anchor.h === null ? null : wrapHue(baseHue + j(10)), p.excludedHues),
    };
  }

  if (role === 'neutral') {
    const tint = p.neutralHue ?? anchor.h;
    return {
      l: clamp(0.56 + j(0.03), 0.4, 0.7),
      c: tint === null || tint === undefined ? 0 : clamp(0.014 + j(0.006), 0.004, 0.03),
      h: avoidExcluded(tint ?? null, p.excludedHues),
    };
  }

  // Accent slots walk the harmony's hue offsets; once exhausted they repeat with a lightness step.
  const offsets = HARMONY_OFFSETS[p.harmony];
  const offset = offsets[accentIndex % offsets.length];
  const lap = Math.floor(accentIndex / offsets.length);
  const mono = p.harmony === 'monochromatic';
  const chromatic = anchor.h !== null;
  const lStep = mono ? [0.14, -0.14, 0.26, -0.24, 0.07, -0.07][accentIndex % 6] : lap === 0 ? 0 : lap % 2 === 1 ? 0.12 : -0.12;
  const cFactor = mono ? [0.7, 0.85, 0.45, 0.6, 0.9, 0.9][accentIndex % 6] : 0.92;
  const hue = accentIndex === 0 && p.accentHue !== null && p.accentHue !== undefined ? p.accentHue : wrapHue(baseHue + offset);
  const baseC = chromatic ? anchor.c : 0.12; // an achromatic anchor still yields usable accents
  const contrastOffset = (p.accentLightnessOffset ?? 0) * (accentIndex % 2 === 0 ? 1 : -1);
  return {
    l: clamp(anchor.l + lStep + contrastOffset + p.lightnessBias + j(0.05), 0.32, 0.9),
    c: clamp(baseC * cFactor * p.chromaBias + j(0.025), 0.02, 0.37),
    h: avoidExcluded(wrapHue(hue + j(8)), p.excludedHues),
  };
}

function roleOf(slot: number, count: number): { role: SeedRole; accentIndex: number } {
  if (slot === 0) return { role: 'primary', accentIndex: 0 };
  if (slot === count - 1) return { role: 'neutral', accentIndex: 0 };
  return { role: 'accent', accentIndex: slot - 1 };
}

export interface BuildPaletteInput extends SeedParams {
  count: number;
  createId: (prefix: string) => string;
  /** Lock the anchor colour so regenerating never moves the colour the user typed. */
  lockAnchor?: boolean;
}

export function buildPaletteColours(input: BuildPaletteInput): PaletteColour[] {
  const count = clamp(Math.round(input.count), MIN_SEEDS, MAX_SEEDS);
  const names = slotNames(count);
  return names.map((name, slot) => {
    const { role, accentIndex } = roleOf(slot, count);
    const colour = makeColour(seedFor(role, accentIndex, input), {
      id: input.createId('colour'),
      name,
      locked: slot === 0 && !!input.lockAnchor,
    });
    return { ...colour, role, accentIndex };
  });
}

export function seedParamsOf(palette: Palette): SeedParams {
  return {
    anchor: palette.anchor,
    harmony: palette.harmony,
    chromaBias: palette.chromaBias,
    lightnessBias: palette.lightnessBias,
    roll: palette.roll,
    accentHue: palette.accentHue,
    neutralHue: palette.neutralHue,
    excludedHues: palette.excludedHues,
    accentLightnessOffset: palette.accentLightnessOffset,
  };
}

/** Re-derives every unlocked colour for the palette's current harmony + roll. Locked colours are returned as-is. */
export function rederiveUnlocked(palette: Palette): PaletteColour[] {
  const params = seedParamsOf(palette);
  return palette.colours.map((colour) => {
    if (colour.locked) return colour;
    const next = makeColour(seedFor(colour.role, colour.accentIndex, params), {
      id: colour.id,
      name: colour.name,
      locked: false,
      familyId: colour.familyId,
    });
    return { ...next, role: colour.role, accentIndex: colour.accentIndex };
  });
}

/** Conventional feedback hues; lightness/chroma sit near a 500–600 step. */
export const FEEDBACK_SEEDS: Record<'success' | 'warning' | 'error' | 'info', Oklch> = {
  success: { l: 0.63, c: 0.16, h: 152 },
  warning: { l: 0.77, c: 0.16, h: 75 },
  error: { l: 0.6, c: 0.21, h: 26 },
  info: { l: 0.64, c: 0.15, h: 240 },
};
