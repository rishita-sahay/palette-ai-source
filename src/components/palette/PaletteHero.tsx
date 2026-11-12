import { useState } from 'react';
import type { Oklch } from '@/types';
import { Eyebrow } from '@/components/layout/Eyebrow';
import { TwoToneHeadline } from '@/components/layout/TwoToneHeadline';
import { HeroPreview } from './HeroPreview';
import { SeedForm } from './SeedForm';

/** Empty state for Palette Studio: split hero, message left (≈42%), live product preview right (≈58%). */
export function PaletteHero() {
  const [anchor, setAnchor] = useState<Oklch | null>(null);
  return (
    <div className="grid min-h-full gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,42fr)_minmax(0,58fr)] lg:gap-10 lg:p-10 lg:pr-8">
      <div className="flex flex-col">
        <Eyebrow>Colour system generator</Eyebrow>
        <TwoToneHeadline className="mt-5" lead="One colour in." rest="A whole design system out." />
        <div className="mt-10 lg:mt-auto lg:pt-10">
          <p className="mb-7 max-w-[440px] text-lg leading-7 text-muted">
            Seed a palette, expand it into 11-step OKLCH scales, and export CSS variables, Tailwind v4 or JSON.
          </p>
          <SeedForm onPreview={setAnchor} />
        </div>
      </div>
      <div className="min-h-[420px]">{anchor && <HeroPreview anchor={anchor} />}</div>
    </div>
  );
}
