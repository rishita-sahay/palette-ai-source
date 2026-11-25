import { useId, useState } from 'react';
import { Loader2, TriangleAlert, Wand2 } from 'lucide-react';
import type { BriefRecord, PaletteSource } from '@/types';
import { DeterministicNote } from '@/components/palette/DeterministicNote';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { FieldLabel, Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toaster';
import { PROMPT_LIMIT } from '@/lib/interpretation/schema';
import { useProjectStore } from '@/store/project-store';

const SCALES = {
  lightness: ['Dark', 'Medium-dark', 'Medium', 'Medium-light', 'Light'],
  chroma: ['Muted', 'Soft', 'Moderate', 'Rich', 'Vivid'],
  contrast: ['Soft', 'Gentle', 'Medium', 'Strong', 'High'],
} as const;
const TEMPERATURE_LABEL = { warm: 'Warm', cool: 'Cool', neutral: 'Neutral', 'warm-neutral': 'Warm-neutral', 'cool-neutral': 'Cool-neutral' } as const;
const BASIS_LABEL = { stated: 'you said so', context: 'read from the brief', 'context+associations': 'brief + associations', associations: 'from an association', default: 'default' } as const;

const word = (scale: readonly string[], value: number) => scale[Math.min(4, Math.floor(value * 5))];
const list = (items: string[]) => items.join(', ');

function Meter({ label, value, scale, basis }: { label: string; value: number; scale: readonly string[]; basis: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <dt className="text-[13px] leading-[18px] font-medium text-label">{label}</dt>
        <dd className="text-[13px] leading-[18px] font-medium text-ink">{word(scale, value)}</dd>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-soft" role="img" aria-label={`${label}: ${word(scale, value)}, ${Math.round(value * 100)} out of 100`}>
        <div className="h-full rounded-full bg-ink" style={{ width: `${Math.max(4, value * 100)}%` }} />
      </div>
      <p className="mt-1 text-[12px] leading-4 text-muted">{basis}</p>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[13px] leading-[18px] font-medium text-label">{label}</dt>
      <dd className="mt-0.5 text-sm leading-5 text-ink">{children}</dd>
    </div>
  );
}

function RefineForm({ brief }: { brief: BriefRecord }) {
  const refineBrief = useProjectStore((s) => s.refineBrief);
  const id = useId();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const fallback = brief.meta.mode === 'fallback';

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setNote(null);
    const result = await refineBrief(text);
    setBusy(false);
    if (result.status === 'unchanged') return setNote(result.reason);
    if (result.status === 'empty') return setNote(result.fallbackReason);
    setText('');
    toast(result.mode === 'refined' ? 'Refinement applied' : 'Refinement applied with keyword matching', {
      description: result.mode === 'refined' ? 'Locked colours were kept.' : 'AI interpretation isn’t available, so only recognised keywords were used.',
    });
  };

  return (
    <form className="mt-4 border-t border-line pt-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <FieldLabel htmlFor={id}>Refine in your own words</FieldLabel>
      <div className="flex flex-wrap gap-2">
        <Input id={id} value={text} maxLength={PROMPT_LIMIT} onChange={(e) => setText(e.target.value)} disabled={busy} placeholder={fallback ? 'warmer, muted, teal accent' : 'Make it slightly warmer and less saturated'} className="min-w-52 flex-1" autoComplete="off" />
        <Button type="submit" variant="secondary" disabled={busy || !text.trim()}>
          {busy ? <Loader2 className="animate-spin" strokeWidth={1.5} /> : <Wand2 strokeWidth={1.5} />} {busy ? 'Refining…' : 'Refine'}
        </Button>
      </div>
      <p role="alert" className={note ? 'mt-2 text-[13px] leading-[18px] text-danger' : 'hidden'}>{note}</p>
      <p className="mt-1.5 text-[12px] leading-4 text-muted">
        {fallback ? 'Keyword fallback: only words in the built-in dictionary have an effect.' : 'The original brief is kept. Only what you ask to change is changed, and locked colours stay put.'}
      </p>
    </form>
  );
}

/** Shows what Palette AI understood from a brief, which interpreter produced it, and lets the user refine it. */
export function InterpretationPanel({ source }: { source: PaletteSource }) {
  const brief = source.brief;
  if (!brief) return <DeterministicNote source={source} />;

  if (brief.meta.mode === 'fallback' || !brief.interpretation || !brief.targets) {
    return (
      <section aria-label="How this palette was interpreted">
        <div className="mb-3 flex items-start gap-2.5 rounded-control bg-caution-bg px-4 py-3 text-[13px] leading-[18px] text-caution" role="status">
          <TriangleAlert className="mt-px size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          <p><span className="font-semibold">Keyword fallback used.</span> {brief.meta.fallbackReason} This palette was produced by keyword matching, not by an AI model.</p>
        </div>
        <Disclosure label="Show the keywords that were used" openLabel="Hide the keywords"><DeterministicNote source={source} /></Disclosure>
        <RefineForm brief={brief} />
      </section>
    );
  }

  const { interpretation: i, targets: t } = brief;
  const basis = (name: keyof typeof t.sources) => BASIS_LABEL[t.sources[name].basis];
  const secondary = [...new Set([...i.secondary_vibes, ...i.emotions.filter((e) => e.role === 'secondary').map((e) => e.name)])];
  const notes = [...t.adjustments, ...t.unapplied];

  return (
    <section className="rounded-control border border-line p-4" aria-label="What Palette AI understood">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Badge title={`Model: ${brief.meta.model}`}>Interpreted by AI</Badge>
        {brief.refinements.length > 0 && <Badge>Refined {brief.refinements.length}×</Badge>}
        <p className="text-[13px] leading-[18px] text-muted">The model reads the brief; the colour engine makes the colours.</p>
      </div>

      <p className="mt-3 text-sm leading-6 text-ink">{i.interpretation_summary}</p>
      {i.needs_clarification && <p className="mt-2 text-[13px] leading-[18px] text-caution">This brief was open to several readings. Add a detail below to steer it.</p>}

      <Disclosure className="mt-3" label="Show what was understood" openLabel="Hide the details">
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
        <Fact label="Primary vibe"><span className="capitalize">{i.primary_vibe}</span></Fact>
        <Fact label="Also carrying">{secondary.length ? list(secondary) : '—'}</Fact>
        <Fact label="Aesthetic">{i.aesthetic_descriptors.length ? list(i.aesthetic_descriptors) : '—'}</Fact>
        <Fact label="Temperature">{TEMPERATURE_LABEL[t.temperature]} <span className="text-[12px] text-muted">· {basis('temperature')}</span></Fact>
        <Fact label="Colours asked for">{t.appliedColours.length ? list(t.appliedColours) : 'None named'} {t.appliedColours.length === 0 && <span className="text-[12px] text-muted">· hue {basis('hue')}{t.sources.hue.note ? ` (${t.sources.hue.note})` : ''}</span>}</Fact>
        <Fact label="Kept out">{[...t.appliedExclusions, ...i.negative_constraints.filter((c) => !t.appliedExclusions.includes(c))].length ? list([...t.appliedExclusions.map((c) => `no ${c}`), ...i.negative_constraints.filter((c) => !t.appliedExclusions.some((x) => c.includes(x))).map((c) => `not ${c}`)]) : 'Nothing excluded'}</Fact>
        <Meter label="Lightness" value={t.lightness} scale={SCALES.lightness} basis={basis('lightness')} />
        <Meter label="Chroma" value={t.chroma} scale={SCALES.chroma} basis={basis('chroma')} />
        <Meter label="Contrast" value={t.contrast} scale={SCALES.contrast} basis={basis('contrast')} />
      </dl>

      {(notes.length > 0 || (brief.unresolved?.length ?? 0) > 0) && (
        <ul className="mt-4 space-y-1 border-t border-line pt-3 text-[13px] leading-[18px] text-muted">
          {notes.map((n) => <li key={n}>{n}</li>)}
          {brief.unresolved && brief.unresolved.length > 0 && (
            <li><span className="font-medium text-ink">Understood, but no stored colour association:</span> {list(brief.unresolved)}. These shaped the reading above; nothing was invented for them.</li>
          )}
        </ul>
      )}

      <div className="mt-4 border-t border-line pt-3 text-[13px] leading-[18px] text-muted">
        <p><span className="font-medium text-ink">Brief:</span> “{brief.originalPrompt}”</p>
        {brief.refinements.map((r, n) => <p key={`${r}-${n}`} className="mt-1"><span className="font-medium text-ink">Then:</span> “{r}”</p>)}
      </div>
      </Disclosure>

      <RefineForm brief={brief} />
    </section>
  );
}
