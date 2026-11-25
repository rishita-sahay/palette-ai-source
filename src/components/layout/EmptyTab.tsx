import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/store/project-store';
import { Eyebrow } from './Eyebrow';
import { TwoToneHeadline } from './TwoToneHeadline';

/** Shown on Code, Guide and Brandkit before there is a palette. */
export function EmptyTab({ eyebrow, lead, rest, body }: { eyebrow: string; lead: string; rest: string; body: string }) {
  const setTab = useProjectStore((s) => s.setTab);
  return (
    <div className="flex min-h-full flex-col justify-center p-6 sm:p-8 lg:p-12">
      <Eyebrow>{eyebrow}</Eyebrow>
      <TwoToneHeadline as="h1" size="section" className="mt-4 max-w-xl" lead={lead} rest={rest} />
      <p className="mt-4 max-w-lg text-sm leading-6 text-muted">{body}</p>
      <div className="mt-7"><Button variant="primary" size="lg" onClick={() => setTab('preview')}>Start a palette <ArrowRight strokeWidth={1.5} /></Button></div>
    </div>
  );
}
