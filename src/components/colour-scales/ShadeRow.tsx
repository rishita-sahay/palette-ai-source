import { useState } from 'react';
import { Lock, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { SCALE_STEPS, type ColourScale, type ScaleStep } from '@/types';
import { checkScale } from '@/lib/colour-engine';
import { readableOn } from '@/lib/contrast';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { ScaleChecks } from './ScaleChecks';
import { ScaleControls } from './ScaleControls';

/** One family's eleven shades on a single row, with its scale controls tucked behind "Adjust". */
export function ShadeRow({ scale, selected, onSelect }: { scale: ColourScale; selected: ScaleStep | null; onSelect: (step: ScaleStep) => void }) {
  const [open, setOpen] = useState(false);
  const checks = checkScale(scale);
  const healthy = checks.monotonic && checks.hueWithinBound;
  const panelId = `controls-${scale.id}`;
  return (
    <section aria-label={`${scale.familyName} scale`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h3 className="truncate text-[15px] leading-6 font-medium text-ink capitalize">{scale.familyName}</h3>
          <p className="font-mono text-[12px] leading-4 text-muted">{scale.base.hex} on {scale.anchorStep}</p>
          {!healthy && (
            <span className="flex items-center gap-1 text-[12px] leading-4 font-medium text-caution">
              <TriangleAlert className="size-3.5" strokeWidth={1.75} aria-hidden /> Needs a look
            </span>
          )}
        </div>
        <Button variant="quiet" size="sm" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)} className={cn('-mr-2', open && 'bg-soft text-ink')}>
          <SlidersHorizontal strokeWidth={1.5} /> Adjust
        </Button>
      </div>
      <ol className="mt-2 grid grid-cols-6 gap-1.5 sm:grid-cols-11" aria-label={`${scale.familyName}, steps 50 to 950`}>
        {SCALE_STEPS.map((step) => {
          const shade = scale.shades[step];
          const isBase = step === scale.anchorStep;
          return (
            <li key={step}>
              <button
                type="button"
                onClick={() => onSelect(step)}
                aria-pressed={selected === step}
                aria-label={`${scale.familyName}-${step}, ${shade.hex}${shade.locked ? ', locked' : ''}${isBase ? ', base colour' : ''}. Select to edit.`}
                title={`${scale.familyName}-${step} · ${shade.hex}`}
                className={cn('swatch-edge relative flex h-14 w-full items-start justify-end rounded-field p-1.5 transition-[outline]', selected === step && 'outline-2 outline-offset-2 outline-ink')}
                style={{ background: shade.hex, color: readableOn(shade.hex) }}
              >
                {shade.locked && <Lock className="size-3" strokeWidth={2} aria-hidden />}
                {isBase && <span className="absolute bottom-1.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-current" aria-hidden />}
              </button>
              <p className="mt-1 text-center text-[12px] leading-4 text-muted tabular-nums">{step}</p>
            </li>
          );
        })}
      </ol>
      {open && (
        <div id={panelId} className="mt-3 rounded-control border border-line p-4">
          <ScaleControls scale={scale} />
          <div className="mt-5 border-t border-line pt-4"><ScaleChecks scale={scale} /></div>
        </div>
      )}
    </section>
  );
}
