import { useRef, useState } from 'react';
import { ChevronDown, Plus, RefreshCw, Sparkle } from 'lucide-react';
import { HARMONY_HINTS, HARMONY_LABELS, HARMONY_MODES, MAX_SEEDS, parseColour } from '@/lib/colour-engine';
import { FEEDBACK_NAMES, groupFamilies } from '@/lib/tokens/roles';
import type { HarmonyMode, Palette, PaletteColour } from '@/types';
import { ShadeInspector } from '@/components/colour-scales/ShadeInspector';
import { ShadeRow } from '@/components/colour-scales/ShadeRow';
import { InterpretationPanel } from '@/components/interpretation/InterpretationPanel';
import { ColourCard } from '@/components/palette/ColourCard';
import { ColourInspector } from '@/components/palette/ColourInspector';
import { PaletteHero } from '@/components/palette/PaletteHero';
import { SeedForm } from '@/components/palette/SeedForm';
import { AppPreview } from '@/components/preview/AppPreview';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toaster';
import { useMediaQuery } from '@/hooks/use-media-query';
import { selectPalette, useProjectStore } from '@/store/project-store';

export function PreviewPage() {
  const palette = useProjectStore(selectPalette);
  return palette ? <Workspace palette={palette} /> : <PaletteHero />;
}

function sourceLine(palette: Palette) {
  if (palette.source.kind === 'colour') return <>Built from <span className="font-mono text-ink">{palette.source.input}</span>.</>;
  return palette.source.brief && palette.source.brief.meta.mode !== 'fallback' ? 'Built from a brief, interpreted by AI.' : 'Built from a brief by keyword matching.';
}

/** The one-page view: colour cards, every shade row, and the live preview. Editors open beside the preview. */
function Workspace({ palette }: { palette: Palette }) {
  const project = useProjectStore((s) => s.project);
  const ui = useProjectStore((s) => s.ui);
  const store = useProjectStore.getState;
  const wide = useMediaQuery('(min-width: 1280px)');
  // On small screens the editor opens as a dialog; focus lands on the dialog, not a text field, so no keyboard pops up.
  const sheetRef = useRef<HTMLDivElement>(null);
  const [newSeedOpen, setNewSeedOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PaletteColour | null>(null);

  const { brand, feedback } = groupFamilies(project);
  const unlocked = palette.colours.filter((c) => !c.locked).length;
  const missingFeedback = FEEDBACK_NAMES.length - feedback.length;

  // An editor only shows while the thing it edits still exists (undo can remove it).
  const editing =
    ui.editor === 'colour' && palette.colours.some((c) => c.id === ui.selectedColourId) ? 'colour'
    : ui.editor === 'shade' && ui.selectedStep !== null && project.colourFamilies.some((f) => f.id === ui.selectedFamilyId) ? 'shade'
    : null;
  const close = () => store().closeEditor();
  const editor = (onClose?: () => void) => (editing === 'colour' ? <ColourInspector onClose={onClose} /> : editing === 'shade' ? <ShadeInspector onClose={onClose} /> : null);

  const regenerate = () => {
    if (store().regenerateUnlocked() === 0) toast('Every colour is locked', { description: 'Unlock at least one colour to regenerate.' });
  };
  const rows = (families: typeof brand) =>
    families.map((family) => (
      <ShadeRow
        key={family.id}
        scale={family}
        selected={editing === 'shade' && ui.selectedFamilyId === family.id ? ui.selectedStep : null}
        onSelect={(step) => store().editShadeAt(family.id, step)}
      />
    ));

  return (
    <div className="xl:flex xl:h-full xl:overflow-hidden">
      <div className="scroll-quiet min-w-0 flex-1 p-5 sm:p-6 lg:p-8 xl:overflow-y-auto">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.01em] text-ink">Colour palette</h1>
            <p className="mt-1 text-sm leading-6 text-muted">{sourceLine(palette)} Use the dropper to pick a colour, or select a card for exact values.</p>
          </div>
          <Button variant="secondary" onClick={() => setNewSeedOpen(true)}><Sparkle strokeWidth={1.5} /> New palette</Button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
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

        <ul className="mt-5 grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(172px,1fr))]" aria-label="Palette colours. Drag to reorder.">
          {palette.colours.map((colour, index) => (
            <ColourCard
              key={colour.id}
              colour={colour}
              index={index}
              count={palette.colours.length}
              selected={editing === 'colour' && colour.id === ui.selectedColourId}
              onEdit={() => store().editColour(colour.id)}
              onPick={(hex) => { const parsed = parseColour(hex); if (parsed.ok) store().updateColour(colour.id, parsed.oklch); }}
              onToggleLock={() => store().toggleColourLock(colour.id)}
              onMove={(to) => store().moveColour(colour.id, to)}
              onDropColour={(draggedId) => store().moveColour(draggedId, index)}
              onDuplicate={() => store().duplicateColour(colour.id)}
              onDelete={() => setPendingDelete(colour)}
            />
          ))}
        </ul>

        {palette.source.kind === 'prompt' && <div className="mt-5"><InterpretationPanel source={palette.source} /></div>}

        <section className="mt-10" aria-labelledby="shades-heading">
          <h2 id="shades-heading" className="text-[22px] leading-[30px] font-semibold text-ink">Colour shades</h2>
          <p className="mt-1 text-sm leading-6 text-muted">Eleven steps per colour, 50 to 950, generated in OKLCH. Select a shade to edit or lock it. The dot marks the base colour.</p>
          <div className="mt-5 space-y-6">{rows(brand)}</div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
            <div>
              <h3 className="text-[15px] leading-5 font-semibold text-ink">Feedback colours</h3>
              <p className="mt-0.5 text-[13px] leading-[18px] text-muted">For status messages. They don’t change when you regenerate the palette.</p>
            </div>
            {missingFeedback > 0 && (
              <Button variant="secondary" size="sm" onClick={() => store().addFeedback()}>
                <Plus strokeWidth={1.5} /> {feedback.length === 0 ? 'Add success, warning, error and info' : `Add the ${missingFeedback} missing`}
              </Button>
            )}
          </div>
          {feedback.length > 0 && <div className="mt-5 space-y-6">{rows(feedback)}</div>}
        </section>
      </div>

      <aside className="scroll-quiet border-t border-line xl:w-[400px] xl:shrink-0 xl:overflow-y-auto xl:border-t-0 xl:border-l" aria-label="Editor and live preview">
        {wide && editing && <div className="border-b border-line p-5">{editor(close)}</div>}
        <div className="p-5 sm:p-6 xl:p-5"><AppPreview /></div>
      </aside>

      {!wide && (
        <Dialog open={!!editing} onOpenChange={(open) => !open && close()}>
          <DialogContent ref={sheetRef} tabIndex={-1} className="scroll-quiet max-h-[88dvh] overflow-y-auto outline-none" aria-describedby={undefined} onOpenAutoFocus={(e) => { e.preventDefault(); sheetRef.current?.focus(); }}>
            <DialogTitle className="sr-only">Edit</DialogTitle>
            {editor()}
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={newSeedOpen} onOpenChange={setNewSeedOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Start a new palette</DialogTitle>
            <DialogDescription>This replaces the current colours and their shades. Feedback colours stay, and you can undo.</DialogDescription>
          </DialogHeader>
          <SeedForm onDone={() => setNewSeedOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{pendingDelete?.name}”?</DialogTitle>
            <DialogDescription>The colour and its 11 shades ({pendingDelete?.name}-50 to {pendingDelete?.name}-950) are removed from the palette and from exports. You can undo.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary">Keep colour</Button></DialogClose>
            <Button variant="primary" onClick={() => { if (pendingDelete) { store().deleteColour(pendingDelete.id); toast(`Deleted ${pendingDelete.name}`, { description: 'Undo with Ctrl/⌘ Z.' }); } setPendingDelete(null); }}>Delete colour</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
