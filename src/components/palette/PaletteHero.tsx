import { useState } from 'react';
import type { Oklch } from '@/types';
import { Eyebrow } from '@/components/layout/Eyebrow';
import { HeroPreview } from './HeroPreview';
import { SeedForm } from './SeedForm';

/** Start screen: message and seed form left (≈42%), live product preview right (≈58%). Sized to fit a laptop screen without scrolling. */
export function PaletteHero() {
  const [anchor, setAnchor] = useState<Oklch | null>(null);
  return (
    <div className="grid min-h-full gap-6 p-5 sm:p-6 lg:h-full lg:grid-cols-[minmax(0,42fr)_minmax(0,58fr)] lg:gap-10 lg:p-8">
      <div className="flex flex-col justify-center">
        <Eyebrow>Colour system generator</Eyebrow>
        <h1 className="mt-3 text-[32px] leading-[1.08] font-bold tracking-[-0.02em] text-balance text-ink xl:text-[40px] short:xl:text-[34px]">
          One colour in. <span className="text-muted">A whole design system out.</span>
        </h1>
        <p className="mt-3 mb-5 max-w-[440px] text-[15px] leading-6 text-muted squat:hidden">
          Start from a colour or a brief. Get the palette, 11-step OKLCH scales, role tokens and export code on one page.
        </p>
        <div className="squat:mt-4"><SeedForm onPreview={setAnchor} /></div>
      </div>
      <div className="min-h-[360px] lg:min-h-0">{anchor && <HeroPreview anchor={anchor} />}</div>
    </div>
  );
}
