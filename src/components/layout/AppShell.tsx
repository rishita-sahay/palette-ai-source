import { useEffect } from 'react';
import { toast } from '@/components/ui/toaster';
import { useShortcuts } from '@/hooks/use-shortcuts';
import { BrandkitPage } from '@/pages/BrandkitPage';
import { CodePage } from '@/pages/CodePage';
import { GuidePage } from '@/pages/GuidePage';
import { PreviewPage } from '@/pages/PreviewPage';
import { useProjectStore } from '@/store/project-store';
import { TabBar, tabPanelId, tabTriggerId } from './TabBar';
import { TopBar } from './TopBar';

/** Full-screen app shell: top bar, the four tabs, and the active tab's page filling the rest of the window. */
export function AppShell() {
  useShortcuts();
  const tab = useProjectStore((s) => s.ui.tab);
  const loadIssue = useProjectStore((s) => s.loadIssue);
  const dismissLoadIssue = useProjectStore((s) => s.dismissLoadIssue);

  useEffect(() => {
    if (!loadIssue) return;
    toast('Saved project couldn’t be read', { description: 'Started a fresh project. The unreadable data was kept in browser storage as a backup.', duration: 10000 });
    dismissLoadIssue();
  }, [loadIssue, dismissLoadIssue]);

  return (
    <div className="h-full bg-surface pr-[env(safe-area-inset-right,0px)] pl-[env(safe-area-inset-left,0px)]">
      <div className="flex h-full flex-col overflow-hidden">
        <TopBar />
        <TabBar />
        <main className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
          <div key={tab} id={tabPanelId(tab)} role="tabpanel" aria-labelledby={tabTriggerId(tab)} className="h-full">
            {tab === 'preview' && <PreviewPage />}
            {tab === 'code' && <CodePage />}
            {tab === 'guide' && <GuidePage />}
            {tab === 'brandkit' && <BrandkitPage />}
          </div>
        </main>
      </div>
    </div>
  );
}
