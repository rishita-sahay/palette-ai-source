import { useMemo } from 'react';
import { SCALE_STEPS, type Oklch } from '@/types';
import { buildPaletteColours, generateScale, makeColour, DEFAULT_SEEDS } from '@/lib/colour-engine';
import { readableOn } from '@/lib/contrast';

const previewId = (() => { let n = 0; return (p: string) => `${p}_preview_${++n}`; })();

/** "Product as proof": real engine output for whatever colour is in the field, updating as you type. */
export function HeroPreview({ anchor }: { anchor: Oklch }) {
  const { seeds, primary, neutral } = useMemo(() => {
    const seeds = buildPaletteColours({ anchor, harmony: 'analogous', chromaBias: 1, lightnessBias: 0, roll: 0, accentHue: null, neutralHue: null, count: DEFAULT_SEEDS, createId: previewId });
    const scale = (name: string, o: Oklch) => generateScale({ id: `preview-${name}`, familyName: name, base: makeColour(o, { id: `preview-base-${name}` }), createId: previewId });
    return { seeds, primary: scale('primary', seeds[0].oklch), neutral: scale('neutral', seeds.at(-1)!.oklch) };
  }, [anchor]);

  return (
    <div className="flex h-full flex-col rounded-frame bg-soft p-5 sm:p-7" aria-label="Live preview of the generated system">
      <div className="mb-4 flex items-center justify-between text-[13px] font-medium text-label">
        <span>Live preview</span>
        <span className="font-mono text-[12px] font-normal">{seeds[0].hex}</span>
      </div>

      <div className="rounded-control border border-line bg-surface p-4">
        <p className="mb-2.5 text-[13px] font-medium text-label">Palette seeds</p>
        <div className="flex gap-2">
          {seeds.map((c) => (
            <div key={c.id} className="min-w-0 flex-1">
              <div className="swatch-edge h-16 rounded-field" style={{ background: c.hex }} />
              <p className="mt-1.5 truncate text-[12px] leading-4 font-medium text-ink">{c.name}</p>
              <p className="truncate font-mono text-[11px] leading-4 text-muted">{c.hex}</p>
            </div>
          ))}
        </div>
      </div>

      {[primary, neutral].map((scale) => (
        <div key={scale.id} className="mt-3 rounded-control border border-line bg-surface p-4">
          <div className="mb-2.5 flex items-baseline justify-between">
            <p className="text-[13px] font-medium text-label">{scale.familyName} scale</p>
            <p className="text-[12px] text-muted">base on {scale.anchorStep}</p>
          </div>
          <div className="swatch-edge flex overflow-hidden rounded-field">
            {SCALE_STEPS.map((step) => {
              const shade = scale.shades[step];
              return (
                <div key={step} className="flex h-12 min-w-0 flex-1 items-end justify-center pb-1.5 text-[10px] font-medium tabular-nums" style={{ background: shade.hex, color: readableOn(shade.hex) }}>
                  <span className="hidden sm:inline">{step}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <pre className="scroll-quiet mt-3 overflow-auto rounded-control border border-line bg-surface p-4 font-mono text-[12px] leading-5 text-ink">
        <span className="text-muted">{'@theme {\n'}</span>
        {([100, 500, 900] as const).map((step) => `  --color-primary-${step}: ${primary.shades[step].hex};\n`).join('')}
        <span className="text-muted">{'  /* …and the rest */\n}'}</span>
      </pre>
    </div>
  );
}
