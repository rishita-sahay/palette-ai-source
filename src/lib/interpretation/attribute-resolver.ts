import { lookupColour, type EvidenceTier, type HueRange } from '@/lib/vibe-db';
import type { HarmonyMode } from '@/types';
import type { DescriptorResolution } from './descriptor-resolver';
import type { AttributeName, Interpretation, ResolutionHints, Temperature } from './schema';

/**
 * Step 3 of the pipeline: turn the validated interpretation + database matches into final
 * visual targets. Pure and deterministic.
 *
 * Priority (highest first):
 *   1. explicit colour instructions and exclusions
 *   2. visual requirements the user stated outright (hints.explicit_attributes)
 *   3. the model's reading of the whole brief in context
 *   4. emotion / mood associations from the database
 *   5. sensory associations from the database
 *   6. engine defaults
 * Database associations only ever nudge a value the user did not state, and only when they
 * roughly agree with the contextual reading. When they disagree, context wins — values are
 * not averaged across a contradiction.
 */

export interface TargetSource {
  /** Where the final value came from, in the user's terms. */
  basis: 'stated' | 'context' | 'context+associations' | 'associations' | 'default';
  tier: EvidenceTier;
  note?: string;
}

export interface VisualTargets {
  temperature: Temperature;
  lightness: number;
  chroma: number;
  contrast: number;
  primaryHue: number;
  accentHue: number | null;
  excludedHues: HueRange[];
  harmony: HarmonyMode;
  sources: Record<AttributeName, TargetSource>;
  /** Colour names that were understood and applied. */
  appliedColours: string[];
  appliedExclusions: string[];
  /** Constraints we understood but could not turn into an engine setting. Always shown to the user. */
  unapplied: string[];
  /** What changed because of an exclusion or an "avoid", in plain language. */
  adjustments: string[];
}

const AGREE_WITHIN = 0.3; // association and context are "compatible" inside this distance
const ASSOCIATION_SHARE = 0.3; // how far a compatible association may pull an unstated value
const AVOID_MARGIN = 0.12;
/** Degrees of clear space kept between a moved hue and an excluded range. */
export const EXCLUSION_CLEARANCE = 10;

export const TEMPERATURE_SCALAR: Record<Temperature, number> = { warm: 1, 'warm-neutral': 0.5, neutral: 0, 'cool-neutral': -0.5, cool: -1 };
const TEMPERATURE_DEFAULT_HUE: Record<Temperature, number> = { warm: 45, 'warm-neutral': 75, neutral: 255, 'cool-neutral': 228, cool: 250 };

const wrap = (h: number) => ((h % 360) + 360) % 360;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
export const inRange = (h: number, [from, to]: HueRange) => (from <= to ? h >= from && h <= to : h >= from || h <= to);
const isWarmHue = (h: number) => h >= 330 || h <= 110;
const isCoolHue = (h: number) => h >= 195 && h <= 300;

function hueFitsTemperature(h: number, t: Temperature): boolean {
  if (t === 'warm') return !isCoolHue(h);
  if (t === 'cool') return !isWarmHue(h);
  return true;
}

/** Moves a hue out of every excluded range, to the nearest edge that still fits the temperature. */
export function escapeExclusions(h: number, ranges: HueRange[], temperature: Temperature = 'neutral'): number {
  const blocked = (x: number) => ranges.some((r) => inRange(wrap(x), r));
  if (!blocked(h)) return wrap(h);
  // Land clearly outside, not on the edge: a hue 1° short of "orange" still reads as orange.
  const tooClose = (x: number) => blocked(x) || blocked(x + EXCLUSION_CLEARANCE) || blocked(x - EXCLUSION_CLEARANCE);
  let best: { hue: number; cost: number } | null = null;
  for (let step = 2; step <= 180; step += 2) {
    for (const candidate of [wrap(h + step), wrap(h - step)]) {
      if (tooClose(candidate)) continue;
      const cost = step + (hueFitsTemperature(candidate, temperature) ? 0 : 60);
      if (!best || cost < best.cost) best = { hue: candidate, cost };
    }
    if (best && best.cost <= step) break;
  }
  return best ? best.hue : wrap(h);
}

type Scalar = 'lightness' | 'chroma' | 'contrast';

export function resolveAttributes(interpretation: Interpretation, hints: ResolutionHints, descriptors: DescriptorResolution): VisualTargets {
  const v = interpretation.visual_attributes;
  const explicit = new Set<AttributeName>(hints.explicit_attributes);
  const adjustments: string[] = [];
  const unapplied: string[] = [];
  const sources = {} as Record<AttributeName, TargetSource>;

  // ---- lightness / chroma / contrast ----
  const scalar = (name: Scalar): number => {
    const context = v[name];
    if (explicit.has(name)) {
      sources[name] = { basis: 'stated', tier: 'stated' };
      return context;
    }
    let sum = 0, weight = 0, contradicted = false;
    for (const d of descriptors.resolved) {
      const prior = d.record[name];
      if (prior === null) continue;
      // Checked per descriptor, before any averaging: two opposite associations must not cancel
      // out into a middling value that then looks "compatible".
      if (Math.abs(prior - context) > AGREE_WITHIN) contradicted = true;
      sum += prior * d.weight;
      weight += d.weight;
    }
    if (weight === 0) {
      sources[name] = { basis: 'context', tier: 'inferred' };
      return context;
    }
    if (contradicted) {
      sources[name] = { basis: 'context', tier: 'inferred', note: 'associations pointed elsewhere; the reading of the full brief was kept' };
      return context;
    }
    sources[name] = { basis: 'context+associations', tier: 'inferred' };
    return clamp01(context * (1 - ASSOCIATION_SHARE) + (sum / weight) * ASSOCIATION_SHARE);
  };
  let lightness = scalar('lightness');
  let chroma = scalar('chroma');
  let contrast = scalar('contrast');

  // "Not childish", "not boring": keep clear of what the avoided descriptor looks like, unless the user fixed the value.
  for (const avoid of descriptors.avoided) {
    const push = (name: Scalar, value: number): number => {
      const prior = avoid.record[name];
      if (prior === null || explicit.has(name) || Math.abs(value - prior) >= AVOID_MARGIN) return value;
      // Move further in the direction the value already sits, so "bold, not childish" stays bold.
      const moved = clamp01(prior + (value >= prior ? AVOID_MARGIN : -AVOID_MARGIN));
      adjustments.push(`Kept ${name} away from “${avoid.term}”.`);
      return moved;
    };
    lightness = push('lightness', lightness);
    chroma = push('chroma', chroma);
    contrast = push('contrast', contrast);
  }

  // ---- temperature ----
  const temperature = v.temperature;
  sources.temperature = explicit.has('temperature') ? { basis: 'stated', tier: 'stated' } : { basis: 'context', tier: 'inferred' };

  // ---- exclusions (priority 1) ----
  const excludedHues: HueRange[] = [];
  const appliedExclusions: string[] = [];
  for (const name of [...v.hue_exclusions, ...interpretation.negative_constraints]) {
    const colour = lookupColour(name);
    const isListedExclusion = v.hue_exclusions.includes(name);
    if (!colour) {
      if (isListedExclusion) unapplied.push(`Couldn’t map the exclusion “${name}” to a colour range.`);
      continue;
    }
    if (colour.kind === 'achromatic') {
      if (isListedExclusion) unapplied.push(`“No ${colour.name}” can’t be enforced yet — neutrals are always generated.`);
      continue;
    }
    if (!appliedExclusions.includes(colour.name)) {
      excludedHues.push(colour.range);
      appliedExclusions.push(colour.name);
    }
  }

  // ---- hue (priority 1 → 6) ----
  const appliedColours: string[] = [];
  const wanted: { hue: number; name: string; stated: boolean }[] = [];
  const statedNames = interpretation.explicit_colour_preferences;
  for (const name of [...statedNames, ...v.hue_preferences]) {
    const colour = lookupColour(name);
    if (!colour) {
      unapplied.push(`Didn’t recognise the colour “${name}”.`);
      continue;
    }
    if (colour.kind === 'achromatic') {
      if (!appliedColours.includes(colour.name)) unapplied.push(`“${colour.name}” was read as a request for neutrals; the neutral seed covers it.`);
      continue;
    }
    if (wanted.some((w) => Math.abs(((w.hue - colour.hue + 540) % 360) - 180) < 12)) continue;
    wanted.push({ hue: colour.hue, name: colour.name, stated: statedNames.includes(name) });
  }

  let primaryHue: number;
  let accentHue: number | null = null;
  if (wanted.length > 0) {
    primaryHue = wanted[0].hue;
    accentHue = wanted[1]?.hue ?? null;
    appliedColours.push(...wanted.slice(0, 2).map((w) => w.name));
    sources.hue = wanted[0].stated ? { basis: 'stated', tier: 'stated' } : { basis: 'context', tier: 'inferred' };
  } else {
    // Highest-weight association whose hue does not fight the stated temperature.
    // A leaning temperature (warm-neutral / cool-neutral) halves the pull of hues on the other side,
    // and a research-backed hue outranks an inferred one of similar weight.
    const lean = TEMPERATURE_SCALAR[temperature];
    const score = (d: (typeof descriptors.resolved)[number]) => {
      const h = d.record.hue as number;
      const against = (lean > 0 && isCoolHue(h)) || (lean < 0 && isWarmHue(h));
      return d.weight * (against ? 0.5 : 1) * (d.record.hueTier === 'research' ? 1.5 : 1);
    };
    const candidate = [...descriptors.resolved]
      .filter((d) => d.record.hue !== null && hueFitsTemperature(d.record.hue, temperature))
      .sort((a, b) => score(b) - score(a))[0];
    if (candidate) {
      primaryHue = candidate.record.hue as number;
      sources.hue = { basis: 'associations', tier: candidate.record.hueTier ?? candidate.record.tier, note: `from “${candidate.term}”` };
    } else {
      primaryHue = TEMPERATURE_DEFAULT_HUE[temperature];
      sources.hue = { basis: 'default', tier: 'inferred', note: `typical ${temperature} hue` };
    }
  }

  const before = primaryHue;
  primaryHue = escapeExclusions(primaryHue, excludedHues, temperature);
  if (Math.abs(primaryHue - before) > 0.5) adjustments.push(`Moved the main hue out of the excluded range (${appliedExclusions.join(', ')}) while keeping it ${temperature}.`);
  if (accentHue !== null) accentHue = escapeExclusions(accentHue, excludedHues, temperature);

  // ---- harmony: more contrast and energy → hues further apart ----
  const arousal = interpretation.emotional_dimensions.arousal;
  const harmony: HarmonyMode =
    contrast >= 0.72 ? (arousal >= 0.7 ? 'triadic' : 'complementary')
    : contrast >= 0.56 ? 'split-complementary'
    : chroma <= 0.18 && contrast <= 0.34 ? 'monochromatic'
    : 'analogous';

  return {
    temperature, lightness, chroma, contrast, primaryHue, accentHue, excludedHues, harmony, sources,
    appliedColours, appliedExclusions, unapplied, adjustments,
  };
}
