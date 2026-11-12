import type { PaletteSource } from '@/types';
import { Badge } from '@/components/ui/badge';

const CATEGORY_LABEL = { hue: 'Colour', temperature: 'Temperature', mood: 'Mood', industry: 'Industry', role: 'Role' } as const;

/**
 * Shown for every prompt-seeded palette (PS-001). States plainly that the result came from
 * keyword matching, lists the words that were used and what each did, and the words that were ignored.
 */
export function DeterministicNote({ source }: { source: PaletteSource }) {
  if (source.kind !== 'prompt') return null;
  const interpreted = source.interpreted ?? [];
  const unmatched = source.unmatched ?? [];
  return (
    <section className="rounded-control border border-line p-4" aria-label="How this palette was generated">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Badge>Generated deterministically from keywords</Badge>
        <p className="text-[13px] leading-[18px] text-muted">No AI model was involved. The same brief always gives the same palette.</p>
      </div>
      <p className="mt-3 text-sm leading-6 text-ink">“{source.input}”</p>
      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] leading-[18px] sm:grid-cols-2">
        {interpreted.map((term, i) => (
          <div key={`${term.term}-${i}`} className="flex gap-2">
            <dt className="shrink-0 font-medium text-ink">{term.term}</dt>
            <dd className="text-muted"><span className="sr-only">{CATEGORY_LABEL[term.category]}: </span>{term.effect}</dd>
          </div>
        ))}
      </dl>
      {unmatched.length > 0 && (
        <p className="mt-3 border-t border-line pt-3 text-[13px] leading-[18px] text-muted">
          <span className="font-medium text-ink">Not in the dictionary, ignored:</span> {unmatched.join(', ')}
        </p>
      )}
    </section>
  );
}
