import { useEffect, useId, useState } from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';
import type { ColourScale, LightnessCurve } from '@/types';
import { checkScale, CURVE_LABELS, DEFAULT_SETTINGS, MAX_HUE_SHIFT, parseColour } from '@/lib/colour-engine';
import { Button } from '@/components/ui/button';
import { FieldLabel, Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toaster';
import { useProjectStore } from '@/store/project-store';
import { cn } from '@/utils/cn';

function Slider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <output htmlFor={id} className="font-mono text-[13px] text-ink tabular-nums">{format(value)}</output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}

export function ScaleControls({ scale }: { scale: ColourScale }) {
  const setFamilyBase = useProjectStore((s) => s.setFamilyBase);
  const updateSettings = useProjectStore((s) => s.updateFamilySettings);
  const regenerateFamily = useProjectStore((s) => s.regenerateFamily);
  const baseId = useId();
  const [baseText, setBaseText] = useState(scale.base.hex);
  const [baseError, setBaseError] = useState<string | null>(null);
  useEffect(() => { setBaseText(scale.base.hex); setBaseError(null); }, [scale.base.hex, scale.id]);

  const settings = scale.generationSettings;
  const locked = checkScale(scale).lockedCount;

  const applyBase = (text: string) => {
    const parsed = parseColour(text);
    if (!parsed.ok) {
      setBaseError(`${parsed.error} Kept ${scale.base.hex}.`);
      setBaseText(scale.base.hex);
      return;
    }
    setBaseError(null);
    const checks = setFamilyBase(scale.id, parsed.oklch);
    if (checks && !checks.monotonic) {
      toast('A locked shade is now out of order', { description: `Step ${checks.monotonicBreaks.join(', ')} no longer gets darker in sequence. Unlock it or edit it.` });
    }
  };

  return (
    <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
      <div>
        <FieldLabel htmlFor={baseId}>Base colour</FieldLabel>
        <div className="flex gap-2">
          <label className="swatch-edge relative block size-10 shrink-0 cursor-pointer overflow-hidden rounded-field focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand" style={{ background: scale.base.hex }}>
            <span className="sr-only">Pick a base colour for {scale.familyName}</span>
            <input type="color" value={scale.base.hex.toLowerCase()} onChange={(e) => applyBase(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
          </label>
          <Input
            id={baseId}
            value={baseText}
            onChange={(e) => setBaseText(e.target.value)}
            onBlur={() => baseText.trim().toUpperCase() !== scale.base.hex && applyBase(baseText)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyBase(baseText); } }}
            aria-invalid={!!baseError}
            spellCheck={false}
            autoComplete="off"
            className="font-mono"
          />
        </div>
        {baseError ? <p role="alert" className="mt-1.5 text-[13px] leading-[18px] text-danger">{baseError}</p> : <p className="mt-1.5 text-[12px] leading-4 text-muted">Sits on step {scale.anchorStep}, the step closest to its lightness. Unlocked shades follow it.</p>}

        <fieldset className="mt-5">
          <legend className="mb-1.5 text-[13px] leading-[18px] font-medium text-label">Lightness distribution</legend>
          <div className="inline-flex gap-1 rounded-control bg-soft p-1">
            {(Object.keys(CURVE_LABELS) as LightnessCurve[]).map((curve) => (
              <button
                key={curve}
                type="button"
                aria-pressed={settings.lightnessCurve === curve}
                onClick={() => updateSettings(scale.id, { lightnessCurve: curve })}
                className={cn('rounded-field px-3 py-1.5 text-[13px] leading-[18px] font-medium', settings.lightnessCurve === curve ? 'bg-surface text-ink shadow-[inset_0_0_0_1px_var(--color-line)]' : 'text-muted hover:text-ink')}
              >
                {CURVE_LABELS[curve]}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="space-y-4">
        <Slider label="Chroma" value={settings.chromaScale} min={0} max={1.5} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => updateSettings(scale.id, { chromaScale: v })} />
        <Slider label="Hue shift across the ramp" value={settings.hueShift} min={-MAX_HUE_SHIFT} max={MAX_HUE_SHIFT} step={1} format={(v) => `${v > 0 ? '+' : ''}${v}°`} onChange={(v) => updateSettings(scale.id, { hueShift: v })} />
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={() => regenerateFamily(scale.id, true)} title="Rebuilds all 11 steps, including locked ones">
            <RefreshCw strokeWidth={1.5} /> Regenerate full scale{locked > 0 && ` (clears ${locked} locked)`}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => updateSettings(scale.id, { ...DEFAULT_SETTINGS })} disabled={settings.chromaScale === 1 && settings.hueShift === 0 && settings.lightnessCurve === 'balanced'}>
            <RotateCcw strokeWidth={1.5} /> Reset controls
          </Button>
        </div>
      </div>
    </div>
  );
}
