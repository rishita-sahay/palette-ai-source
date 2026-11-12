import type { HarmonyMode } from '@/types';

/** Hue offsets from the anchor, in OKLCH hue degrees (PS-008). */
export const HARMONY_OFFSETS: Record<HarmonyMode, readonly number[]> = {
  complementary: [180],
  analogous: [30, -30, 60, -60],
  triadic: [120, 240],
  'split-complementary': [150, 210],
  tetradic: [90, 180, 270],
  monochromatic: [0],
};

export const HARMONY_LABELS: Record<HarmonyMode, string> = {
  complementary: 'Complementary',
  analogous: 'Analogous',
  triadic: 'Triadic',
  'split-complementary': 'Split-complementary',
  tetradic: 'Tetradic',
  monochromatic: 'Monochromatic',
};

export const HARMONY_HINTS: Record<HarmonyMode, string> = {
  complementary: 'Anchor plus its opposite hue (180°).',
  analogous: 'Neighbouring hues, ±30° and ±60°.',
  triadic: 'Three hues spaced 120° apart.',
  'split-complementary': 'Anchor plus the two hues beside its opposite.',
  tetradic: 'Four hues spaced 90° apart.',
  monochromatic: 'One hue, varied in lightness and chroma.',
};

export const HARMONY_MODES = Object.keys(HARMONY_OFFSETS) as HarmonyMode[];
