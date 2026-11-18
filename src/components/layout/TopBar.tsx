import { useEffect, useState } from 'react';
import { Check, FilePlus2, MoreHorizontal, Redo2, TriangleAlert, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useProjectStore } from '@/store/project-store';

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <rect x="0" y="0" width="22" height="22" rx="6" fill="#0A0A0A" />
        <rect x="5" y="5" width="3" height="12" rx="1.5" fill="#fff" />
        <rect x="9.5" y="5" width="3" height="12" rx="1.5" fill="#fff" opacity=".62" />
        <rect x="14" y="5" width="3" height="12" rx="1.5" fill="#fff" opacity=".3" />
      </svg>
      <span className="hidden text-[15px] font-semibold tracking-[-0.01em] text-ink sm:block">Palette AI</span>
    </div>
  );
}

function SaveStatus() {
  const save = useProjectStore((s) => s.save);
  if (save.issue && !save.issue.ok) {
    return (
      <span className="flex items-center gap-1.5 text-[13px] text-caution" role="status">
        <TriangleAlert className="size-4" strokeWidth={1.5} aria-hidden />
        {save.issue.reason === 'quota' ? 'Not saved — browser storage is full. Export a backup.' : 'Not saved — browser storage is unavailable'}
      </span>
    );
  }
  return (
    <span className="hidden items-center gap-1.5 text-[13px] text-muted md:flex" role="status">
      <Check className="size-4" strokeWidth={1.5} aria-hidden />
      {save.at ? 'Saved in this browser' : 'Nothing to save yet'}
    </span>
  );
}

export function TopBar() {
  const name = useProjectStore((s) => s.project.name);
  const renameProject = useProjectStore((s) => s.renameProject);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const newProject = useProjectStore((s) => s.newProject);
  const [draft, setDraft] = useState(name);
  const [confirmNew, setConfirmNew] = useState(false);
  useEffect(() => setDraft(name), [name]);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4 lg:px-6">
      <Logo />
      <input
        aria-label="Project name"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => (draft.trim() ? renameProject(draft) : setDraft(name))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { setDraft(name); e.currentTarget.blur(); }
        }}
        maxLength={60}
        className="h-9 min-w-0 flex-1 truncate rounded-field border border-transparent bg-transparent px-2 text-sm font-medium text-ink hover:border-line focus-visible:border-brand focus-visible:outline-0 sm:max-w-72"
      />
      <SaveStatus />
      <div className="ml-auto flex items-center gap-1">
        <Button variant="quiet" size="icon" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl/⌘ Z)"><Undo2 strokeWidth={1.5} /></Button>
        <Button variant="quiet" size="icon" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl/⌘ Shift Z)"><Redo2 strokeWidth={1.5} /></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="quiet" size="icon" aria-label="Project menu"><MoreHorizontal strokeWidth={1.5} /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setConfirmNew(true)}><FilePlus2 strokeWidth={1.5} /> New project…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={confirmNew} onOpenChange={setConfirmNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a new project?</DialogTitle>
            <DialogDescription>“{name}” will be replaced. This first version keeps one project at a time — you can undo straight afterwards, or download an export first.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary">Keep working</Button></DialogClose>
            <Button variant="primary" onClick={() => { newProject(); setConfirmNew(false); }}>Start new project</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
