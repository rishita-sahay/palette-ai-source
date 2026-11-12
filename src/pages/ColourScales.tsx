import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { AddFamilyDialog, FamilyTabs } from '@/components/colour-scales/FamilyTabs';
import { LivePreview } from '@/components/colour-scales/LivePreview';
import { ScaleChecks } from '@/components/colour-scales/ScaleChecks';
import { ScaleControls } from '@/components/colour-scales/ScaleControls';
import { ScaleRamp } from '@/components/colour-scales/ScaleRamp';
import { Eyebrow } from '@/components/layout/Eyebrow';
import { TwoToneHeadline } from '@/components/layout/TwoToneHeadline';
import { Button } from '@/components/ui/button';
import { selectPalette, useProjectStore } from '@/store/project-store';

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 border-t border-line pt-5">
      <h2 className="mb-4 text-[13px] leading-[18px] font-medium text-label">{title}</h2>
      {children}
    </section>
  );
}

export function ColourScales() {
  const families = useProjectStore((s) => s.project.colourFamilies);
  const palette = useProjectStore(selectPalette);
  const selectedId = useProjectStore((s) => s.ui.selectedFamilyId);
  const selectedStep = useProjectStore((s) => s.ui.selectedStep);
  const store = useProjectStore.getState;
  const [adding, setAdding] = useState(false);

  if (families.length === 0) {
    return (
      <div className="flex min-h-full flex-col justify-center p-8 lg:p-12">
        <Eyebrow>Colour Scales</Eyebrow>
        <TwoToneHeadline as="h1" size="section" className="mt-4 max-w-xl" lead="Pick a base colour." rest="Get eleven even steps from 50 to 950." />
        <p className="mt-4 max-w-lg text-sm leading-6 text-muted">
          Scales are built in OKLCH: lightness steps down evenly, hue holds steady, and chroma eases off at both ends. Anything outside sRGB is brought in by reducing chroma, not by clipping.
        </p>
        <div className="mt-7 flex flex-wrap gap-2">
          {palette ? (
            <Button variant="primary" size="lg" onClick={() => store().createScalesFromPalette(true)}>Create scales from the palette <ArrowRight strokeWidth={1.5} /></Button>
          ) : (
            <Button variant="primary" size="lg" onClick={() => store().setModule('palette')}>Start in Palette Studio <ArrowRight strokeWidth={1.5} /></Button>
          )}
          <Button variant="secondary" size="lg" onClick={() => setAdding(true)}>Add a single family</Button>
        </div>
        <AddFamilyDialog open={adding} onOpenChange={setAdding} />
      </div>
    );
  }

  const scale = families.find((f) => f.id === selectedId) ?? families[0];
  const neutral = families.find((f) => f.familyName === 'neutral');

  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.01em] text-ink">Colour scales</h1>
      <p className="mt-1 text-sm leading-6 text-muted">Eleven steps per family, generated in OKLCH. Select a step to edit or lock it.</p>

      <div className="mt-5"><FamilyTabs /></div>

      <div className="mt-6 flex items-baseline justify-between gap-4">
        <h2 className="text-[22px] leading-[30px] font-semibold text-ink">{scale.familyName}</h2>
        <p className="font-mono text-[13px] text-muted">{scale.familyName}-50 … {scale.familyName}-950</p>
      </div>
      <div className="mt-3">
        <ScaleRamp scale={scale} selected={scale.id === selectedId ? selectedStep : null} onSelect={(step) => { if (scale.id !== selectedId) store().selectFamily(scale.id); store().selectStep(step); }} />
      </div>

      <div className="mt-5"><ScaleChecks scale={scale} /></div>

      <Panel title="Scale controls"><ScaleControls scale={scale} /></Panel>
      <Panel title="Live preview"><LivePreview scale={scale} neutral={neutral} /></Panel>
    </div>
  );
}
