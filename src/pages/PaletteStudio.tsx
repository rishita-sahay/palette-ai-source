import { useState } from 'react';
import { ArrowRight, Check, ChevronDown, Plus, RefreshCw, Sparkle } from 'lucide-react';
import { HARMONY_HINTS, HARMONY_LABELS, HARMONY_MODES, MAX_SEEDS } from '@/lib/colour-engine';
import type { HarmonyMode, PaletteColour } from '@/types';
import { InterpretationPanel } from '@/components/interpretation/InterpretationPanel';
import { PaletteHero } from '@/components/palette/PaletteHero';
import { SeedForm } from '@/components/palette/SeedForm';
import { SwatchCard } from '@/components/palette/SwatchCard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toaster';
import { selectPalette, useProjectStore } from '@/store/project-store';

export function PaletteStudio() {
  const palette = useProjectStore(selectPalette);
  const families = useProjectStore((s) => s.project.colourFamilies);
  const selectedId = useProjectStore((s) => s.ui.selectedColourId);
  const store = useProjectStore.getState;
  const [newSeedOpen, setNewSeedOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PaletteColour | null>(null);
  const [withFeedback, setWithFeedback] = useState(true);

  if (!palette) return <PaletteHero />;

  const unlocked = palette.colours.filter((c) => !c.locked).length;
  const unlinked = palette.colours.filter((c) => !c.familyId || !families.some((f) => f.id === c.familyId)).length;
  const feedbackMissing = ['success', 'warning', 'error', 'info'].filter((n) => !families.some((f) => f.familyName === n)).length;
  const toCreate = unlinked + (withFeedback ? feedbackMissing : 0);

  const regenerate = () => {
    const changed = store().regenerateUnlocked();
    if (changed === 0) toast('Every colour is locked', { description: 'Unlock at least one colour to regenerate.' });
  };
  const requestDelete = (colour: PaletteColour) => {
    // Colours that feed a scale get a confirmation; plain seeds are removed directly (undo is available).
    if (colour.familyId && families.some((f) => f.id === colour.familyId)) setPendingDelete(colour);
    else { store().deleteColour(colour.id); toast(`Removed ${colour.name}`, { description: 'Undo with Ctrl/⌘ Z.' }); }
  };
  const createScales = () => {
    const n = store().createScalesFromPalette(withFeedback);
    toast(`${n} ${n === 1 ? 'scale' : 'scales'} created`, { description: 'Each one has 11 steps, 50–950.' });
    store().setModule('scales');
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.01em] text-ink">Palette</h1>
          <p className="mt-1 text-sm leading-6 text-muted">
            {palette.source.kind === 'colour' ? <>Seeded from <span className="font-mono text-ink">{palette.source.input}</span>.</> : palette.source.brief && palette.source.brief.meta.mode !== 'fallback' ? 'Seeded from a brief, interpreted by AI.' : 'Seeded from a brief by keyword matching.'}{' '}
            Lock what you like, regenerate the rest.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setNewSeedOpen(true)}><Sparkle strokeWidth={1.5} /> New seed</Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">Harmony: {HARMONY_LABELS[palette.harmony]} <ChevronDown strokeWidth={1.5} className="text-muted" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel>Computed in OKLCH hue. Locked colours stay put.</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={palette.harmony} onValueChange={(v) => store().setHarmony(v as HarmonyMode)}>
              {HARMONY_MODES.map((mode) => (
                <DropdownMenuRadioItem key={mode} value={mode}>
                  <span className="block">{HARMONY_LABELS[mode]}</span>
                  <span className="block text-[12px] leading-4 text-muted">{HARMONY_HINTS[mode]}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="secondary" onClick={regenerate}><RefreshCw strokeWidth={1.5} /> Regenerate unlocked <span className="text-muted tabular-nums">({unlocked})</span></Button>
        <Button variant="ghost" onClick={() => store().addColour()} disabled={palette.colours.length >= MAX_SEEDS}><Plus strokeWidth={1.5} /> Add colour</Button>
      </div>

      <ul className="mt-5 flex flex-wrap gap-4" aria-label="Palette colours. Drag to reorder.">
        {palette.colours.map((colour, index) => (
          <SwatchCard
            key={colour.id}
            colour={colour}
            index={index}
            count={palette.colours.length}
            selected={colour.id === selectedId}
            onSelect={() => store().selectColour(colour.id)}
            onToggleLock={() => store().toggleColourLock(colour.id)}
            onMove={(to) => store().moveColour(colour.id, to)}
            onDropColour={(draggedId) => store().moveColour(draggedId, index)}
            onDuplicate={() => store().duplicateColour(colour.id)}
            onDelete={() => requestDelete(colour)}
          />
        ))}
      </ul>

      {palette.source.kind === 'prompt' && <div className="mt-6"><InterpretationPanel source={palette.source} /></div>}

      <section className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
        <div>
          <h2 className="text-[22px] leading-[30px] font-semibold text-ink">Next: tonal scales</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
            {toCreate > 0 ? 'Each colour becomes an 11-step OKLCH scale (50–950), named after the colour.' : 'Every colour here already has a scale. Edits to a colour flow into its scale.'}
          </p>
          {feedbackMissing > 0 && (
            <label className="mt-2.5 flex w-fit cursor-pointer items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={withFeedback} onChange={(e) => setWithFeedback(e.target.checked)} className="size-4 accent-ink" />
              Also add success, warning, error and info
            </label>
          )}
        </div>
        {toCreate > 0 ? (
          <Button variant="primary" size="lg" onClick={createScales}>Create {toCreate} {toCreate === 1 ? 'scale' : 'scales'} <ArrowRight strokeWidth={1.5} /></Button>
        ) : (
          <Button variant="secondary" size="lg" onClick={() => store().setModule('scales')}><Check strokeWidth={1.5} /> Open Colour Scales</Button>
        )}
      </section>

      <Dialog open={newSeedOpen} onOpenChange={setNewSeedOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Start from a new seed</DialogTitle>
            <DialogDescription>This replaces the current palette. Existing scales stay as they are, and you can undo.</DialogDescription>
          </DialogHeader>
          <SeedForm onDone={() => setNewSeedOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{pendingDelete?.name}”?</DialogTitle>
            <DialogDescription>
              This colour feeds the “{pendingDelete?.name}” scale. The scale and its 11 tokens are kept — it just stops following this palette colour.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary">Keep colour</Button></DialogClose>
            <Button variant="primary" onClick={() => { if (pendingDelete) store().deleteColour(pendingDelete.id); setPendingDelete(null); }}>Delete colour</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
