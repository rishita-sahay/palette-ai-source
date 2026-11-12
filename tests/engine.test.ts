import { describe, expect, it } from 'vitest';
import { SCALE_STEPS, type Project } from '@/types';
import {
  buildPaletteColours, checkScale, DEFAULT_SETTINGS, generateScale, hexToOklch, hueDistance, interpretPrompt,
  makeColour, mapToSrgb, oklchToHex, parseColour, rederiveUnlocked, HARMONY_MODES,
} from '@/lib/colour-engine';
import { classifyContrast, contrastRatio } from '@/lib/contrast';
import { generateExport } from '@/lib/exporters';
import { validateCss, validateJson, validateTailwindV4 } from '@/lib/validation/export-validators';
import { validateFamilyName } from '@/lib/validation/names';

let n = 0;
const createId = (p: string) => `${p}_${++n}`;
const scaleFrom = (hex: string, settings = DEFAULT_SETTINGS) =>
  generateScale({ id: 'fam', familyName: 'primary', base: makeColour(hexToOklch(hex), { id: 'base' }), settings, createId });

const BASES = ['#1C6BEC', '#3867D6', '#FF0000', '#00FF00', '#FFFF00', '#FF00FF', '#00FFFF', '#1E9E6A', '#F59E0B', '#7C3AED',
  '#111111', '#FFFFFF', '#000000', '#808080', '#FDE68A', '#0B1220', '#EC4899', '#85CAEB', '#6B7280', '#B45309'];

describe('parsing & conversion (CS-003)', () => {
  it('parses hex, rgb, hsl and bare hex', () => {
    for (const input of ['#1C6BEC', '1c6bec', 'rgb(28, 107, 236)', 'rgb(28 107 236)', 'hsl(217 85% 52%)', 'rebeccapurple', '#abc']) {
      expect(parseColour(input).ok, input).toBe(true);
    }
  });
  it('rejects invalid input with a message', () => {
    for (const input of ['', '   ', '#12', 'bluish', 'rgb(1,2)', '#GGGGGG']) {
      const r = parseColour(input);
      expect(r.ok, input).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
    }
  });
  it('round-trips HEX → OKLCH → HEX exactly', () => {
    for (const hex of BASES) expect(oklchToHex(hexToOklch(hex))).toBe(hex);
  });
  it('treats greys as achromatic (null hue), never NaN', () => {
    const grey = hexToOklch('#808080');
    expect(grey.h).toBeNull();
    expect(Number.isNaN(grey.c)).toBe(false);
  });
});

describe('gamut mapping (CS-004)', () => {
  it('reduces chroma only, holding lightness and hue', () => {
    const wild = { l: 0.7, c: 0.4, h: 150 };
    const { oklch, mapped } = mapToSrgb(wild);
    expect(mapped).toBe(true);
    expect(oklch.l).toBeCloseTo(0.7, 6);
    expect(oklch.h).toBeCloseTo(150, 6);
    expect(oklch.c).toBeLessThan(0.4);
    expect(oklchToHex(oklch)).toMatch(/^#[0-9A-F]{6}$/);
  });
  it('leaves in-gamut colours untouched', () => {
    expect(mapToSrgb(hexToOklch('#1C6BEC')).mapped).toBe(false);
  });
});

describe('scale generation (CS-001, CS-002)', () => {
  it.each(BASES)('%s → 11 valid steps, strictly monotonic lightness, bounded hue drift', (hex) => {
    for (const curve of ['balanced', 'linear', 'high-contrast'] as const) {
      const scale = scaleFrom(hex, { ...DEFAULT_SETTINGS, lightnessCurve: curve });
      expect(Object.keys(scale.shades)).toHaveLength(11);
      for (const step of SCALE_STEPS) {
        const s = scale.shades[step];
        expect(s.hex).toMatch(/^#[0-9A-F]{6}$/);
        expect(Number.isFinite(s.oklch.l) && Number.isFinite(s.oklch.c)).toBe(true);
      }
      const checks = checkScale(scale);
      expect(checks.monotonic, `${hex} ${curve}`).toBe(true);
      expect(checks.hueDrift, `${hex} ${curve} drift`).toBeLessThanOrEqual(5);
      // distinct hex per step (no flattening at the extremes)
      expect(new Set(SCALE_STEPS.map((s) => scale.shades[s].hex)).size, `${hex} ${curve} distinct`).toBe(11);
    }
  });
  it('keeps the base colour exactly on its anchor step', () => {
    for (const hex of BASES) {
      const scale = scaleFrom(hex);
      expect(scale.shades[scale.anchorStep].hex).toBe(hex);
    }
  });
  it('reduces chroma at both extremes', () => {
    const s = scaleFrom('#1C6BEC');
    expect(s.shades[50].oklch.c).toBeLessThan(s.shades[500].oklch.c * 0.3);
    expect(s.shades[950].oklch.c).toBeLessThan(s.shades[500].oklch.c);
  });
  it('is deterministic', () => {
    const a = scaleFrom('#7C3AED');
    const b = scaleFrom('#7C3AED');
    expect(SCALE_STEPS.map((s) => a.shades[s].hex)).toEqual(SCALE_STEPS.map((s) => b.shades[s].hex));
  });
  it('carries locked shades through a base change (CS-005/006)', () => {
    const first = scaleFrom('#1C6BEC');
    first.shades[300] = { ...first.shades[300], locked: true };
    const lockedHex = first.shades[300].hex;
    const next = generateScale({ id: 'fam', familyName: 'primary', base: makeColour(hexToOklch('#B45309'), { id: 'base' }), previous: first, createId });
    expect(next.shades[300].hex).toBe(lockedHex);
    expect(next.shades[500].hex).not.toBe(first.shades[500].hex);
  });
  it('applies an optional hue shift that is zero at the anchor', () => {
    const s = scaleFrom('#1C6BEC', { ...DEFAULT_SETTINGS, hueShift: 20 });
    expect(s.shades[s.anchorStep].hex).toBe('#1C6BEC');
    expect(hueDistance(s.shades[900].oklch.h!, s.base.oklch.h!)).toBeGreaterThan(3);
  });
});

describe('palette generation (PS-002, PS-004, PS-005, PS-008)', () => {
  const anchor = hexToOklch('#1C6BEC');
  const base = { anchor, harmony: 'analogous' as const, chromaBias: 1, lightnessBias: 0, roll: 0, accentHue: null, neutralHue: null };
  it('includes the input colour and respects the seed count', () => {
    for (let count = 3; count <= 8; count++) {
      const colours = buildPaletteColours({ ...base, count, createId });
      expect(colours).toHaveLength(count);
      expect(colours[0].hex).toBe('#1C6BEC');
      expect(colours.at(-1)!.role).toBe('neutral');
      expect(new Set(colours.map((c) => c.name)).size).toBe(count);
    }
  });
  it('regeneration and harmony changes never touch locked colours', () => {
    const colours = buildPaletteColours({ ...base, count: 5, createId, lockAnchor: true });
    colours[2].locked = true;
    for (const harmony of HARMONY_MODES) {
      for (const roll of [1, 2, 3]) {
        const next = rederiveUnlocked({ id: 'p', name: 'p', colours, source: { kind: 'colour', input: '' }, ...base, harmony, roll });
        expect(next[0].hex).toBe(colours[0].hex);
        expect(next[2].hex).toBe(colours[2].hex);
        expect(next.every((c) => /^#[0-9A-F]{6}$/.test(c.hex))).toBe(true);
      }
    }
    const rolled = rederiveUnlocked({ id: 'p', name: 'p', colours, source: { kind: 'colour', input: '' }, ...base, roll: 1 });
    expect(rolled[1].hex).not.toBe(colours[1].hex);
  });
  it('complementary accent sits 180° from the anchor in OKLCH hue', () => {
    const colours = buildPaletteColours({ ...base, harmony: 'complementary', count: 3, createId });
    expect(hueDistance(colours[1].oklch.h!, anchor.h!)).toBeGreaterThan(170);
  });
});

describe('deterministic prompt mapping (PS-001)', () => {
  it('interprets the PRD example', () => {
    const r = interpretPrompt('A premium SaaS brand with cool blue undertones, soft neutral surfaces and a subtle lavender accent.');
    const terms = r.interpreted.map((t) => t.term);
    expect(terms).toEqual(expect.arrayContaining(['premium', 'saas', 'blue', 'lavender', 'soft', 'subtle']));
    expect(r.accentHue).toBe(300);
    expect(hueDistance(r.anchor.h!, 258)).toBeLessThan(10);
    expect(r.status).not.toBe('empty');
  });
  it('ignores unknown terms without breaking, and reports them', () => {
    const r = interpretPrompt('zorblax quantum teal flibbertigibbet');
    expect(r.status).toBe('partial');
    expect(r.unmatched).toEqual(expect.arrayContaining(['zorblax', 'flibbertigibbet']));
    expect(r.anchor.h).toBe(185);
  });
  it('returns empty when nothing is recognised', () => {
    expect(interpretPrompt('').status).toBe('empty');
    expect(interpretPrompt('asdf qwerty').status).toBe('empty');
  });
  it('is deterministic', () => {
    const p = 'Earthy hospitality brand, warm terracotta with sage accents.';
    expect(interpretPrompt(p)).toEqual(interpretPrompt(p));
  });
});

describe('WCAG contrast (AC-001)', () => {
  it('matches reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2); // the classic near-miss
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });
  it('classifies against the right thresholds', () => {
    expect(classifyContrast('#777777', '#FFFFFF').aa).toEqual({ normalText: false, largeText: true, nonText: true });
    expect(classifyContrast('#767676', '#FFFFFF').aa.normalText).toBe(true);
    expect(classifyContrast('#767676', '#FFFFFF').aaa.normalText).toBe(false);
  });
});

describe('exports (EX-001, EX-002, EX-004)', () => {
  const project = (families = [scaleFrom('#1C6BEC'), { ...scaleFrom('#6B7280'), id: 'f2', familyName: 'neutral' }]): Project => ({
    id: 'p', name: 'Test', createdAt: '2026-11-10T00:00:00.000Z', updatedAt: '2026-11-10T00:00:00.000Z', activeThemeId: '',
    schemaVersion: 1, palettes: [], colourFamilies: families, tokens: [], themes: [],
    exportSettings: { scope: 'primitive', includeThemes: [], colourFormat: 'hex' },
  });
  it.each(['hex', 'oklch'] as const)('all three formats validate (%s)', (colourFormat) => {
    const p = project();
    const settings = { ...p.exportSettings, colourFormat };
    for (const format of ['css', 'tailwind-v4', 'json'] as const) {
      const out = generateExport(format, p, settings);
      expect(out.report.errors, format).toEqual([]);
      expect(out.report.checked).toBe(22);
    }
    expect(generateExport('css', p, settings).content).toContain('--color-primary-500:');
    expect(generateExport('tailwind-v4', p, settings).content).toMatch(/@theme \{[\s\S]*--color-neutral-950:/);
    const json = JSON.parse(generateExport('json', p, settings).content);
    expect(json.schemaVersion).toBe(1);
    expect(json.primitives).toHaveLength(22);
  });
  it('refuses empty or broken output', () => {
    expect(generateExport('css', project([]), project().exportSettings).report.valid).toBe(false);
    expect(validateCss(':root {\n  --color-primary-500: #12345;\n}').valid).toBe(false);
    expect(validateCss(':root {\n  --color-primary-500: #123456;\n').valid).toBe(false);
    expect(validateTailwindV4(':root {\n  --color-primary-500: #123456;\n}').valid).toBe(false);
    expect(validateJson('{"schemaVersion":1').valid).toBe(false);
  });
});

describe('family names (CS-009)', () => {
  it('slugifies and enforces uniqueness', () => {
    expect(validateFamilyName('Brand Blue', [])).toEqual({ ok: true, name: 'brand-blue' });
    expect(validateFamilyName('primary', ['primary']).ok).toBe(false);
    expect(validateFamilyName('$weird.{x}', [])).toEqual({ ok: true, name: 'weird-x' });
    expect(validateFamilyName('123', []).ok).toBe(false);
    expect(validateFamilyName('  ', []).ok).toBe(false);
  });
});
