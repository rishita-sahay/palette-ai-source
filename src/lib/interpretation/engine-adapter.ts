import type { SeedParams } from '@/lib/colour-engine/palette';
import { escapeExclusions, TEMPERATURE_SCALAR, type VisualTargets } from './attribute-resolver';

/**
 * Step 4 hand-off: normalised 0–1 targets → the parameters the existing colour engine already
 * takes. This is the only place interpretation values become OKLCH numbers, and it produces
 * engine *inputs* — the engine still generates every colour.
 */

const L_MIN = 0.36, L_SPAN = 0.46; // lightness 0…1 → anchor L 0.36…0.82
const C_MIN = 0.03, C_SPAN = 0.22; // chroma 0…1 → anchor C 0.03…0.25
const MAX_ACCENT_OFFSET = 0.12;

export function targetsToSeedParams(targets: VisualTargets): SeedParams {
  const t = TEMPERATURE_SCALAR[targets.temperature];
  const neutralTint = t > 0.25 ? 70 : t < -0.25 ? 250 : null;
  return {
    anchor: { l: L_MIN + L_SPAN * targets.lightness, c: C_MIN + C_SPAN * targets.chroma, h: targets.primaryHue },
    harmony: targets.harmony,
    chromaBias: 1,
    lightnessBias: 0,
    roll: 0,
    accentHue: targets.accentHue,
    neutralHue: neutralTint === null ? null : escapeExclusions(neutralTint, targets.excludedHues, targets.temperature),
    excludedHues: targets.excludedHues,
    // Above-average contrast spreads the accents lighter/darker around the anchor.
    accentLightnessOffset: Math.max(0, (targets.contrast - 0.5) * 2) * MAX_ACCENT_OFFSET,
  };
}
