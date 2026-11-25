import { useState } from 'react';
import { Check, Copy, Lock, LockOpen, Trash2 } from 'lucide-react';
import { ColourField } from '@/components/palette/ColourField';
import { ContrastRows } from '@/components/palette/ColourInspector';
import { Inspector, InspectorEmpty, InspectorSection } from '@/components/layout/Inspector';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toaster';
import { useProjectStore } from '@/store/project-store';
import { copyText } from '@/utils/download';

function CopyRow({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 text-[13px] leading-[18px]">
      <span className="shrink-0 text-muted">{label}</span>
      <button
        type="button"
        onClick={async () => { if (await copyText(value)) { setDone(true); setTimeout(() => setDone(false), 1200); } }}
        className="flex min-w-0 items-center gap-1.5 rounded-field px-1.5 py-1 font-mono text-ink hover:bg-soft"
        aria-label={`Copy ${value}`}
      >
        <span className="truncate">{value}</span>
        {done ? <Check className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden /> : <Copy className="size-3.5 shrink-0 text-muted" strokeWidth={1.5} aria-hidden />}
      </button>
    </div>
  );
}

export function ShadeInspector({ onClose }: { onClose?: () => void }) {
  const families = useProjectStore((s) => s.project.colourFamilies);
  const paletteColours = useProjectStore((s) => s.project.palettes[0]?.colours);
  const familyId = useProjectStore((s) => s.ui.selectedFamilyId);
  const step = useProjectStore((s) => s.ui.selectedStep);
  const editShade = useProjectStore((s) => s.editShade);
  const toggleShadeLock = useProjectStore((s) => s.toggleShadeLock);
  const renameFamily = useProjectStore((s) => s.renameFamily);
  const deleteFamily = useProjectStore((s) => s.deleteFamily);
  const family = families.find((f) => f.id === familyId);
  const [name, setName] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!family) return <Inspector title="Edit shade" onClose={onClose}><InspectorEmpty>Select a shade to edit or lock it.</InspectorEmpty></Inspector>;
  const linked = paletteColours?.find((c) => c.familyId === family.id);
  const lastColour = !!linked && (paletteColours?.length ?? 0) <= 1;

  const commitName = () => {
    if (name === null || name === family.familyName) return setName(null);
    const result = renameFamily(family.id, name);
    setNameError(result.ok ? null : result.error);
    setName(null);
  };

  const familySection = (
    <InspectorSection label="Family">
      <Input value={name ?? family.familyName} aria-label="Family name" aria-invalid={!!nameError} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="h-9" />
      {nameError && <p role="alert" className="mt-1.5 text-[13px] leading-[18px] text-danger">{nameError}</p>}
      <Button variant="quiet" size="sm" className="mt-2 -ml-2" disabled={lastColour} title={lastColour ? 'A palette needs at least one colour' : undefined} onClick={() => setConfirmDelete(true)}><Trash2 strokeWidth={1.5} /> Delete family…</Button>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete the “{family.familyName}” family?</DialogTitle>
            <DialogDescription>Its 11 shades ({family.familyName}-50 to {family.familyName}-950) are removed from the palette and from exports{linked ? ', along with its colour card' : ''}. You can undo.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary">Keep family</Button></DialogClose>
            <Button variant="primary" onClick={() => { deleteFamily(family.id); setConfirmDelete(false); toast(`Deleted ${family.familyName}`, { description: 'Undo with Ctrl/⌘ Z.' }); }}>Delete family</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </InspectorSection>
  );

  if (step === null) {
    return (
      <Inspector title={`Edit ${family.familyName}`} onClose={onClose}>
        {familySection}
        <InspectorSection label="Shade"><InspectorEmpty>Select a step in the ramp to edit or lock it.</InspectorEmpty></InspectorSection>
      </Inspector>
    );
  }

  const shade = family.shades[step];
  const token = `${family.familyName}-${step}`;
  return (
    <Inspector title={`Edit ${token}`} onClose={onClose}>
      <InspectorSection label="Value">
        <ColourField
          value={shade}
          pickerLabel={`Pick a new colour for ${token}`}
          onChange={(oklch) => {
            const wasLocked = shade.locked;
            const checks = editShade(family.id, step, oklch);
            if (!wasLocked) toast(`${token} edited and locked`, { description: 'Locked shades are kept when the scale regenerates.' });
            if (checks && !checks.monotonic) toast('Lightness order is broken', { description: `Step ${checks.monotonicBreaks.join(', ')} is not darker than the step before it.` });
          }}
        />
        {shade.gamutMapped && <p className="mt-2 text-[12px] leading-4 text-muted">Chroma was reduced to fit sRGB — the HEX is the nearest displayable colour.</p>}
      </InspectorSection>

      <InspectorSection label="Regeneration">
        <Button variant="secondary" size="sm" onClick={() => toggleShadeLock(family.id, step)} aria-pressed={shade.locked} className="w-full justify-start">
          {shade.locked ? <Lock strokeWidth={1.5} /> : <LockOpen strokeWidth={1.5} />}
          {shade.locked ? 'Locked — click to unlock' : 'Unlocked — click to lock'}
        </Button>
        <p className="mt-2 text-[12px] leading-4 text-muted">{shade.locked ? 'Kept through base and control changes. Unlocking returns it to the generated value.' : 'Follows the base colour and the scale controls.'}</p>
      </InspectorSection>

      <InspectorSection label="Token">
        <div className="space-y-0.5">
          <CopyRow label="Primitive" value={token} />
          <CopyRow label="CSS" value={`var(--color-${token})`} />
          <CopyRow label="Tailwind" value={`bg-${token}`} />
        </div>
      </InspectorSection>

      <InspectorSection label="Contrast (WCAG 2.2, normal text)">
        <ContrastRows hex={shade.hex} />
      </InspectorSection>

      {familySection}
    </Inspector>
  );
}
