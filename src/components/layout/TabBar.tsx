import { BookOpen, Code2, Eye, SwatchBook, type LucideIcon } from 'lucide-react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { useProjectStore, type TabId } from '@/store/project-store';

export const TAB_ITEMS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'preview', label: 'Preview', icon: Eye },
  { id: 'code', label: 'Code', icon: Code2 },
  { id: 'guide', label: 'Guide', icon: BookOpen },
  { id: 'brandkit', label: 'Brandkit', icon: SwatchBook },
];

export const tabPanelId = (id: TabId) => `panel-${id}`;
export const tabTriggerId = (id: TabId) => `tab-${id}`;

/** The four top tabs. Arrow keys move between them; the active tab carries an ink underline. */
export function TabBar() {
  const tab = useProjectStore((s) => s.ui.tab);
  const setTab = useProjectStore((s) => s.setTab);
  return (
    <TabsPrimitive.Root value={tab} onValueChange={(v) => setTab(v as TabId)} className="shrink-0 border-b border-line">
      <TabsPrimitive.List aria-label="Sections" className="scroll-quiet flex gap-1 overflow-x-auto px-3 sm:px-4 lg:px-6">
        {TAB_ITEMS.map(({ id, label, icon: Icon }) => (
          <TabsPrimitive.Trigger
            key={id}
            value={id}
            id={tabTriggerId(id)}
            aria-controls={tabPanelId(id)}
            className="relative flex h-12 shrink-0 items-center gap-2 px-3 text-sm font-medium text-muted transition-colors hover:text-ink focus-visible:outline-offset-[-2px] data-[state=active]:text-ink data-[state=active]:after:absolute data-[state=active]:after:inset-x-3 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-full data-[state=active]:after:bg-ink"
          >
            <Icon className="hidden size-4 sm:block" strokeWidth={1.5} aria-hidden />
            {label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  );
}
