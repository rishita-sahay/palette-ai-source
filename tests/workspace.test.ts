import { beforeEach, describe, expect, it } from 'vitest';
import { SCALE_STEPS, type Project } from '@/types';
import { darkFill, darkGround, DEFAULT_DARK_STRATEGY, ensureContrast, formatHsl, formatOklch, formatRgb, hexToOklch, hueDistance } from '@/lib/colour-engine';
import { darkStrategyFor } from '@/lib/interpretation/dark-strategy';
import { contrastRatio } from '@/lib/contrast';
import { renderSheetPdf, pdfString } from '@/lib/brandkit/pdf';
import { buildSheet, PAGE } from '@/lib/brandkit/sheet';
import { generateExport } from '@/lib/exporters';
import { buildGuide } from '@/lib/guide';
import { AA_TEXT, contrastPairs, FEEDBACK_NAMES, groupFamilies, primitiveNames, resolveRoles } from '@/lib/tokens/roles';
import { validateCss } from '@/lib/validation/export-validators';
import { migrateProject, useProjectStore } from '@/store/project-store';

const store = useProjectStore.getState;
const project = () => store().project;
const SEEDS = ['#1C6BEC', '#F7931B', '#FFE600', '#0B1220', '#EC4899', '#1E9E6A', '#FFFFFF', '#000000', '#808080', '#7C3AED'];

beforeEach(() => {
  store().newProject();
  useProjectStore.setState({ past: [], future: [] });
});

describe('one-step flow: generating a palette also builds its scales', () => {
  it('gives every colour a scale and adds the four feedback families, as one undo step', () => {
    expect(store().generateFromColour('#F7931B', {}).ok).toBe(true);
    const p = project();
    const colours = p.palettes[0].colours;
    expect(colours).toHaveLength(5);
    for (const c of colours) expect(p.colourFamilies.find((f) => f.id === c.familyId)?.familyName).toBe(c.name);
    expect(p.colourFamilies.map((f) => f.familyName)).toEqual([...colours.map((c) => c.name), ...FEEDBACK_NAMES]);
    expect(store().ui.editor).toBeNull();

    store().undo();
    expect(project().palettes).toHaveLength(0);
    expect(project().colourFamilies).toHaveLength(0);
  });

  it('a new palette replaces the old colour scales but keeps the feedback set the user has', () => {
    store().generateFromColour('#1C6BEC', {});
    const info = project().colourFamilies.find((f) => f.familyName === 'info')!;
    store().deleteFamily(info.id);
    const kept = project().colourFamilies.filter((f) => (FEEDBACK_NAMES as string[]).includes(f.familyName)).map((f) => f.id);

    store().generateFromPrompt('calm teal fintech');
    const p = project();
    expect(p.colourFamilies).toHaveLength(p.palettes[0].colours.length + 3);
    expect(p.colourFamilies.filter((f) => (FEEDBACK_NAMES as string[]).includes(f.familyName)).map((f) => f.id)).toEqual(kept);
    expect(new Set(p.colourFamilies.map((f) => f.familyName)).size).toBe(p.colourFamilies.length);
    expect(p.colourFamilies.some((f) => f.familyName === 'primary-2')).toBe(false);

    expect(store().addFeedback()).toBe(1);
    expect(project().colourFamilies.at(-1)!.familyName).toBe('info');
  });

  it('adding, duplicating, moving and deleting a colour keeps colours and scales in step', () => {
    store().generateFromColour('#7C3AED', { count: 3 });
    store().addColour();
    let p = project();
    expect(p.palettes[0].colours).toHaveLength(4);
    expect(p.palettes[0].colours.at(-1)!.role).toBe('neutral');
    expect(store().ui.editor).toBe('colour');

    store().duplicateColour(p.palettes[0].colours[0].id);
    p = project();
    expect(p.palettes[0].colours.every((c) => p.colourFamilies.some((f) => f.id === c.familyId))).toBe(true);

    store().moveColour(p.palettes[0].colours[0].id, 2);
    p = project();
    expect(groupFamilies(p).brand.map((f) => f.id)).toEqual(p.palettes[0].colours.map((c) => c.familyId));
    expect(p.colourFamilies.slice(0, 5).map((f) => f.id)).toEqual(p.palettes[0].colours.map((c) => c.familyId));

    const victim = p.palettes[0].colours[1];
    store().deleteColour(victim.id);
    p = project();
    expect(p.palettes[0].colours.some((c) => c.id === victim.id)).toBe(false);
    expect(p.colourFamilies.some((f) => f.id === victim.familyId)).toBe(false);

    // Deleting a brand family from the shade editor removes its card too.
    const other = p.palettes[0].colours[0];
    store().deleteFamily(other.familyId!);
    expect(project().palettes[0].colours.some((c) => c.id === other.id)).toBe(false);
  });

  it('never deletes the last colour', () => {
    store().generateFromColour('#1C6BEC', { count: 3 });
    for (const c of project().palettes[0].colours.slice(1)) store().deleteColour(c.id);
    const last = project().palettes[0].colours[0];
    store().deleteColour(last.id);
    store().deleteFamily(last.familyId!);
    expect(project().palettes[0].colours).toHaveLength(1);
  });

  it('edits to a colour flow into its scale, and regenerate keeps locked colours', () => {
    store().generateFromColour('#1C6BEC', {});
    const accent = project().palettes[0].colours[1];
    store().updateColour(accent.id, { l: 0.6, c: 0.2, h: 20 });
    const now = project().palettes[0].colours[1];
    expect(project().colourFamilies.find((f) => f.id === now.familyId)!.base.hex).toBe(now.hex);

    store().toggleColourLock(now.id);
    store().regenerateUnlocked();
    expect(project().palettes[0].colours[1].hex).toBe(now.hex);
  });

  it('opens and closes the editors without touching the project', () => {
    store().generateFromColour('#1C6BEC', {});
    const before = project();
    store().editShadeAt(before.colourFamilies[0].id, 500);
    expect(store().ui).toMatchObject({ editor: 'shade', selectedStep: 500 });
    store().editColour(before.palettes[0].colours[0].id);
    expect(store().ui.editor).toBe('colour');
    store().closeEditor();
    store().setTab('guide');
    expect(store().ui).toMatchObject({ editor: null, tab: 'guide' });
    expect(project()).toBe(before);
  });
});

describe('saved projects from the old two-step flow', () => {
  it('get scales for every colour on load, and feedback only when they had no scales at all', () => {
    store().generateFromColour('#1C6BEC', {});
    const current = project();
    const stripped = (families: Project['colourFamilies']): Project => ({
      ...current, colourFamilies: families,
      palettes: [{ ...current.palettes[0], colours: current.palettes[0].colours.map(({ familyId: _, ...c }) => c) }],
    });

    const fresh = migrateProject(stripped([]));
    expect(fresh.colourFamilies).toHaveLength(5 + 4);
    expect(fresh.palettes[0].colours.every((c) => c.familyId)).toBe(true);

    // The user had made one family by hand and no feedback: keep it, don't add feedback behind their back.
    const custom = { ...current.colourFamilies[0], id: 'custom', familyName: 'plum' };
    const partial = migrateProject(stripped([custom]));
    expect(partial.colourFamilies.map((f) => f.familyName)).toEqual([...current.palettes[0].colours.map((c) => c.name), 'plum']);

    expect(migrateProject(current)).toBe(current);
  });
});

describe('role tokens', () => {
  it.each(SEEDS)('every text/background pair reaches AA in light and dark for %s', (seed) => {
    store().generateFromColour(seed, {});
    const roles = resolveRoles(project())!;
    const names = primitiveNames(project().colourFamilies);
    for (const mode of ['light', 'dark'] as const) {
      expect(roles[mode].map((r) => r.name)).toEqual(['background', 'surface', 'text', 'text-muted', 'border', 'primary', 'on-primary', 'primary-soft', 'on-primary-soft', 'accent', 'on-accent', ...FEEDBACK_NAMES]);
      for (const role of roles[mode]) if (role.ref) expect(names.has(role.ref), role.ref).toBe(true);
      expect(roles[mode].some((r) => r.ref !== null)).toBe(mode === 'light');
      for (const pair of contrastPairs(roles[mode])) expect(pair.ratio, `${seed} ${mode} ${pair.label}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
    expect(roles.light.find((r) => r.name === 'background')!.hex).not.toBe(roles.dark.find((r) => r.name === 'background')!.hex);
  });

  it('still resolves with a single family and no palette', () => {
    store().generateFromColour('#1C6BEC', { count: 3 });
    const one: Project = { ...project(), palettes: [], colourFamilies: [project().colourFamilies[0]] };
    const roles = resolveRoles(one)!;
    expect(roles.families).toEqual({ primary: 'primary', accent: 'primary', neutral: 'primary' });
    expect(resolveRoles({ ...one, colourFamilies: [] })).toBeNull();
  });
});

describe('dark theme adaptation', () => {
  const get = (roles: { name: string; hex: string; oklch: { l: number; c: number; h: number | null } }[], name: string) => roles.find((r) => r.name === name)!;

  it.each(SEEDS)('has its own values, keeps hue, and keeps its layers apart for %s', (seed) => {
    store().generateFromColour(seed, {});
    const roles = resolveRoles(project())!;
    const { light, dark } = roles;
    expect(dark.map((r) => r.name)).toEqual(light.map((r) => r.name));
    // No dark role re-uses the light role's HEX.
    for (const role of dark) expect(role.hex, role.name).not.toBe(get(light, role.name).hex);

    // Brand and status colours keep the hue of the colour they come from.
    const sources: [string, string][] = [['primary', roles.families.primary], ['accent', roles.families.accent], ...FEEDBACK_NAMES.map((n): [string, string] => [n, n])];
    for (const [roleName, familyName] of sources) {
      const base = project().colourFamilies.find((f) => f.familyName === familyName)!.base.oklch;
      const adapted = get(dark, roleName).oklch;
      if (base.h !== null && adapted.h !== null && base.c > 0.03) expect(hueDistance(base.h, adapted.h), `${seed} ${roleName}`).toBeLessThanOrEqual(8);
    }

    // Hierarchy: background < surface < border < muted text < text, each a visible step apart.
    const ladder = ['background', 'surface', 'border', 'text-muted', 'text'].map((n) => get(dark, n).oklch.l);
    for (let i = 1; i < ladder.length; i++) expect(ladder[i] - ladder[i - 1], `${seed} step ${i}`).toBeGreaterThan(0.035);
    expect(contrastRatio(get(dark, 'text').hex, get(dark, 'background').hex)).toBeGreaterThanOrEqual(7);
    expect(get(dark, 'background').oklch.l).toBeLessThan(0.25);
    // Fills stand clear of the page (WCAG 1.4.11 non-text 3:1).
    for (const n of ['primary', 'accent']) expect(contrastRatio(get(dark, n).hex, get(dark, 'background').hex), n).toBeGreaterThanOrEqual(3);
  });

  it('lifts deep brand colours and calms bright ones instead of copying them', () => {
    const navy = hexToOklch('#14246E');
    const lifted = darkFill(navy);
    expect(lifted.fill.oklch.l).toBeGreaterThan(navy.l + 0.15);
    expect(lifted.ratio).toBeGreaterThanOrEqual(AA_TEXT);

    const orange = hexToOklch('#F7931B');
    const calmed = darkFill(orange);
    expect(calmed.fill.oklch.c).toBeLessThan(orange.c);
    expect(Math.abs(calmed.fill.oklch.l - orange.l)).toBeLessThan(0.08);
    expect(hueDistance(calmed.fill.oklch.h!, orange.h!)).toBeLessThan(6);
  });

  it('refines a failing colour until it passes, moving lightness and never hue', () => {
    const start = { l: 0.4, c: 0.15, h: 250 };
    const fixed = ensureContrast(start, ['#1A1A1A'], 1);
    expect(fixed.refined).toBe(true);
    expect(fixed.ratio).toBeGreaterThanOrEqual(AA_TEXT);
    expect(hueDistance(fixed.oklch.h!, 250)).toBeLessThan(6);
    expect(ensureContrast({ l: 0.9, c: 0.02, h: 250 }, ['#1A1A1A'], 1).refined).toBe(false);
  });

  it('takes its strategy from the AI reading of the brief, and the default otherwise', () => {
    expect(darkStrategyFor(undefined)).toBe(DEFAULT_DARK_STRATEGY);
    const bold = darkStrategyFor({ contrast: 0.9, chroma: 0.9, temperature: 'cool' });
    const soft = darkStrategyFor({ contrast: 0.2, chroma: 0.2, temperature: 'neutral' });
    expect(bold.basis).toBe('brief');
    expect(bold.depth).toBeLessThan(soft.depth);
    expect(bold.elevation).toBeGreaterThan(soft.elevation);
    expect(bold.chromaKeep).toBeGreaterThan(soft.chromaKeep);
    expect(bold.tint).toBeGreaterThan(soft.tint);

    const neutral = hexToOklch('#6C7775');
    expect(darkGround(neutral, bold).background.oklch.l).toBeLessThan(darkGround(neutral, soft).background.oklch.l);
    const vivid = hexToOklch('#5B7FB8'); // mid-chroma, so the result is not limited by the sRGB gamut
    expect(darkFill(vivid, bold).fill.oklch.c).toBeGreaterThan(darkFill(vivid, soft).fill.oklch.c);

    // Through the store: a palette with an AI brief uses the brief's strategy; every pair still passes.
    store().generateFromColour('#1C6BEC', {});
    expect(resolveRoles(project())!.darkStrategy.basis).toBe('default');
    const p = project();
    const withBrief: Project = { ...p, palettes: [{ ...p.palettes[0], source: { kind: 'prompt', input: 'x', brief: { originalPrompt: 'x', refinements: [], meta: { mode: 'ai', schemaVersion: 1, dbVersion: 'x', cached: false }, targets: { contrast: 0.9, chroma: 0.2, temperature: 'warm' } as any } } }] };
    const roles = resolveRoles(withBrief)!;
    expect(roles.darkStrategy).toEqual(darkStrategyFor({ contrast: 0.9, chroma: 0.2, temperature: 'warm' }));
    expect(roles.dark[0].hex).not.toBe(resolveRoles(p)!.dark[0].hex);
    expect(roles.light).toEqual(resolveRoles(p)!.light);
    for (const pair of contrastPairs(roles.dark)) expect(pair.ratio, pair.label).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('exports with role tokens', () => {
  it.each(['hex', 'oklch'] as const)('validate in all three formats (%s) and reference only real primitives', (colourFormat) => {
    store().generateFromColour('#F7931B', {});
    const settings = { ...project().exportSettings, colourFormat };
    expect(settings.scope).toBe('complete');
    const roleCount = resolveRoles(project())!.light.length;
    for (const format of ['css', 'tailwind-v4', 'json'] as const) {
      const out = generateExport(format, project(), settings);
      expect(out.report.errors, format).toEqual([]);
      expect(out.report.checked).toBe(project().colourFamilies.length * 11);
      expect(out.report.roles).toBe(format === 'json' ? roleCount : roleCount * 2);
    }
    const css = generateExport('css', project(), settings).content;
    expect(css).toContain('--color-background: var(--color-neutral-50);');
    const darkBg = resolveRoles(project())!.dark[0];
    expect(css).toContain(`[data-theme='dark'],\n.dark {\n  --color-background: ${colourFormat === 'hex' ? darkBg.hex : formatOklch(darkBg.oklch)};`);
    const tw = generateExport('tailwind-v4', project(), settings).content;
    expect(tw.match(/@theme \{/g)).toHaveLength(2);
    expect(tw).toContain('@layer base {');
    const json = JSON.parse(generateExport('json', project(), settings).content);
    expect(json.semantics).toHaveLength(roleCount);
    expect(json.themes.map((t: any) => t.mode)).toEqual(['light', 'dark']);
    expect(json.themes[0].mappings.primary).toMatch(/^primary-\d+$/);
  });

  it('scales-only output has no role tokens', () => {
    store().generateFromColour('#F7931B', {});
    const settings = { ...project().exportSettings, scope: 'primitive' as const };
    const css = generateExport('css', project(), settings);
    expect(css.content).not.toContain('--color-background');
    expect(css.report.roles).toBe(0);
    expect(JSON.parse(generateExport('json', project(), settings).content).semantics).toEqual([]);
  });

  it('rejects a role that points at a primitive the file does not define, or is defined for one theme only', () => {
    const base = ':root {\n  --color-primary-500: #123456;\n}\n';
    expect(validateCss(`${base}:root {\n  --color-text: var(--color-neutral-900);\n}\n.dark {\n  --color-text: #FFFFFF;\n}\n`).valid).toBe(false);
    expect(validateCss(`${base}:root {\n  --color-text: var(--color-primary-500);\n}\n`).valid).toBe(false);
    expect(validateCss(`${base}:root {\n  --color-text: var(--color-primary-500);\n}\n.dark {\n  --color-text: #FFFFFF;\n}\n`).valid).toBe(true);
  });
});

describe('usage guide (rule-based)', () => {
  it.each(SEEDS)('recommends only steps that pass AA for %s', (seed) => {
    store().generateFromColour(seed, {});
    const guide = buildGuide(project())!;
    expect(guide.families).toHaveLength(project().colourFamilies.length);
    for (const f of guide.families) {
      const family = project().colourFamilies.find((x) => x.id === f.id)!;
      expect(f.fillRatio, `${f.name} fill`).toBeGreaterThanOrEqual(AA_TEXT);
      if (f.textOnWhite) {
        expect(contrastRatio(family.shades[f.textOnWhite].hex, '#FFFFFF')).toBeGreaterThanOrEqual(AA_TEXT);
        const lighter = SCALE_STEPS[SCALE_STEPS.indexOf(f.textOnWhite) - 1];
        if (lighter) expect(contrastRatio(family.shades[lighter].hex, '#FFFFFF')).toBeLessThan(AA_TEXT);
      }
      for (const s of f.steps) expect(s.ratio).toBe(Math.max(contrastRatio('#FFFFFF', s.hex), contrastRatio('#0A0A0A', s.hex)));
    }
    expect(guide.proportions.reduce((sum, p) => sum + p.share, 0)).toBe(guide.proportions.length === 3 ? 100 : 90);
    // Every "don't" that quotes a ratio quotes a failing one.
    for (const line of guide.donts) {
      const m = line.match(/\((\d+\.\d+):1/);
      if (m) expect(Number(m[1]), line).toBeLessThan(AA_TEXT);
    }
    expect(guide.dos.length).toBeGreaterThanOrEqual(4);
  });

  it('is deterministic and empty without scales', () => {
    store().generateFromColour('#1C6BEC', {});
    expect(buildGuide(project())).toEqual(buildGuide(project()));
    expect(buildGuide({ ...project(), colourFamilies: [], palettes: [] })).toBeNull();
  });
});

describe('brand sheet', () => {
  const longName = 'Ein sehr langer Projektname — “größer” als gewöhnlich für Tests ✨ नमस्ते';
  it.each([3, 5, 8])('fits on one A4 page with %i colours', (count) => {
    store().generateFromColour('#F7931B', { count });
    store().renameProject(longName.slice(0, 60));
    const ops = buildSheet(project(), new Date('2026-11-16T00:00:00Z'));
    for (const op of ops) {
      expect(op.x).toBeGreaterThanOrEqual(0);
      expect(op.y).toBeGreaterThanOrEqual(0);
      expect(op.y, JSON.stringify(op)).toBeLessThanOrEqual(PAGE.h - 30);
      if (op.kind === 'rect') {
        expect(op.x + op.w).toBeLessThanOrEqual(PAGE.w + 0.01);
        expect(op.y + op.h).toBeLessThanOrEqual(PAGE.h + 0.01);
      } else if (op.mono) {
        // Courier is exactly 0.6em per character, so mono text can be checked precisely.
        expect(op.x + op.text.length * op.size * 0.6, op.text).toBeLessThanOrEqual(PAGE.w - PAGE.margin + 1);
      }
    }
    const texts = ops.flatMap((op) => (op.kind === 'text' ? [op.text] : []));
    for (const c of project().palettes[0].colours) {
      expect(texts).toContain(c.hex);
      expect(texts).toContain(formatRgb(c.rgb));
      expect(texts).toContain(formatHsl(c.hsl));
    }
    // Every shade of every family is on the sheet.
    for (const f of project().colourFamilies) for (const s of SCALE_STEPS) expect(texts).toContain(f.shades[s].hex.slice(1));
  });

  it('writes a structurally valid one-page PDF with selectable, safely encoded text', () => {
    store().generateFromColour('#F7931B', {});
    store().renameProject('Café (Brand) \\ “Kit” ✨');
    const pdf = renderSheetPdf(buildSheet(project()), project().name);
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
    expect(pdf.endsWith('%%EOF\n')).toBe(true);
    expect([...pdf].every((ch) => ch.charCodeAt(0) < 128)).toBe(true);

    const xref = Number(pdf.match(/startxref\n(\d+)\n%%EOF/)![1]);
    expect(pdf.slice(xref, xref + 4)).toBe('xref');
    const offsets = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(8);
    offsets.forEach((offset, i) => expect(pdf.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    const length = Number(pdf.match(/\/Length (\d+)/)![1]);
    const start = pdf.indexOf('stream\n') + 7;
    expect(pdf.slice(start + length, start + length + 10)).toBe('\nendstream');

    expect(pdf).toContain(`(${project().palettes[0].colours[0].hex}) Tj`);
    expect(pdfString('Café (Brand) \\ “Kit” ✨')).toBe('Caf\\351 \\(Brand\\) \\\\ \\223Kit\\224 ?');
  });
});
