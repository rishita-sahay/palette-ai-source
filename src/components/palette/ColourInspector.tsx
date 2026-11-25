import { useEffect, useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { classifyContrast, formatRatio } from '@/lib/contrast';
import { Inspector, InspectorEmpty, InspectorSection } from '@/components/layout/Inspector';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { selectPalette, useProjectStore } from '@/store/project-store';
import { ColourField } from './ColourField';

export function ContrastRows({ hex }: { hex: string }) {
  return (
    <ul className="space-y-1.5 text-[13px] leading-[18px]">
      {([['white', '#FFFFFF'], ['black', '#0A0A0A']] as const).map(([label, other]) => {
        const result = classifyContrast(other, hex);
        return (
          <li key={label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-muted">
              <span className="swatch-edge flex size-6 items-center justify-center rounded-[6px] text-[11px] font-semibold" style={{ background: hex, color: other }} aria-hidden>Aa</span>
              {label} text
            </span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-ink tabular-nums">{formatRatio(result.ratio)}</span>
              <Badge tone={result.aa.normalText ? 'success' : 'neutral'} className="w-[68px] justify-center">{result.aa.normalText ? 'AA pass' : result.aa.largeText ? 'Large only' : 'AA fail'}</Badge>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ColourInspector({ onClose }: { onClose?: () => void }) {
  const palette = useProjectStore(selectPalette);
  const selectedId = useProjectStore((s) => s.ui.selectedColourId);
  const families = useProjectStore((s) => s.project.colourFamilies);
  const updateColour = useProjectStore((s) => s.updateColour);
  const toggleLock = useProjectStore((s) => s.toggleColourLock);
  const renameColour = useProjectStore((s) => s.renameColour);
  const colour = palette?.colours.find((c) => c.id === selectedId);
  const [name, setName] = useState(colour?.name ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  useEffect(() => { setName(colour?.name ?? ''); setNameError(null); }, [colour?.id, colour?.name]);

  if (!palette || !colour) return <Inspector title="Edit colour" onClose={onClose}><InspectorEmpty>Select a colour to edit its value, rename it, or lock it.</InspectorEmpty></Inspector>;

  const family = families.find((f) => f.id === colour.familyId);
  const commitName = () => {
    if (name === colour.name) return;
    const result = renameColour(colour.id, name);
    if (!result.ok) { setNameError(result.error); setName(colour.name ?? ''); } else setNameError(null);
  };

  return (
    <Inspector title={`Edit ${colour.name}`} onClose={onClose}>
      <InspectorSection label="Name">
        <Input value={name} aria-label="Colour name" aria-invalid={!!nameError} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="h-9" />
        {nameError ? <p role="alert" className="mt-1.5 text-[13px] leading-[18px] text-danger">{nameError}</p> : <p className="mt-1.5 text-[12px] leading-4 text-muted">Becomes the family and token name, e.g. <span className="font-mono">{colour.name}-500</span>.</p>}
      </InspectorSection>

      <InspectorSection label="Value">
        <ColourField value={colour} onChange={(oklch) => updateColour(colour.id, oklch)} pickerLabel={`Pick a new colour for ${colour.name}`} />
        {colour.gamutMapped && <p className="mt-2 text-[12px] leading-4 text-muted">Chroma was reduced to fit sRGB — the HEX is the nearest displayable colour.</p>}
      </InspectorSection>

      <InspectorSection label="Regeneration">
        <Button variant="secondary" size="sm" onClick={() => toggleLock(colour.id)} aria-pressed={colour.locked} className="w-full justify-start">
          {colour.locked ? <Lock strokeWidth={1.5} /> : <LockOpen strokeWidth={1.5} />}
          {colour.locked ? 'Locked — click to unlock' : 'Unlocked — click to lock'}
        </Button>
        <p className="mt-2 text-[12px] leading-4 text-muted">{colour.locked ? 'Regenerating or changing harmony will not touch this colour.' : 'This colour changes when you regenerate or switch harmony.'}</p>
      </InspectorSection>

      <InspectorSection label="Contrast (WCAG 2.2, normal text)">
        <ContrastRows hex={colour.hex} />
      </InspectorSection>

      <InspectorSection label="Scale">
        <p className="text-[13px] leading-[18px] text-muted">
          {family
            ? <>This is the base of the <span className="font-medium text-ink">{family.familyName}</span> scale. Edits here update its unlocked shades straight away.</>
            : 'This colour has no scale.'}
        </p>
      </InspectorSection>
    </Inspector>
  );
}
