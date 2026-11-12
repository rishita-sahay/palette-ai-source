import { clampChroma, converter, formatHex, inGamut, parse, type Oklch as CuloriOklch } from 'culori';
import type { Colour, Oklch } from '@/types';

// All colour maths goes through Culori. Nothing in this folder touches the UI.

const toOklchC = converter('oklch');
const toRgbC = converter('rgb');
const toHslC = converter('hsl');
const inSrgbStrict = inGamut('rgb');
/** Colours sitting exactly on the sRGB boundary (e.g. #00FFFF) can miss by float error; allow a hair of tolerance. */
const BOUNDARY_TOLERANCE = 1e-4;
function inSrgb(c: CuloriOklch): boolean {
  if (inSrgbStrict(c)) return true;
  const { r, g, b } = toRgbC(c);
  return [r, g, b].every((v) => v >= -BOUNDARY_TOLERANCE && v <= 1 + BOUNDARY_TOLERANCE);
}

/** Below this chroma a colour is treated as achromatic and its hue is stored as null. */
export const ACHROMATIC_CHROMA = 0.0005;
const GAMUT_EPSILON = 0.0005;

export type ParseResult = { ok: true; oklch: Oklch } | { ok: false; error: string };

/**
 * Parses HEX, rgb(), hsl(), oklch() and CSS named colours.
 * Unparseable input is rejected with a message — never silently coerced.
 */
export function parseColour(input: string): ParseResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'Enter a colour, e.g. #1C6BEC, rgb(28 107 236) or hsl(217 85% 52%).' };
  // Accept bare hex without the leading hash ("1c6bec").
  const candidate = /^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw) ? `#${raw}` : raw;
  const parsed = parse(candidate);
  if (!parsed) return { ok: false, error: `“${raw}” isn’t a colour we can read. Try HEX, rgb() or hsl().` };
  const o = toOklchC(parsed);
  if (!o || !Number.isFinite(o.l) || !Number.isFinite(o.c)) {
    return { ok: false, error: `“${raw}” didn’t convert to a valid colour.` };
  }
  return { ok: true, oklch: normaliseOklch({ l: o.l, c: o.c, h: o.h ?? null }) };
}

export function normaliseOklch(o: Oklch): Oklch {
  const l = Math.min(1, Math.max(0, o.l));
  const c = Math.max(0, o.c);
  const achromatic = c < ACHROMATIC_CHROMA || o.h === null || !Number.isFinite(o.h);
  return { l, c: achromatic && c < ACHROMATIC_CHROMA ? 0 : c, h: achromatic ? null : wrapHue(o.h as number) };
}

export function wrapHue(h: number): number {
  return ((h % 360) + 360) % 360;
}

function toCulori(o: Oklch): CuloriOklch {
  return { mode: 'oklch', l: o.l, c: o.c, h: o.h ?? undefined };
}

export interface GamutResult {
  oklch: Oklch;
  mapped: boolean;
}

/**
 * Brings a colour into sRGB by reducing chroma only (Culori clampChroma), holding
 * lightness and hue. This is gamut mapping, not channel clipping (CS-004).
 */
export function mapToSrgb(o: Oklch): GamutResult {
  const input = normaliseOklch(o);
  const c = toCulori(input);
  if (inSrgb(c)) return { oklch: input, mapped: false };
  const clamped = clampChroma(c, 'oklch', 'rgb') as CuloriOklch;
  const out = normaliseOklch({ l: input.l, c: clamped.c ?? 0, h: input.h });
  return { oklch: out, mapped: input.c - out.c > GAMUT_EPSILON };
}

export function oklchToHex(o: Oklch): string {
  const { oklch } = mapToSrgb(o);
  const rgb = toRgbC(toCulori(oklch));
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  const hex = formatHex({ mode: 'rgb', r: clamp01(rgb.r), g: clamp01(rgb.g), b: clamp01(rgb.b) });
  return hex.toUpperCase();
}

export function hexToOklch(hex: string): Oklch {
  const r = parseColour(hex);
  if (!r.ok) throw new Error(r.error);
  return r.oklch;
}

export function oklchToRgb(o: Oklch): { r: number; g: number; b: number } {
  const rgb = toRgbC(parse(oklchToHex(o))!);
  return { r: Math.round(rgb.r * 255), g: Math.round(rgb.g * 255), b: Math.round(rgb.b * 255) };
}

export function oklchToHsl(o: Oklch): { h: number; s: number; l: number } {
  const hsl = toHslC(parse(oklchToHex(o))!);
  return {
    h: Math.round(wrapHue(hsl.h ?? 0)),
    s: Math.round((hsl.s ?? 0) * 100),
    l: Math.round(hsl.l * 100),
  };
}

/**
 * Builds the stored Colour record from a requested OKLCH value.
 * The canonical value is the gamut-mapped OKLCH at full precision; HEX/RGB/HSL are derived.
 */
export function makeColour(
  requested: Oklch,
  meta: { id: string; name?: string; locked?: boolean; familyId?: string },
): Colour {
  const { oklch, mapped } = mapToSrgb(requested);
  const colour: Colour = {
    id: meta.id,
    hex: oklchToHex(oklch),
    rgb: oklchToRgb(oklch),
    hsl: oklchToHsl(oklch),
    oklch,
    locked: meta.locked ?? false,
  };
  if (meta.name !== undefined) colour.name = meta.name;
  if (meta.familyId !== undefined) colour.familyId = meta.familyId;
  if (mapped) colour.gamutMapped = true;
  return colour;
}

// ---- display / export formatting (rounding happens only here) ----

/** OKLCH precision used everywhere we print: L 2 dp (as %), C 4 dp, H 2 dp. */
export function formatOklch(o: Oklch): string {
  const l = (o.l * 100).toFixed(2).replace(/\.?0+$/, '');
  const c = o.c.toFixed(4).replace(/\.?0+$/, '') || '0';
  const h = o.h === null ? '0' : o.h.toFixed(2).replace(/\.?0+$/, '');
  return `oklch(${l}% ${c} ${h})`;
}

export function formatRgb(rgb: { r: number; g: number; b: number }): string {
  return `rgb(${rgb.r} ${rgb.g} ${rgb.b})`;
}

export function formatHsl(hsl: { h: number; s: number; l: number }): string {
  return `hsl(${hsl.h} ${hsl.s}% ${hsl.l}%)`;
}

/** Smallest angular distance between two hues, in degrees. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(wrapHue(a) - wrapHue(b));
  return d > 180 ? 360 - d : d;
}
