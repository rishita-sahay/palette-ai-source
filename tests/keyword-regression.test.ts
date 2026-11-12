import { expect, it } from 'vitest';
import { buildPaletteColours, interpretPrompt } from '@/lib/colour-engine';

// Locks the deterministic keyword interpreter and seed generation as they were BEFORE the AI
// interpretation layer was added. If this snapshot changes, existing behaviour has regressed.
const PROMPTS = [
  'A premium SaaS brand with cool blue undertones, soft neutral surfaces and a subtle lavender accent.',
  'Earthy hospitality brand, warm terracotta with sage accents.',
  'Playful kids education app, bright and friendly with a teal accent.',
  'Dark, moody fintech dashboard in emerald.',
  'calm muted green wellness',
  'bold red and gold restaurant',
  'minimal clean trustworthy',
  'vibrant neon gaming purple',
  'zorblax quantum teal flibbertigibbet',
  '',
];

it('keyword interpreter + seeds are unchanged', () => {
  let n = 0;
  const out = PROMPTS.map((prompt) => {
    const r = interpretPrompt(prompt);
    const seeds = r.status === 'empty' ? [] : buildPaletteColours({
      anchor: r.anchor, harmony: r.harmony, chromaBias: r.chromaBias, lightnessBias: r.lightnessBias, roll: 0,
      accentHue: r.accentHue, neutralHue: r.neutralHue, count: 5, createId: (p) => `${p}_${++n}`,
    }).map((c) => `${c.name}:${c.hex}`);
    return { prompt, status: r.status, harmony: r.harmony, terms: r.interpreted.map((t) => `${t.term}=${t.effect}`), unmatched: r.unmatched, seeds };
  });
  expect(out).toMatchSnapshot();
});
