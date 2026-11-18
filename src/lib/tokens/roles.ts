import { SCALE_STEPS, type ColourScale, type Oklch, type Project, type ScaleStep } from '@/types';
import { contrastRatio } from '@/lib/contrast';
import { hexToOklch } from '@/lib/colour-engine/convert';
import { darkFill, darkGround, darkStatus, darkTint, type DarkStrategy } from '@/lib/colour-engine/dark';
import { FEEDBACK_SEEDS } from '@/lib/colour-engine/palette';
import { darkStrategyFor } from '@/lib/interpretation/dark-strategy';

/**
 * Role tokens: a small, fixed set of semantic names (background, text, primary…) with one value for a
 * light theme and a separate, independently derived value for a dark one. Light roles point at scale
 * steps; dark roles are adapted from the palette in OKLCH. Everything here is a pure function of the
 * project, so both themes follow every colour edit. Values are chosen by WCAG contrast maths, never by eye.
 */

export type ThemeMode = 'light' | 'dark';
export const THEME_MODES: ThemeMode[] = ['light', 'dark'];
export const FEEDBACK_NAMES = Object.keys(FEEDBACK_SEEDS) as (keyof typeof FEEDBACK_SEEDS)[];
export const AA_TEXT = 4.5;
const WHITE = '#FFFFFF';

export interface RoleToken {
  name: string;
  description: string;
  /** Primitive this role points at (`{family}-{step}`), or null for a literal value. */
  ref: string | null;
  hex: string;
  oklch: Oklch;
}

export interface KeyFamilies {
  primary: ColourScale;
  accent: ColourScale;
  neutral: ColourScale;
}

export interface RoleSet extends Record<ThemeMode, RoleToken[]> {
  families: { primary: string; accent: string; neutral: string };
  /** How the dark theme was built, and whether that came from an AI-read brief or the default. */
  darkStrategy: DarkStrategy;
}

export const isFeedbackName = (name: string) => (FEEDBACK_NAMES as string[]).includes(name);

/** Families in display order: palette colours first (in palette order), then extras, then feedback. */
export function groupFamilies(project: Project): { brand: ColourScale[]; feedback: ColourScale[] } {
  const families = project.colourFamilies;
  const linked = (project.palettes[0]?.colours ?? [])
    .map((c) => families.find((f) => f.id === c.familyId))
    .filter((f): f is ColourScale => !!f);
  const feedback = FEEDBACK_NAMES.map((n) => families.find((f) => f.familyName === n && !linked.includes(f))).filter((f): f is ColourScale => !!f);
  const others = families.filter((f) => !linked.includes(f) && !feedback.includes(f));
  return { brand: [...linked, ...others], feedback };
}

/** The three families every role is built from. Falls back sensibly when a role has no colour. */
export function keyFamilies(project: Project): KeyFamilies | null {
  const families = project.colourFamilies;
  if (families.length === 0) return null;
  const colours = project.palettes[0]?.colours ?? [];
  const byRole = (role: string) => {
    const colour = colours.find((c) => c.role === role && families.some((f) => f.id === c.familyId));
    return families.find((f) => f.id === colour?.familyId);
  };
  const brand = families.filter((f) => !isFeedbackName(f.familyName));
  const primary = byRole('primary') ?? families.find((f) => f.familyName === 'primary') ?? brand[0] ?? families[0];
  const neutral = byRole('neutral') ?? families.find((f) => f.familyName === 'neutral') ?? primary;
  const accent = byRole('accent') ?? brand.find((f) => f.id !== primary.id && f.id !== neutral.id) ?? primary;
  return { primary, accent, neutral };
}

type Value = Pick<RoleToken, 'ref' | 'hex' | 'oklch'>;
const at = (family: ColourScale, step: ScaleStep): Value => ({ ref: `${family.familyName}-${step}`, hex: family.shades[step].hex, oklch: family.shades[step].oklch });
const literal = (hex: string): Value => ({ ref: null, hex, oklch: hexToOklch(hex) });

/** First candidate step that reaches AA for normal text against every background; else the best of them. */
function firstReadable(family: ColourScale, candidates: ScaleStep[], backgrounds: string[]): Value {
  const worst = (step: ScaleStep) => Math.min(...backgrounds.map((bg) => contrastRatio(family.shades[step].hex, bg)));
  const pass = candidates.find((step) => worst(step) >= AA_TEXT);
  return at(family, pass ?? [...candidates].sort((a, b) => worst(b) - worst(a))[0]);
}

/** A fill step plus the text colour that goes on it. The first candidate with an AA text option wins. */
export function pickFill(family: ColourScale, neutral: ColourScale, candidates: ScaleStep[]): { fill: Value; on: Value; ratio: number } {
  const options = [literal(WHITE), at(neutral, 950)];
  let best: { fill: Value; on: Value; ratio: number } | null = null;
  for (const step of candidates) {
    const fill = at(family, step);
    for (const on of options) {
      const ratio = contrastRatio(on.hex, fill.hex);
      if (!best || ratio > best.ratio) best = { fill, on, ratio };
    }
    const top = options.map((on) => ({ on, ratio: contrastRatio(on.hex, fill.hex) })).sort((a, b) => b.ratio - a.ratio)[0];
    if (top.ratio >= AA_TEXT) return { fill, on: top.on, ratio: top.ratio };
  }
  return best!;
}

/**
 * Steps to try for a solid fill. In the light theme the family's own base colour goes first when it
 * sits mid-scale, so the brand colour itself is used whenever readable text can go on it.
 */
export function fillCandidates(family: ColourScale, _mode: ThemeMode = 'light'): ScaleStep[] {
  const base = family.anchorStep;
  const rest: ScaleStep[] = [500, 600, 700, 800];
  return base >= 300 && base < 500 ? [base, ...rest] : rest;
}

const ROLE_INFO: [string, string][] = [
  ['background', 'Page background'],
  ['surface', 'Cards, panels and inputs'],
  ['text', 'Body text and headings'],
  ['text-muted', 'Secondary text and captions'],
  ['border', 'Dividers and input borders'],
  ['primary', 'Main action fill, active states'],
  ['on-primary', 'Text and icons on the primary fill'],
  ['primary-soft', 'Tinted background for notices and selections'],
  ['on-primary-soft', 'Text on the tinted background'],
  ['accent', 'Highlights, tags, badges'],
  ['on-accent', 'Text and icons on the accent fill'],
];
const feedbackInfo = (name: string): [string, string] => [name, `${name[0].toUpperCase()}${name.slice(1)} text and icons`];

function assemble(values: Value[], feedback: ColourScale[]): RoleToken[] {
  const info = [...ROLE_INFO, ...feedback.map((f) => feedbackInfo(f.familyName))];
  return info.map(([name, description], i) => ({ name, description, ...values[i] }));
}

/** Light theme: every role is a step of an existing scale, chosen by contrast. */
function buildLight(key: KeyFamilies, feedback: ColourScale[]): RoleToken[] {
  const { primary, accent, neutral } = key;
  const background = at(neutral, 50);
  const surface = literal(WHITE);
  const grounds = [background.hex, surface.hex];
  const p = pickFill(primary, neutral, fillCandidates(primary, 'light'));
  const a = pickFill(accent, neutral, fillCandidates(accent, 'light'));
  const soft = at(primary, 100);
  return assemble([
    background, surface, at(neutral, 900), firstReadable(neutral, [500, 600, 700, 800], grounds), at(neutral, 200),
    p.fill, p.on, soft, firstReadable(primary, [700, 800, 900, 950], [soft.hex]), a.fill, a.on,
    ...feedback.map((family) => firstReadable(family, [600, 700, 800, 900], grounds)),
  ], feedback);
}

/**
 * Dark theme: not a re-use of light values. Each role is rebuilt in OKLCH from the palette's own
 * colours by the colour engine (see colour-engine/dark.ts), with its own rule per kind of role, and
 * every text pair is checked against AA and refined until it passes.
 */
function buildDark(key: KeyFamilies, feedback: ColourScale[], strategy: DarkStrategy): RoleToken[] {
  const own = (v: { hex: string; oklch: Oklch }): Value => ({ ref: null, hex: v.hex, oklch: v.oklch });
  const ground = darkGround(key.neutral.base.oklch, strategy);
  const grounds = [ground.background.hex, ground.surface.hex];
  const p = darkFill(key.primary.base.oklch, strategy);
  const a = darkFill(key.accent.base.oklch, strategy);
  const tint = darkTint(key.primary.base.oklch, strategy);
  return assemble([
    own(ground.background), own(ground.surface), own(ground.text), own(ground.muted), own(ground.border),
    own(p.fill), own(p.on), own(tint.soft), own(tint.on), own(a.fill), own(a.on),
    ...feedback.map((family) => own(darkStatus(family.base.oklch, grounds, strategy))),
  ], feedback);
}

export function resolveRoles(project: Project): RoleSet | null {
  const key = keyFamilies(project);
  if (!key) return null;
  const { feedback } = groupFamilies(project);
  // The interpretation layer chooses the dark strategy from the AI reading of the brief, when there is one.
  const strategy = darkStrategyFor(project.palettes[0]?.source.brief?.targets);
  return {
    light: buildLight(key, feedback),
    dark: buildDark(key, feedback, strategy),
    families: { primary: key.primary.familyName, accent: key.accent.familyName, neutral: key.neutral.familyName },
    darkStrategy: strategy,
  };
}

export interface ContrastPair {
  label: string;
  fg: RoleToken;
  bg: RoleToken;
  ratio: number;
  pass: boolean;
}

/** The text/background pairs the role tokens are meant to be used in, each checked against AA (4.5:1). */
export function contrastPairs(roles: RoleToken[]): ContrastPair[] {
  const get = (name: string) => roles.find((r) => r.name === name);
  const wanted: [string, string, string][] = [
    ['Text on background', 'text', 'background'],
    ['Text on surface', 'text', 'surface'],
    ['Muted text on background', 'text-muted', 'background'],
    ['Text on primary', 'on-primary', 'primary'],
    ['Text on accent', 'on-accent', 'accent'],
    ['Text on primary tint', 'on-primary-soft', 'primary-soft'],
    ...FEEDBACK_NAMES.map((n): [string, string, string] => [`${n[0].toUpperCase()}${n.slice(1)} on surface`, n, 'surface']),
  ];
  return wanted.flatMap(([label, f, b]) => {
    const fg = get(f);
    const bg = get(b);
    if (!fg || !bg) return [];
    const ratio = contrastRatio(fg.hex, bg.hex);
    return [{ label, fg, bg, ratio, pass: ratio >= AA_TEXT }];
  });
}

/** Every primitive name the given families define, for checking that role references resolve. */
export function primitiveNames(families: ColourScale[]): Set<string> {
  return new Set(families.flatMap((f) => SCALE_STEPS.map((s) => `${f.familyName}-${s}`)));
}
