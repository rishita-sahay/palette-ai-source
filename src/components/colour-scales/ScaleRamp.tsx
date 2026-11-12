import { Lock } from 'lucide-react';
import { SCALE_STEPS, type ColourScale, type ScaleStep } from '@/types';
import { readableOn } from '@/lib/contrast';
import { cn } from '@/utils/cn';

export function ScaleRamp({ scale, selected, onSelect }: { scale: ColourScale; selected: ScaleStep | null; onSelect: (step: ScaleStep) => void }) {
  return (
    <ol className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-11" aria-label={`${scale.familyName} scale, 50 to 950`}>
      {SCALE_STEPS.map((step) => {
        const shade = scale.shades[step];
        const fg = readableOn(shade.hex);
        const isBase = step === scale.anchorStep;
        return (
          <li key={step}>
            <button
              type="button"
              onClick={() => onSelect(step)}
              aria-pressed={selected === step}
              aria-label={`${scale.familyName}-${step}, ${shade.hex}${shade.locked ? ', locked' : ''}${isBase ? ', base colour' : ''}`}
              className={cn('swatch-edge relative flex h-32 w-full flex-col justify-between rounded-control p-2.5 text-left transition-[outline]', selected === step && 'outline-2 outline-offset-2 outline-ink')}
              style={{ background: shade.hex, color: fg }}
            >
              <span className="flex items-center justify-between text-[13px] leading-[18px] font-semibold tabular-nums">
                {step}
                {shade.locked && <Lock className="size-3.5" strokeWidth={1.75} aria-hidden />}
              </span>
              <span>
                {isBase && <span className="mb-0.5 block text-[11px] leading-4 font-medium">Base</span>}
                {shade.gamutMapped && !isBase && <span className="mb-0.5 block text-[11px] leading-4 opacity-75" title="Chroma reduced to fit sRGB">sRGB fit</span>}
                <span className="block font-mono text-[11px] leading-4 opacity-90">{shade.hex}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
