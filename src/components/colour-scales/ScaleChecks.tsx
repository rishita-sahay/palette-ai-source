import { Check, TriangleAlert } from 'lucide-react';
import type { ColourScale } from '@/types';
import { checkScale } from '@/lib/colour-engine';

function Item({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
  const Icon = ok ? Check : TriangleAlert;
  return (
    <li className="flex gap-2.5">
      <Icon className={ok ? 'mt-0.5 size-4 shrink-0 text-success' : 'mt-0.5 size-4 shrink-0 text-caution'} strokeWidth={1.75} aria-hidden />
      <div>
        <p className="text-[13px] leading-[18px] font-medium text-ink">{title}</p>
        <p className="text-[13px] leading-[18px] text-muted">{detail}</p>
      </div>
    </li>
  );
}

/** The scale's acceptance criteria (CS-001/002/004), checked live against the current values. */
export function ScaleChecks({ scale }: { scale: ColourScale }) {
  const checks = checkScale(scale);
  const shift = scale.generationSettings.hueShift;
  return (
    <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-3" aria-label="Scale quality checks">
      <Item
        ok={checks.monotonic}
        title={checks.monotonic ? 'Lightness steps down evenly' : 'Lightness order is broken'}
        detail={checks.monotonic ? 'Every step is darker than the one before.' : `Step ${checks.monotonicBreaks.join(', ')} is not darker than its neighbour — a locked or edited shade is out of order.`}
      />
      <Item
        ok={checks.hueWithinBound}
        title={`Hue drift ${checks.hueDrift.toFixed(1)}°`}
        detail={
          !checks.hueWithinBound
            ? `Over the ${checks.hueDriftBound}° limit — a locked or edited shade has a different hue from the base.`
            : shift !== 0
              ? `Includes your ${shift > 0 ? '+' : ''}${shift}° hue shift. Limit ${checks.hueDriftBound}°.`
              : `Within the ${checks.hueDriftBound}° limit, measured on the final HEX values.`
        }
      />
      <Item
        ok
        title={checks.gamutMapped.length ? `${checks.gamutMapped.length} ${checks.gamutMapped.length === 1 ? 'step' : 'steps'} fitted to sRGB` : 'All steps inside sRGB'}
        detail={checks.gamutMapped.length ? 'Chroma was reduced, never clipped. Lightness and hue are unchanged.' : 'No gamut mapping was needed.'}
      />
    </ul>
  );
}
