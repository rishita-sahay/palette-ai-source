import { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { formatRatio } from '@/lib/contrast';
import { buildGuide, type FamilyGuide } from '@/lib/guide';
import { EmptyTab } from '@/components/layout/EmptyTab';
import { Badge } from '@/components/ui/badge';
import { selectPalette, useProjectStore } from '@/store/project-store';

const KIND_LABEL = { primary: 'Primary', accent: 'Accent', neutral: 'Neutral', feedback: 'Feedback', other: 'Extra' } as const;

function Recipe({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-line py-1.5 first:border-0">
      <dt className="text-[13px] leading-[18px] text-muted">{label}</dt>
      <dd className="text-right font-mono text-[13px] leading-[18px] text-ink">{value}</dd>
    </div>
  );
}

function FamilyCard({ f }: { f: FamilyGuide }) {
  const fill = f.steps.find((s) => s.step === f.fillStep)!;
  return (
    <article className="rounded-control border border-line p-4">
      <div className="flex items-center gap-3">
        <span className="swatch-edge flex size-11 shrink-0 items-center justify-center rounded-field text-[13px] font-semibold" style={{ background: fill.hex, color: f.fillText === 'white' ? '#FFFFFF' : '#0A0A0A' }} aria-hidden>Aa</span>
        <div className="min-w-0">
          <h3 className="truncate text-[15px] leading-5 font-semibold text-ink capitalize">{f.name}</h3>
          <p className="text-[12px] leading-4 text-muted">{KIND_LABEL[f.kind]} · base {f.baseHex}</p>
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-[18px] text-ink">{f.use}</p>
      <dl className="mt-3">
        <Recipe label="Solid fill" value={`${f.name}-${f.fillStep}, ${f.fillText} text`} />
        <Recipe label="Hover / pressed" value={`${f.name}-${f.hoverStep}`} />
        <Recipe label="Tinted background" value={`${f.name}-50, ${f.name}-${f.tintStep}`} />
        <Recipe label="Border" value={`${f.name}-200, ${f.name}-${f.borderStep}`} />
        <Recipe label="As text on white" value={f.textOnWhite ? `${f.name}-${f.textOnWhite} or darker` : 'none reaches AA'} />
        <Recipe label="As text on dark" value={f.textOnDark ? `${f.name}-${f.textOnDark} or lighter` : 'none reaches AA'} />
      </dl>
    </article>
  );
}

function RuleList({ title, items, positive }: { title: string; items: string[]; positive: boolean }) {
  const Icon = positive ? Check : X;
  return (
    <section>
      <h3 className="text-[15px] leading-5 font-semibold text-ink">{title}</h3>
      <ul className="mt-3 space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5 text-sm leading-5 text-ink">
            <Icon className={positive ? 'mt-0.5 size-4 shrink-0 text-success' : 'mt-0.5 size-4 shrink-0 text-danger'} strokeWidth={2} aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** How to use the palette. Built from rules and contrast maths on the current scales, and says so. */
export function GuidePage() {
  const project = useProjectStore((s) => s.project);
  const palette = useProjectStore(selectPalette);
  const guide = useMemo(() => buildGuide(project), [project]);
  if (!guide) {
    return <EmptyTab eyebrow="Guide" lead="No guide yet." rest="It is written from your palette." body="Once there is a palette, this tab explains where each colour goes, which text and background pairs are safe, and what to avoid." />;
  }
  const brief = palette?.source.kind === 'prompt' ? palette.source.brief : undefined;
  const summary = brief?.interpretation?.interpretation_summary;

  return (
    <div className="mx-auto max-w-[1200px] p-5 sm:p-6 lg:p-8">
      <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.01em] text-ink">Guide</h1>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">Where each colour goes and which combinations are safe. It updates with every edit.</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Badge>Written from rules and contrast maths</Badge>
        <p className="text-[13px] leading-[18px] text-muted">No AI model writes this page. The same palette always gets the same guide.</p>
      </div>

      {palette?.source.kind === 'prompt' && (
        <section className="mt-6 rounded-control bg-soft p-4">
          <h2 className="text-[13px] leading-[18px] font-medium text-label">The brief this palette answers</h2>
          <p className="mt-1.5 text-sm leading-6 text-ink">“{brief?.originalPrompt ?? palette.source.input}”</p>
          {summary && <p className="mt-1.5 text-[13px] leading-[18px] text-muted"><span className="font-medium text-ink">Read by the AI model as:</span> {summary}</p>}
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-[22px] leading-[30px] font-semibold text-ink">How much of each</h2>
        <p className="mt-1 text-sm leading-6 text-muted">A common starting point is 60–30–10: mostly neutral, a clear share of the primary, and a little accent.</p>
        <div className="swatch-edge mt-4 flex h-12 overflow-hidden rounded-control" role="img" aria-label={guide.proportions.map((p) => `${p.share}% ${p.name}`).join(', ')}>
          {guide.proportions.map((p) => <div key={p.name} style={{ width: `${p.share}%`, background: p.hex }} />)}
        </div>
        <ul className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 text-[13px] leading-[18px]">
          {guide.proportions.map((p) => (
            <li key={p.name}><span className="font-medium text-ink tabular-nums">{p.share}% {p.name}</span> <span className="text-muted">· {p.note}</span></li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-[22px] leading-[30px] font-semibold text-ink">Where each colour goes</h2>
        <p className="mt-1 text-sm leading-6 text-muted">The step to reach for in each situation. The fill step is the base colour when readable text can sit on it, otherwise the lightest darker step that can.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {guide.families.map((f) => <FamilyCard key={f.id} f={f} />)}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-[22px] leading-[30px] font-semibold text-ink">Text on every shade</h2>
        <p className="mt-1 text-sm leading-6 text-muted">Each shade is labelled in the text colour that reads best on it, white or near-black, with the contrast ratio it gives.</p>
        <div className="mt-4 space-y-4">
          {guide.families.map((f) => (
            <div key={f.id}>
              <h3 className="text-[13px] leading-[18px] font-medium text-ink capitalize">{f.name}</h3>
              <ol className="mt-1.5 grid grid-cols-6 gap-1.5 sm:grid-cols-11" aria-label={`${f.name}: best text colour per step`}>
                {f.steps.map((s) => (
                  <li key={s.step} className="swatch-edge flex h-16 flex-col items-center justify-center rounded-field" style={{ background: s.hex, color: s.text }} title={`${f.name}-${s.step}: ${s.text === '#FFFFFF' ? 'white' : 'dark'} text, ${formatRatio(s.ratio)}`}>
                    <span className="text-[13px] leading-4 font-semibold tabular-nums">{s.step}</span>
                    <span className="font-mono text-[11px] leading-4 tabular-nums">{(Math.floor(s.ratio * 10) / 10).toFixed(1)}</span>
                    <span className="text-[10px] leading-3 font-medium">{s.text === '#FFFFFF' ? 'white' : 'dark'}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-x-10 gap-y-8 border-t border-line pt-8 md:grid-cols-2">
        <RuleList title="Do" items={guide.dos} positive />
        <RuleList title="Don’t" items={guide.donts} positive={false} />
      </section>
    </div>
  );
}
