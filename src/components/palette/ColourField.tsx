import { useEffect, useId, useState } from 'react';
import type { Colour, Oklch } from '@/types';
import { formatHsl, formatOklch, formatRgb, parseColour } from '@/lib/colour-engine';
import { FieldLabel, Input } from '@/components/ui/input';
import { cn } from '@/utils/cn';

type Value = Pick<Colour, 'hex' | 'rgb' | 'hsl' | 'oklch'>;

function FormatInput({ label, formatted, onCommit, mono = true }: { label: string; formatted: string; onCommit: (text: string) => boolean; mono?: boolean }) {
  const id = useId();
  const [text, setText] = useState(formatted);
  useEffect(() => setText(formatted), [formatted]);
  const commit = () => {
    if (text.trim() === formatted) return;
    // Invalid input: the parent shows the message and the field returns to the last valid value.
    if (!onCommit(text)) setText(formatted);
  };
  return (
    <div className="flex items-center gap-2">
      <FieldLabel htmlFor={id} className="mb-0 w-11 shrink-0 text-[12px]">{label}</FieldLabel>
      <Input
        id={id}
        value={text}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') setText(formatted);
        }}
        className={cn('h-9 px-2.5', mono && 'font-mono text-[12px]')}
      />
    </div>
  );
}

/**
 * Editable colour control: picker + HEX / RGB / HSL, all kept in sync through the colour engine.
 * A valid entry is applied immediately; an invalid one keeps the last valid value and explains why.
 */
export function ColourField({ value, onChange, pickerLabel = 'Pick a colour' }: { value: Value; onChange: (oklch: Oklch) => void; pickerLabel?: string }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [value.hex]);

  const commit = (text: string) => {
    const parsed = parseColour(text);
    if (!parsed.ok) {
      setError(`${parsed.error} Kept ${value.hex}.`);
      return false;
    }
    setError(null);
    onChange(parsed.oklch);
    return true;
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="swatch-edge relative block size-11 shrink-0 cursor-pointer overflow-hidden rounded-field focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand" style={{ background: value.hex }}>
          <span className="sr-only">{pickerLabel}</span>
          <input
            type="color"
            value={value.hex.toLowerCase()}
            onChange={(e) => commit(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        <div className="min-w-0 flex-1"><FormatInput label="HEX" formatted={value.hex} onCommit={commit} /></div>
      </div>
      <div className="mt-1.5 space-y-1.5">
        <FormatInput label="RGB" formatted={formatRgb(value.rgb)} onCommit={commit} />
        <FormatInput label="HSL" formatted={formatHsl(value.hsl)} onCommit={commit} />
        <div className="flex items-center gap-2">
          <span className="w-11 shrink-0 text-[12px] font-medium text-label">OKLCH</span>
          <output className="flex h-9 min-w-0 flex-1 items-center rounded-field bg-soft px-2.5 font-mono text-[12px] whitespace-nowrap text-ink" title="Canonical value — stored at full precision">
            {formatOklch(value.oklch)}
          </output>
        </div>
      </div>
      <p role="alert" aria-live="polite" className={cn('mt-2 text-[13px] leading-[18px] text-danger', !error && 'hidden')}>{error}</p>
      <p className="mt-2 text-[12px] leading-4 text-muted">Click the swatch for a picker, or type any format and press Enter.</p>
    </div>
  );
}
