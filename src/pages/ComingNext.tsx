import { ArrowRight } from 'lucide-react';
import { formatOklch } from '@/lib/colour-engine';
import { derivePrimitives } from '@/lib/exporters';
import { Eyebrow } from '@/components/layout/Eyebrow';
import { TwoToneHeadline } from '@/components/layout/TwoToneHeadline';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useProjectStore, type ModuleId } from '@/store/project-store';

const COPY: Record<'tokens' | 'themes' | 'accessibility', { eyebrow: string; lead: string; rest: string; body: string; planned: string[] }> = {
  tokens: {
    eyebrow: 'Token Manager',
    lead: 'Not built yet.',
    rest: 'Your primitive tokens are already here.',
    body: 'Every scale step is a primitive token named {family}-{step}. The next iteration adds semantic tokens on top.',
    planned: ['Semantic tokens (background, surface, text, border, action, feedback) that reference primitives, never copy them', 'Rename, regroup, search and filter', 'Deleting a primitive is blocked while a semantic token still points at it'],
  },
  themes: {
    eyebrow: 'Theme Studio',
    lead: 'Not built yet.',
    rest: 'Light and dark themes come next.',
    body: 'Each theme will be its own semantic → primitive mapping, so dark mode is a deliberate remap and not an inverted copy.',
    planned: ['Light and dark themes with per-theme mappings', 'A dark theme generated from light, then editable role by role', 'Live component preview: nav, buttons, inputs, cards, badges, table, alerts'],
  },
  accessibility: {
    eyebrow: 'Accessibility',
    lead: 'Not built yet.',
    rest: 'Contrast checks per theme come next.',
    body: 'The WCAG 2.2 contrast maths is already in place and tested — you can see it in the inspector for any colour or shade. The dashboard arrives with semantic tokens.',
    planned: ['Pass / fail for every semantic pair in each theme (4.5:1 text, 3:1 large text, 3:1 UI)', 'A nearer passing shade suggested from the same scale', 'Suggestions applied only when you click — nothing changes silently'],
  },
};

export function ComingNext({ module }: { module: 'tokens' | 'themes' | 'accessibility' }) {
  const copy = COPY[module];
  const families = useProjectStore((s) => s.project.colourFamilies);
  const setModule = useProjectStore((s) => s.setModule);
  const primitives = module === 'tokens' ? derivePrimitives(families) : [];
  const goTo: ModuleId = families.length ? 'scales' : 'palette';

  return (
    <div className="p-8 lg:p-12">
      <Eyebrow>{copy.eyebrow}</Eyebrow>
      <TwoToneHeadline as="h1" size="section" className="mt-4 max-w-2xl" lead={copy.lead} rest={copy.rest} />
      <p className="mt-4 max-w-xl text-sm leading-6 text-muted">{copy.body}</p>
      <h2 className="mt-8 text-[13px] leading-[18px] font-medium text-label">Planned for this module</h2>
      <ul className="mt-2.5 max-w-xl space-y-2 text-sm leading-6 text-ink">
        {copy.planned.map((item) => <li key={item} className="flex gap-3"><span className="mt-3 h-px w-3 shrink-0 bg-faint" aria-hidden />{item}</li>)}
      </ul>

      {module === 'tokens' && (
        <section className="mt-10">
          <h2 className="mb-2 text-[13px] leading-[18px] font-medium text-label">Primitive tokens ({primitives.length}) — read-only for now</h2>
          {primitives.length === 0 ? (
            <Button variant="secondary" onClick={() => setModule(goTo)}>Generate scales first <ArrowRight strokeWidth={1.5} /></Button>
          ) : (
            <div className="rounded-control border border-line">
              <Table>
                <TableHeader><TableRow><TableHead>Token</TableHead><TableHead>HEX</TableHead><TableHead>OKLCH</TableHead><TableHead>CSS variable</TableHead></TableRow></TableHeader>
                <TableBody>
                  {primitives.map((t) => (
                    <TableRow key={t.name}>
                      <TableCell><span className="flex items-center gap-2.5 font-medium"><span className="swatch-edge size-5 rounded-[6px]" style={{ background: t.hex }} aria-hidden />{t.name}</span></TableCell>
                      <TableCell className="font-mono text-[13px]">{t.hex}</TableCell>
                      <TableCell className="font-mono text-[13px] whitespace-nowrap text-muted">{formatOklch(t.oklch)}</TableCell>
                      <TableCell className="font-mono text-[13px] whitespace-nowrap text-muted">--color-{t.name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
