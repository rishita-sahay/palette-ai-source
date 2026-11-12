import { useEffect } from 'react';
import { ColourInspector } from '@/components/palette/ColourInspector';
import { ShadeInspector } from '@/components/colour-scales/ShadeInspector';
import { toast } from '@/components/ui/toaster';
import { useShortcuts } from '@/hooks/use-shortcuts';
import { ColourScales } from '@/pages/ColourScales';
import { ComingNext } from '@/pages/ComingNext';
import { DeveloperExport, ExportInspector } from '@/pages/DeveloperExport';
import { PaletteStudio } from '@/pages/PaletteStudio';
import { selectPalette, useProjectStore } from '@/store/project-store';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/** The Nestly frame: one white rounded card floated on the slate canvas. No shadow — the dark margin is the lift. */
export function AppShell() {
  useShortcuts();
  const module = useProjectStore((s) => s.ui.module);
  const hasPalette = !!useProjectStore(selectPalette);
  const loadIssue = useProjectStore((s) => s.loadIssue);
  const dismissLoadIssue = useProjectStore((s) => s.dismissLoadIssue);

  useEffect(() => {
    if (!loadIssue) return;
    toast('Saved project couldn’t be read', { description: 'Started a fresh project. The unreadable data was kept in browser storage as a backup.', duration: 10000 });
    dismissLoadIssue();
  }, [loadIssue, dismissLoadIssue]);

  const inspector =
    module === 'palette' ? (hasPalette ? <ColourInspector /> : null)
    : module === 'scales' ? <ShadeInspector />
    : module === 'export' ? <ExportInspector />
    : null;

  return (
    <div className="h-full bg-canvas py-4 pr-[max(16px,env(safe-area-inset-right,0px))] pl-[max(16px,env(safe-area-inset-left,0px))] lg:p-8">
      <div className="flex h-full flex-col overflow-hidden rounded-frame bg-surface">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <div className="scroll-quiet flex min-w-0 flex-1 flex-col overflow-y-auto xl:flex-row xl:overflow-hidden">
            <main className="scroll-quiet min-w-0 flex-1 xl:overflow-y-auto" key={module}>
              {module === 'palette' && <PaletteStudio />}
              {module === 'scales' && <ColourScales />}
              {module === 'export' && <DeveloperExport />}
              {(module === 'tokens' || module === 'themes' || module === 'accessibility') && <ComingNext module={module} />}
            </main>
            {inspector}
          </div>
        </div>
      </div>
    </div>
  );
}
