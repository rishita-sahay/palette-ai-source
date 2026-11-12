import { useState } from 'react';
import { Plus } from 'lucide-react';
import { SCALE_STEPS } from '@/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FieldLabel, Input } from '@/components/ui/input';
import { useProjectStore } from '@/store/project-store';
import { cn } from '@/utils/cn';

export function AddFamilyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const addFamily = useProjectStore((s) => s.addFamily);
  const [name, setName] = useState('');
  const [colour, setColour] = useState('#7C3AED');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const result = addFamily(name, colour);
    if (!result.ok) return setError(result.error);
    setName('');
    setError(null);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setError(null); }}>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <DialogHeader>
            <DialogTitle>Add a colour family</DialogTitle>
            <DialogDescription>A family is one base colour and its 11-step scale.</DialogDescription>
          </DialogHeader>
          <FieldLabel htmlFor="family-name">Name</FieldLabel>
          <Input id="family-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="brand, accent, plum…" autoFocus autoComplete="off" />
          <p className="mt-1.5 text-[12px] leading-4 text-muted">Lowercase letters, numbers and dashes. Used in token names.</p>
          <FieldLabel htmlFor="family-colour" className="mt-4">Base colour</FieldLabel>
          <Input id="family-colour" value={colour} onChange={(e) => setColour(e.target.value)} className="font-mono" spellCheck={false} autoComplete="off" />
          <p role="alert" className={error ? 'mt-3 text-[13px] leading-[18px] text-danger' : 'hidden'}>{error}</p>
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
            <Button type="submit" variant="primary">Add family</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FamilyTabs() {
  const families = useProjectStore((s) => s.project.colourFamilies);
  const selectedId = useProjectStore((s) => s.ui.selectedFamilyId);
  const selectFamily = useProjectStore((s) => s.selectFamily);
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Colour families">
      {families.map((family) => {
        const active = family.id === selectedId;
        return (
          <button
            key={family.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => selectFamily(family.id)}
            className={cn('flex items-center gap-2.5 rounded-control border py-1.5 pr-3.5 pl-1.5 text-[13px] font-medium transition-colors', active ? 'border-ink text-ink' : 'border-line text-muted hover:text-ink')}
          >
            <span className="swatch-edge flex h-7 w-11 overflow-hidden rounded-[7px]" aria-hidden>
              {SCALE_STEPS.filter((_, i) => i % 2 === 1).map((step) => <span key={step} className="flex-1" style={{ background: family.shades[step].hex }} />)}
            </span>
            {family.familyName}
          </button>
        );
      })}
      <Button variant="ghost" size="sm" onClick={() => setAdding(true)}><Plus strokeWidth={1.5} /> Add family</Button>
      <AddFamilyDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
