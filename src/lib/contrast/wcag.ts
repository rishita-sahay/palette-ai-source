import { wcagContrast } from 'culori';

/**
 * WCAG 2.2 contrast (SC 1.4.3, 1.4.6, 1.4.11). The ratio itself comes from Culori's
 * wcagContrast, which implements the WCAG relative-luminance formula.
 */

export const THRESHOLDS = {
  aa: { normalText: 4.5, largeText: 3, nonText: 3 },
  aaa: { normalText: 7, largeText: 4.5 },
} as const;

export type ContentType = 'normalText' | 'largeText' | 'nonText';

export function contrastRatio(foreground: string, background: string): number {
  return wcagContrast(foreground, background);
}

export interface ContrastResult {
  ratio: number;
  aa: Record<ContentType, boolean>;
  aaa: { normalText: boolean; largeText: boolean };
}

export function classifyContrast(foreground: string, background: string): ContrastResult {
  const ratio = contrastRatio(foreground, background);
  return {
    ratio,
    aa: {
      normalText: ratio >= THRESHOLDS.aa.normalText,
      largeText: ratio >= THRESHOLDS.aa.largeText,
      nonText: ratio >= THRESHOLDS.aa.nonText,
    },
    aaa: {
      normalText: ratio >= THRESHOLDS.aaa.normalText,
      largeText: ratio >= THRESHOLDS.aaa.largeText,
    },
  };
}

/** Ratios are shown truncated (not rounded up) so 4.499 never displays as a passing 4.5. */
export function formatRatio(ratio: number): string {
  return `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;
}

/** Picks black or white text for a swatch, whichever contrasts more. */
export function readableOn(background: string): '#0A0A0A' | '#FFFFFF' {
  return contrastRatio('#0A0A0A', background) >= contrastRatio('#FFFFFF', background) ? '#0A0A0A' : '#FFFFFF';
}
