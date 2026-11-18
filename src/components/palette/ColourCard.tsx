import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, GripVertical, Lock, LockOpen, MoreHorizontal, Pipette, Trash2 } from 'lucide-react';
import type { PaletteColour } from '@/types';
import { formatHsl, formatRgb } from '@/lib/colour-engine';
import { readableOn } from '@/lib/contrast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Segmented } from '@/components/ui/segmented';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/utils/cn';
import { copyText } from '@/utils/download';

const DRAG_TYPE = 'application/x-palette-colour';
const FORMATS = [{ value: 'hex', label: 'HEX' }, { value: 'rgb', label: 'RGB' }, { value: 'hsl', label: 'HSL' }] as const;
type Format = (typeof FORMATS)[number]['value'];

export const formatColour = (colour: Pick<PaletteColour, 'hex' | 'rgb' | 'hsl'>, format: Format) =>
  format === 'hex' ? colour.hex : format === 'rgb' ? formatRgb(colour.rgb) : formatHsl(colour.hsl);

interface Props {
  colour: PaletteColour;
  index: number;
  count: number;
  selected: boolean;
  onEdit: () => void;
  /** Called with a HEX value as the picker moves. */
  onPick: (hex: string) => void;
  onToggleLock: () => void;
  onMove: (toIndex: number) => void;
  onDropColour: (draggedId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** One palette colour: the swatch (select to edit), a colour picker, its value in HEX / RGB / HSL with copy, lock and reorder. */
export function ColourCard({ colour, index, count, selected, onEdit, onPick, onToggleLock, onMove, onDropColour, onDuplicate, onDelete }: Props) {
  const [over, setOver] = useState(false);
  const [format, setFormat] = useState<Format>('hex');
  const [copied, setCopied] = useState(false);
  const fg = readableOn(colour.hex);
  const value = formatColour(colour, format);
  const onSwatch = 'flex size-7 items-center justify-center rounded-field hover:bg-current/10 focus-visible:outline-current';

  const copy = async () => {
    if (!(await copyText(value))) return toast('Copy was blocked by the browser');
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
    toast(`Copied ${value}`);
  };

  return (
    <li
      className={cn('group flex overflow-hidden rounded-control border border-line bg-surface sm:block', selected && 'outline-2 outline-offset-2 outline-ink', over && 'outline-2 outline-offset-4 outline-ink outline-dashed')}
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
      <div className="relative min-h-24 w-[42%] shrink-0 sm:h-28 sm:w-auto" style={{ background: colour.hex, color: fg }}>
        <button type="button" onClick={onEdit} aria-pressed={selected} aria-label={`Edit ${colour.name}, ${colour.hex}${colour.locked ? ', locked' : ''}`} className="absolute inset-0 flex items-end p-3 text-left focus-visible:outline-current focus-visible:outline-offset-[-4px]">
          <span className="truncate text-[17px] leading-6 font-medium capitalize">{colour.name}</span>
        </button>
        <GripVertical className="pointer-events-none absolute top-3 left-2 size-4 cursor-grab opacity-0 transition-opacity group-hover:opacity-60" strokeWidth={1.5} aria-hidden />
        <div className="absolute top-2 right-2 flex">
          <label className={cn(onSwatch, 'relative cursor-pointer opacity-70 focus-within:opacity-100 focus-within:outline-2 focus-within:outline-current hover:opacity-100')} title="Pick a colour">
            <Pipette className="size-4" strokeWidth={1.5} aria-hidden />
            <span className="sr-only">Pick a colour for {colour.name}</span>
            <input type="color" value={colour.hex.toLowerCase()} onChange={(e) => onPick(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
          </label>
          <button type="button" onClick={onToggleLock} aria-pressed={colour.locked} aria-label={colour.locked ? `Unlock ${colour.name}` : `Lock ${colour.name}`} title={colour.locked ? 'Locked: kept when regenerating' : 'Unlocked: changes when regenerating'} className={cn(onSwatch, !colour.locked && 'opacity-70 hover:opacity-100')}>
            {colour.locked ? <Lock className="size-4" strokeWidth={1.75} /> : <LockOpen className="size-4" strokeWidth={1.5} />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`More actions for ${colour.name}`} className={cn(onSwatch, 'opacity-70 hover:opacity-100')}><MoreHorizontal className="size-4" strokeWidth={1.5} /></button>
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
      <div className="flex min-w-0 flex-1 flex-col justify-center p-3">
        <div className="flex items-center justify-between gap-1">
          <Segmented size="sm" value={format} onChange={setFormat} options={FORMATS} label={`Value format for ${colour.name}`} />
          <button type="button" onClick={copy} aria-label={`Copy ${value}`} title="Copy value" className="flex size-7 shrink-0 items-center justify-center rounded-field text-muted hover:bg-soft hover:text-ink">
            {copied ? <Check className="size-4 text-success" strokeWidth={1.75} /> : <Copy className="size-4" strokeWidth={1.5} />}
          </button>
        </div>
        <p className="mt-2.5 truncate font-mono text-[13px] leading-5 text-ink" title={value}>{value}</p>
      </div>
    </li>
  );
}
