import { useState } from 'react';
import { ArrowLeft, ArrowRight, Copy, GripVertical, Lock, LockOpen, MoreHorizontal, Trash2 } from 'lucide-react';
import type { PaletteColour } from '@/types';
import { readableOn } from '@/lib/contrast';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/utils/cn';

const DRAG_TYPE = 'application/x-palette-colour';

interface Props {
  colour: PaletteColour;
  index: number;
  count: number;
  selected: boolean;
  onSelect: () => void;
  onToggleLock: () => void;
  onMove: (toIndex: number) => void;
  onDropColour: (draggedId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function SwatchCard({ colour, index, count, selected, onSelect, onToggleLock, onMove, onDropColour, onDuplicate, onDelete }: Props) {
  const [over, setOver] = useState(false);
  const fg = readableOn(colour.hex);
  return (
    <li
      className={cn('group min-w-[132px] flex-1 rounded-control', over && 'outline-2 outline-offset-4 outline-ink outline-dashed')}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, colour.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_TYPE)) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData(DRAG_TYPE);
        if (id && id !== colour.id) onDropColour(id);
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${colour.name}, ${colour.hex}${colour.locked ? ', locked' : ''}. Select to edit.`}
        className={cn('swatch-edge relative block h-44 w-full rounded-control transition-[outline]', selected && 'outline-2 outline-offset-2 outline-ink')}
        style={{ background: colour.hex, color: fg }}
      >
        <GripVertical className="absolute top-3 left-2.5 size-4 cursor-grab opacity-0 transition-opacity group-hover:opacity-60" strokeWidth={1.5} aria-hidden />
        {colour.locked && (
          <span className="absolute top-3 right-3 flex items-center gap-1 text-[12px] font-medium">
            <Lock className="size-3.5" strokeWidth={1.75} aria-hidden /> Locked
          </span>
        )}
        {colour.familyId && <span className="absolute bottom-3 left-3 text-[12px] font-medium opacity-80">Has a scale</span>}
      </button>
      <div className="mt-2.5 flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate text-sm leading-5 font-medium text-ink">{colour.name}</p>
          <p className="font-mono text-[13px] leading-5 text-muted">{colour.hex}</p>
        </div>
        <div className="flex shrink-0">
          <Button variant="quiet" size="icon-sm" onClick={onToggleLock} aria-label={colour.locked ? `Unlock ${colour.name}` : `Lock ${colour.name}`} aria-pressed={colour.locked} title={colour.locked ? 'Locked — kept when regenerating' : 'Unlocked — changes when regenerating'} className={cn(colour.locked && 'text-ink')}>
            {colour.locked ? <Lock strokeWidth={1.5} /> : <LockOpen strokeWidth={1.5} />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="quiet" size="icon-sm" aria-label={`More actions for ${colour.name}`}><MoreHorizontal strokeWidth={1.5} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(index - 1)}><ArrowLeft strokeWidth={1.5} /> Move left</DropdownMenuItem>
              <DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove(index + 1)}><ArrowRight strokeWidth={1.5} /> Move right</DropdownMenuItem>
              <DropdownMenuItem onSelect={onDuplicate}><Copy strokeWidth={1.5} /> Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={count <= 1} onSelect={onDelete}><Trash2 strokeWidth={1.5} /> Delete…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}
