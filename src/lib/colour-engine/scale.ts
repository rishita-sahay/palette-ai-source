import { SCALE_STEPS, type Colour, type ColourScale, type GenerationSettings, type LightnessCurve, type Oklch, type ScaleStep } from '@/types';
import { hexToOklch, hueDistance, makeColour, wrapHue } from './convert';

/**
 * Tonal scale generation (PRD §18). Principled OKLCH transforms only:
 *  1. target lightness per step from a named curve, re-anchored so the base keeps its exact value
 *  2. chroma scaled per step and reduced toward both extremes
 *  3. hue held (optional bounded shift)
 *  4. each step gamut-mapped to sRGB by chroma reduction
 * Deterministic: identical base + settings always produce the identical scale.
 */

export const DEFAULT_SETTINGS: GenerationSettings = {
  lightnessCurve: 'balanced',
  chromaScale: 1,
  hueShift: 0,
  gamut: 'srgb',
};

/** Hue drift bound across a ramp when no hue shift is enabled (CS-002). */
export const HUE_DRIFT_BOUND = 5;
export const MAX_HUE_SHIFT = 30;
/** Hue is not meaningful below this chroma, so those steps are left out of drift measurement. */
const HUE_MEASURE_MIN_CHROMA = 0.02;

/** Target OKLCH lightness for steps 50 → 950. Extremes are slightly compressed. */
export const LIGHTNESS_CURVES: Record<LightnessCurve, readonly number[]> = {
  balanced: [0.975, 0.94, 0.885, 0.815, 0.725, 0.63, 0.545, 0.46, 0.385, 0.315, 0.235],
  linear: [0.97, 0.9, 0.826, 0.752, 0.678, 0.604, 0.53, 0.456, 0.382, 0.308, 0.234],
  'high-contrast': [0.985, 0.955, 0.905, 0.83, 0.725, 0.61, 0.51, 0.415, 0.325, 0.245, 0.165],
};

export const CURVE_LABELS: Record<LightnessCurve, string> = {
  balanced: 'Balanced',
  linear: 'Linear',
  'high-contrast': 'High contrast',
};

/** Relative chroma per step: full in the mid-tones, reduced at both ends. */
const CHROMA_ENVELOPE = [0.1, 0.2, 0.4, 0.66, 0.88, 1, 1, 0.92, 0.8, 0.64, 0.46] as const;
/** A pale or very dark base may gain chroma toward the mid-tones, but only this much. */
const MAX_CHROMA_GAIN = 3;

function nearestStepIndex(l: number, curve: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < curve.length; i++) {
    if (Math.abs(curve[i] - l) < Math.abs(curve[best] - l)) best = i;
  }
  return best;
}

/** Lightness per step, remapped piecewise so the anchor step equals the base lightness exactly. */
function lightnessTargets(baseL: number, curve: readonly number[], anchor: number): number[] {
  const last = curve.length - 1;
  const top = Math.max(curve[0], Math.min(0.995, baseL + 0.012 * anchor));
  const bottom = Math.min(curve[last], Math.max(0.03, baseL - 0.012 * (last - anchor)));
  return curve.map((target, i) => {
    if (i === anchor) return baseL;
    if (i < anchor) {
      const t = (target - curve[anchor]) / (curve[0] - curve[anchor]); // 0 at anchor → 1 at step 50
      return baseL + t * (top - baseL);
    }
    const t = (curve[anchor] - target) / (curve[anchor] - curve[last]); // 0 at anchor → 1 at step 950
    return baseL - t * (baseL - bottom);
  });
}

export interface ShadeTarget {
  step: ScaleStep;
  oklch: Oklch;
}

export function computeShadeTargets(base: Oklch, settings: GenerationSettings): { anchorStep: ScaleStep; targets: ShadeTarget[] } {
  const curve = LIGHTNESS_CURVES[settings.lightnessCurve] ?? LIGHTNESS_CURVES.balanced;
  const anchor = nearestStepIndex(base.l, curve);
  const ls = lightnessTargets(base.l, curve, anchor);
  const chromaScale = Math.max(0, settings.chromaScale);
  const hueShift = Math.max(-MAX_HUE_SHIFT, Math.min(MAX_HUE_SHIFT, settings.hueShift));

  const targets = SCALE_STEPS.map((step, i) => {
    const gain = Math.min(CHROMA_ENVELOPE[i] / CHROMA_ENVELOPE[anchor], MAX_CHROMA_GAIN);
    const c = base.c * gain * chromaScale;
    // Hue shift is spread across the ramp and is zero at the anchor step.
    const h = base.h === null ? null : wrapHue(base.h + (hueShift * (i - anchor)) / (SCALE_STEPS.length - 1));
    return { step, oklch: { l: ls[i], c, h } };
  });
  return { anchorStep: SCALE_STEPS[anchor], targets };
}

export interface GenerateScaleInput {
  id: string;
  familyName: string;
  base: Colour;
  settings?: GenerationSettings;
  /** Existing scale: its locked shades are carried over untouched. */
  previous?: ColourScale;
  /** When true, locked shades are regenerated too ("regenerate full scale"). */
  ignoreLocks?: boolean;
  createId: (prefix: string) => string;
}

export function generateScale(input: GenerateScaleInput): ColourScale {
  const settings = input.settings ?? input.previous?.generationSettings ?? DEFAULT_SETTINGS;
  const { anchorStep, targets } = computeShadeTargets(input.base.oklch, settings);
  const shades = {} as Record<ScaleStep, Colour>;
  for (const { step, oklch } of targets) {
    const prev = input.previous?.shades[step];
    if (prev?.locked && !input.ignoreLocks) {
      shades[step] = prev;
      continue;
    }
    shades[step] = makeColour(oklch, {
      id: prev?.id ?? input.createId('shade'),
      name: `${input.familyName}-${step}`,
      familyId: input.id,
      locked: false,
    });
  }
  return {
    id: input.id,
    familyName: input.familyName,
    baseColourId: input.base.id,
    base: input.base,
    anchorStep,
    shades,
    generationSettings: settings,
  };
}

// ---- quality checks surfaced in the UI and asserted in tests ----

export interface ScaleChecks {
  /** Lightness strictly decreases from 50 to 950 (CS-001). */
  monotonic: boolean;
  /** Steps whose lightness is not below the previous step. */
  monotonicBreaks: ScaleStep[];
  /** Largest hue distance from the base among chromatic steps, in degrees. */
  hueDrift: number;
  hueDriftBound: number;
  hueWithinBound: boolean;
  /** Steps whose chroma was reduced to fit sRGB. */
  gamutMapped: ScaleStep[];
  lockedCount: number;
}

export function checkScale(scale: ColourScale): ScaleChecks {
  const monotonicBreaks: ScaleStep[] = [];
  const gamutMapped: ScaleStep[] = [];
  let hueDrift = 0;
  let lockedCount = 0;
  SCALE_STEPS.forEach((step, i) => {
    const shade = scale.shades[step];
    if (i > 0 && !(shade.oklch.l < scale.shades[SCALE_STEPS[i - 1]].oklch.l)) monotonicBreaks.push(step);
    if (shade.gamutMapped) gamutMapped.push(step);
    if (shade.locked) lockedCount++;
    // Measured on the rendered HEX (what actually ships), not on the ideal OKLCH value.
    const rendered = hexToOklch(shade.hex);
    if (scale.base.oklch.h !== null && rendered.h !== null && rendered.c >= HUE_MEASURE_MIN_CHROMA) {
      hueDrift = Math.max(hueDrift, hueDistance(scale.base.oklch.h, rendered.h));
    }
  });
  const hueDriftBound = Math.max(HUE_DRIFT_BOUND, Math.abs(scale.generationSettings.hueShift) + HUE_DRIFT_BOUND);
  return {
    monotonic: monotonicBreaks.length === 0,
    monotonicBreaks,
    hueDrift,
    hueDriftBound,
    hueWithinBound: hueDrift <= hueDriftBound,
    gamutMapped,
    lockedCount,
  };
}
