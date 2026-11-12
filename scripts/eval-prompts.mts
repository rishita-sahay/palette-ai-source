// Runs every evaluation prompt through (1) the keyword interpreter and (2) the AI interpretation
// pipeline, and writes docs/EVALUATION.md.
//
//   npm run eval        → AI side uses the recorded interpretations in tests/fixtures/briefs.ts
//   npm run eval:live   → AI side calls the real model (needs ANTHROPIC_API_KEY or GEMINI_API_KEY in the environment)
//
// The recorded interpretations are hand-written stand-ins for model output. They test the resolver
// and engine; only the live run measures the model.
import { writeFileSync } from 'node:fs';
import { buildPaletteColours, interpretPrompt } from '../src/lib/colour-engine';
import { inRange, resolveInterpretation, type Envelope } from '../src/lib/interpretation';
import { COLOUR_FAMILIES } from '../src/lib/vibe-db';
import { handleInterpret } from '../server/interpret-core';
import { BRIEFS, type BriefCase, type Check } from '../tests/fixtures/briefs';

const live = process.argv.includes('--live');
let n = 0;
const createId = (p: string) => `${p}_${++n}`;
const isWarm = (h: number) => h >= 330 || h <= 110;
const isCool = (h: number) => h >= 195 && h <= 300;
const band = (v: number, words: string[]) => words[Math.min(4, Math.floor(v * 5))];

function passes(check: Check, env: Envelope): boolean {
  const { targets, descriptors, params } = resolveInterpretation(env.interpretation, env.resolution_hints);
  const [kind, a, x] = check as [string, any, any];
  if (kind === 'lightness' || kind === 'chroma' || kind === 'contrast') return a === '>' ? targets[kind] > x : targets[kind] < x;
  if (kind === 'temperature') return targets.temperature === a;
  if (kind === 'warmHue') return isWarm(targets.primaryHue);
  if (kind === 'coolHue') return isCool(targets.primaryHue);
  if (kind === 'hueNear') return Math.abs(((targets.primaryHue - a + 540) % 360) - 180) <= (x ?? 12);
  if (kind === 'matched') return descriptors.resolved.some((d) => d.record.id === a);
  if (kind === 'unresolved') return descriptors.unresolved.includes(a);
  if (kind === 'clarify') return env.interpretation.needs_clarification;
  if (kind === 'hueTier') return targets.sources.hue.tier === a;
  if (kind === 'excludes') {
    const ranges = (check.slice(1) as string[]).map((name) => COLOUR_FAMILIES[name].range);
    return buildPaletteColours({ ...params, count: 6, createId }).every((c) => c.oklch.h === null || c.oklch.c < 0.03 || !ranges.some((r) => inRange(c.oklch.h as number, r)));
  }
  return false;
}

/** What the keyword interpreter does with the same prompt, and the specific ways it goes wrong. */
function keywordSide(b: BriefCase) {
  const r = interpretPrompt(b.prompt);
  if (r.status === 'empty') return { summary: 'Nothing recognised — no palette', seeds: '—', problems: ['no result'] };
  const seeds = buildPaletteColours({ anchor: r.anchor, harmony: r.harmony, chromaBias: r.chromaBias, lightnessBias: r.lightnessBias, roll: 0, accentHue: r.accentHue, neutralHue: r.neutralHue, count: 5, createId });
  const problems: string[] = [];
  const excluded = b.envelope.interpretation.visual_attributes.hue_exclusions;
  for (const name of excluded) {
    const range = COLOUR_FAMILIES[name]?.range;
    if (range && seeds.some((c) => c.oklch.h !== null && c.oklch.c >= 0.03 && inRange(c.oklch.h, range))) problems.push(`uses excluded ${name}`);
  }
  for (const neg of b.envelope.interpretation.negative_constraints) {
    if (r.interpreted.some((t) => neg.includes(t.term) && t.category === 'mood')) problems.push(`treats “${neg}” as wanted`);
  }
  if (r.unmatched.length >= 2) problems.push(`ignored: ${r.unmatched.slice(0, 4).join(', ')}`);
  return { summary: r.interpreted.map((t) => t.term).join(', ') || '—', seeds: seeds.map((c) => c.hex).join(' '), problems };
}

async function aiEnvelope(b: BriefCase): Promise<{ env: Envelope | null; note: string }> {
  if (!live) return { env: b.envelope, note: 'recorded' };
  const result = await handleInterpret({ method: 'POST', body: { prompt: b.prompt }, clientId: 'eval' }, process.env);
  if (result.status !== 200 || !('interpretation' in result.body)) return { env: null, note: `failed: ${'error' in result.body ? result.body.error.code : result.status}` };
  return { env: { interpretation: result.body.interpretation, resolution_hints: result.body.resolution_hints }, note: result.body.meta.model };
}

const rows: string[] = [];
let aiPass = 0, aiTotal = 0, kwEmpty = 0, kwProblem = 0, aiFail = 0;
for (const b of BRIEFS) {
  const kw = keywordSide(b);
  if (kw.problems.includes('no result')) kwEmpty++;
  else if (kw.problems.length) kwProblem++;
  const { env, note } = await aiEnvelope(b);
  let ai = `_${note}_`, checks = '—', seeds = '—';
  if (env) {
    const { targets, params } = resolveInterpretation(env.interpretation, env.resolution_hints);
    const ok = b.checks.filter((c) => passes(c, env)).length;
    aiPass += ok; aiTotal += b.checks.length;
    if (ok < b.checks.length) aiFail++;
    ai = `${env.interpretation.primary_vibe}; ${targets.temperature}; ${band(targets.lightness, ['dark', 'med-dark', 'medium', 'med-light', 'light'])}; ${band(targets.chroma, ['muted', 'soft', 'moderate', 'rich', 'vivid'])}; contrast ${band(targets.contrast, ['soft', 'gentle', 'medium', 'strong', 'high'])}`;
    checks = `${ok}/${b.checks.length}`;
    seeds = buildPaletteColours({ ...params, count: 5, createId }).map((c) => c.hex).join(' ');
  } else aiFail++;
  rows.push(`| ${b.id} | ${b.category} | ${b.prompt} | ${kw.summary} | ${kw.problems.join('; ') || 'none found'} | ${kw.seeds} | ${ai} | ${checks} | ${seeds} |`);
}

const md = `# Interpretation evaluation: keyword interpreter vs AI pipeline

Generated by \`npm run ${live ? 'eval:live' : 'eval'}\`. ${BRIEFS.length} prompts.

**AI side in this run: ${live ? 'live model calls' : 'recorded interpretations (hand-written stand-ins for model output, not a live model)'}.**
${live ? '' : 'This run therefore shows what the keyword interpreter does and whether the resolver and engine carry a correct interpretation through to a matching palette. It does not measure how often a real model produces a correct interpretation — run `npm run eval:live` with a key for that.\n'}
## Summary

| | Keyword interpreter | AI pipeline (${live ? 'live' : 'recorded'}) |
|---|---|---|
| Prompts with no result | ${kwEmpty} of ${BRIEFS.length} | ${live ? aiFail : 0} of ${BRIEFS.length} |
| Prompts with a detected problem | ${kwProblem} of ${BRIEFS.length} | ${aiFail} of ${BRIEFS.length} with a failed check |
| Expectation checks passed | not applicable | ${aiPass} of ${aiTotal} |

"Detected problem" for the keyword side is automatic and narrow: an excluded colour appearing in the palette, a negated mood word applied as if wanted, or two or more meaningful words ignored. It under-counts subtler misses (intensity words, metaphors).

## Per prompt

| # | Category | Prompt | Keywords recognised | Keyword problems | Keyword seeds | AI reading → targets | Checks | AI seeds |
|---|---|---|---|---|---|---|---|---|
${rows.join('\n')}
`;
writeFileSync('docs/EVALUATION.md', md);
console.log(`kw empty ${kwEmpty}, kw problems ${kwProblem}, ai checks ${aiPass}/${aiTotal}, ai failing prompts ${aiFail} → docs/EVALUATION.md`);
