import type { Oklch } from '@/types';
import { contrastRatio } from '@/lib/contrast';
import { makeColour } from './convert';

/**
 * Dark-theme adaptation. Every dark colour is derived in OKLCH from the palette's own colours:
 * hue is kept, lightness and chroma are re-set for the job the colour does on a dark surface, and
 * each result is checked against WCAG AA and nudged until it passes. Nothing here is a fixed palette.
 *
 * The strategy (how deep, how much elevation, how much chroma to keep) is an input. The
 * interpretation layer supplies it from the AI reading of a brief; the maths lives here.
 */

export interface DarkStrategy {
  /** OKLCH lightness of the page background (lower is deeper). */
  depth: number;
  /** Lightness gained by each elevation level: background → surface → border. */
  elevation: number;
  /** Share of a brand colour's chroma kept on dark, where full chroma tends to vibrate. */
  chromaKeep: number;
  /** Most chroma a background or surface may carry, so the neutrals keep a hint of the palette's hue. */
  tint: number;
  basis: 'default' | 'brief';
}

export const DEFAULT_DARK_STRATEGY: DarkStrategy = { depth: 0.165, elevation: 0.05, chromaKeep: 0.9, tint: 0.014, basis: 'default' };
export const AA = 4.5;

export interface Adapted {
  oklch: Oklch;
  hex: string;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
/** Gamut-maps through the engine, so the stored OKLCH is the colour actually shown. */
const settle = (o: Oklch): Adapted => {
  const colour = makeColour({ l: clamp(o.l, 0, 1), c: Math.max(0, o.c), h: o.h }, { id: 'dark' });
  return { oklch: colour.oklch, hex: colour.hex };
};
const worst = (hex: string, against: string[]) => Math.min(...against.map((other) => contrastRatio(hex, other)));

/**
 * Moves a colour's lightness in `direction` until it reaches `target` against every colour in
 * `against`. If lightness runs out first, chroma is given up a little at a time. Hue never changes.
 */
export function ensureContrast(colour: Oklch, against: string[], direction: 1 | -1, target = AA): Adapted & { ratio: number; refined: boolean } {
  let o = { ...colour };
  let out = settle(o);
  let ratio = worst(out.hex, against);
  let refined = false;
  for (let i = 0; i < 120 && ratio < target; i++) {
    refined = true;
    const atLimit = direction === 1 ? o.l >= 0.985 : o.l <= 0.03;
    if (!atLimit) o = { ...o, l: clamp(o.l + 0.01 * direction, 0.03, 0.985) };
    else if (o.c > 0.003) o = { ...o, c: o.c * 0.85 };
    else break;
    out = settle(o);
    ratio = worst(out.hex, against);
  }
  return { ...out, ratio, refined };
}

export interface DarkGround {
  background: Adapted;
  surface: Adapted;
  border: Adapted;
  text: Adapted;
  muted: Adapted;
}

/** Backgrounds, surfaces, borders and text: the neutral's hue, stepped in lightness so each level reads as its own layer. */
export function darkGround(neutral: Oklch, s: DarkStrategy = DEFAULT_DARK_STRATEGY): DarkGround {
  const h = neutral.h;
  const c = Math.min(neutral.c, s.tint);
  const background = settle({ l: s.depth, c, h });
  const surface = settle({ l: s.depth + s.elevation, c: Math.min(neutral.c, s.tint * 1.15), h });
  const border = settle({ l: s.depth + s.elevation + 0.11, c: Math.min(neutral.c, s.tint * 1.3), h });
  const grounds = [background.hex, surface.hex];
  const text = ensureContrast({ l: 0.95, c: Math.min(neutral.c, 0.012), h }, grounds, 1, 7);
  const muted = ensureContrast({ l: 0.72, c: Math.min(neutral.c * 1.2, 0.022), h }, grounds, 1);
  return { background, surface, border, text, muted };
}

/**
 * A brand colour used as a solid fill on dark. Deep colours are lifted so they don't sink into the
 * background, bright ones are held back a little, and chroma is trimmed. The text colour on it is a
 * tinted near-black or near-white, whichever reads better; the fill then moves until that pair passes AA.
 */
export function darkFill(source: Oklch, s: DarkStrategy = DEFAULT_DARK_STRATEGY): { fill: Adapted; on: Adapted; ratio: number } {
  const start: Oklch = { l: clamp(0.7 + (source.l - 0.6) * 0.35, 0.62, 0.8), c: source.c * s.chromaKeep, h: source.h };
  const dark = settle({ l: 0.17, c: Math.min(source.c * 0.3, 0.035), h: source.h });
  const light = settle({ l: 0.985, c: Math.min(source.c * 0.05, 0.006), h: source.h });
  const first = settle(start);
  const useDark = contrastRatio(dark.hex, first.hex) >= contrastRatio(light.hex, first.hex);
  const on = useDark ? dark : light;
  // Dark text wants a lighter fill; light text wants a darker one.
  const fill = ensureContrast(start, [on.hex], useDark ? 1 : -1);
  return { fill: { oklch: fill.oklch, hex: fill.hex }, on, ratio: fill.ratio };
}

/** A quiet tinted panel in the brand hue, one layer above the surface, with readable text for it. */
export function darkTint(source: Oklch, s: DarkStrategy = DEFAULT_DARK_STRATEGY): { soft: Adapted; on: Adapted } {
  const soft = settle({ l: s.depth + s.elevation + 0.07, c: Math.min(source.c * 0.45, 0.085), h: source.h });
  const on = ensureContrast({ l: 0.87, c: Math.min(source.c * 0.55, 0.11), h: source.h }, [soft.hex], 1);
  return { soft, on: { oklch: on.oklch, hex: on.hex } };
}

/** Status colours as text and icons on dark: same hue (so green still means success), lighter and a little calmer. */
export function darkStatus(source: Oklch, grounds: string[], s: DarkStrategy = DEFAULT_DARK_STRATEGY): Adapted {
  const out = ensureContrast({ l: 0.78, c: Math.min(source.c * s.chromaKeep, 0.17), h: source.h }, grounds, 1);
  return { oklch: out.oklch, hex: out.hex };
}
