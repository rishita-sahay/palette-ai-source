import { Braces, Code2, Contrast, Layers, Palette as PaletteIcon, SunMoon, type LucideIcon } from 'lucide-react';
import { useProjectStore, type ModuleId } from '@/store/project-store';
import { cn } from '@/utils/cn';

export const MODULES: { id: ModuleId; label: string; icon: LucideIcon; ready: boolean }[] = [
  { id: 'palette', label: 'Palette Studio', icon: PaletteIcon, ready: true },
  { id: 'scales', label: 'Colour Scales', icon: Layers, ready: true },
  { id: 'tokens', label: 'Token Manager', icon: Braces, ready: false },
  { id: 'themes', label: 'Theme Studio', icon: SunMoon, ready: false },
  { id: 'accessibility', label: 'Accessibility', icon: Contrast, ready: false },
  { id: 'export', label: 'Developer Export', icon: Code2, ready: true },
];

export function Sidebar() {
  const module = useProjectStore((s) => s.ui.module);
  const setModule = useProjectStore((s) => s.setModule);
  const seeds = useProjectStore((s) => s.project.palettes[0]?.colours.length ?? 0);
  const families = useProjectStore((s) => s.project.colourFamilies.length);

  return (
    <nav aria-label="Modules" className="flex w-14 shrink-0 flex-col border-r border-line p-2 lg:w-[216px] lg:p-3">
      <p className="mb-1.5 hidden px-2.5 pt-1 text-[12px] font-medium text-faint lg:block">Workspace</p>
      <ul className="flex flex-col gap-0.5">
        {MODULES.map(({ id, label, icon: Icon, ready }) => {
          const active = module === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => setModule(id)}
                aria-current={active ? 'page' : undefined}
                title={label}
                className={cn(
                  'flex h-10 w-full items-center gap-2.5 rounded-field px-2.5 text-left text-[13px] font-medium transition-colors',
                  active ? 'bg-brand-tint text-brand' : 'text-label hover:bg-soft hover:text-ink',
                )}
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                <span className="hidden flex-1 truncate lg:block">{label}</span>
                {!ready && <span className="hidden text-[11px] font-normal text-faint lg:block">Next</span>}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto hidden rounded-control bg-soft p-3.5 lg:block">
        <p className="text-[13px] leading-[18px] font-medium text-ink">This system</p>
        <dl className="mt-2 space-y-1 text-[13px] leading-[18px] text-muted">
          <div className="flex justify-between"><dt>Palette seeds</dt><dd className="text-ink tabular-nums">{seeds}</dd></div>
          <div className="flex justify-between"><dt>Colour families</dt><dd className="text-ink tabular-nums">{families}</dd></div>
          <div className="flex justify-between"><dt>Primitive tokens</dt><dd className="text-ink tabular-nums">{families * 11}</dd></div>
        </dl>
        <p className="mt-3 border-t border-line pt-2.5 text-[12px] leading-4 text-muted">Saved in this browser only. Nothing leaves your device.</p>
      </div>
    </nav>
  );
}
