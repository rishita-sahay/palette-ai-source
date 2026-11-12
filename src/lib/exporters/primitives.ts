import { SCALE_STEPS, type ColourScale, type ExportSettings, type Oklch, type ScaleStep } from '@/types';
import { formatOklch } from '@/lib/colour-engine/convert';

/** A primitive token derived from a scale step. Named `{family}-{step}` (TM-001). */
export interface PrimitiveToken {
  name: string;
  family: string;
  step: ScaleStep;
  hex: string;
  oklch: Oklch;
}

export function derivePrimitives(families: ColourScale[]): PrimitiveToken[] {
  return families.flatMap((family) =>
    SCALE_STEPS.map((step) => {
      const shade = family.shades[step];
      return { name: `${family.familyName}-${step}`, family: family.familyName, step, hex: shade.hex, oklch: shade.oklch };
    }),
  );
}

export function formatValue(token: Pick<PrimitiveToken, 'hex' | 'oklch'>, format: ExportSettings['colourFormat']): string {
  return format === 'oklch' ? formatOklch(token.oklch) : token.hex;
}

export interface ExportResult {
  filename: string;
  mime: string;
  content: string;
}
