import { SCALE_STEPS, type ColourScale, type Project, type ScaleStep } from '@/types';
import { contrastRatio, formatRatio } from '@/lib/contrast';
import { AA_TEXT, fillCandidates, groupFamilies, isFeedbackName, keyFamilies, pickFill } from '@/lib/tokens/roles';

/**
 * The usage guide. Every sentence here is assembled from fixed rules and WCAG contrast maths on the
 * current scales — no AI model writes any of it — so the same palette always gets the same guide.
 */

const WHITE = '#FFFFFF';
const INK = '#0A0A0A';

export type FamilyKind = 'primary' | 'accent' | 'neutral' | 'feedback' | 'other';

export interface StepAdvice {
  step: ScaleStep;
  hex: string;
  /** Whichever of white or near-black reads better on this step. */
  text: typeof WHITE | typeof INK;
  ratio: number;
  aa: boolean;
}

export interface FamilyGuide {
  id: string;
  name: string;
  kind: FamilyKind;
  baseHex: string;
  use: string;
  /** Step to use for solid fills (buttons, badges) and the text colour that goes on it. */
  fillStep: ScaleStep;
  fillText: 'white' | 'dark';
  fillRatio: number;
  hoverStep: ScaleStep;
  tintStep: ScaleStep;
  borderStep: ScaleStep;
  /** Lightest step that reaches AA as text on white; null if none does. */
  textOnWhite: ScaleStep | null;
  /** Darkest step that reaches AA as text on this family's 950; null if none does. */
  textOnDark: ScaleStep | null;
  steps: StepAdvice[];
}

export interface Guide {
  families: FamilyGuide[];
  proportions: { name: string; share: number; hex: string; note: string }[];
  dos: string[];
  donts: string[];
}

const USE: Record<FamilyKind, string> = {
  primary: 'The main brand colour. Use it for the one primary action on a screen, links and active states.',
  accent: 'A supporting colour. Keep it to small areas such as highlights, tags and badges so it keeps its pull.',
  neutral: 'Backgrounds, text, borders and dividers. Most of any screen should be neutral.',
  feedback: 'Status only. Never use it for decoration.',
  other: 'An extra colour family. Treat it like an accent.',
};
const FEEDBACK_USE: Record<string, string> = {
  success: 'Confirmation and positive status. Status only, never decoration.',
  warning: 'Caution that needs attention but is not an error. Status only.',
  error: 'Errors and destructive actions. Status only.',
  info: 'Neutral information and tips. Status only.',
};

const nextStep = (step: ScaleStep): ScaleStep => SCALE_STEPS[Math.min(SCALE_STEPS.length - 1, SCALE_STEPS.indexOf(step) + 1)];

function familyGuide(family: ColourScale, kind: FamilyKind, neutral: ColourScale): FamilyGuide {
  const fill = pickFill(family, neutral, fillCandidates(family, 'light'));
  const fillStep = Number(fill.fill.ref!.split('-').pop()) as ScaleStep;
  const steps = SCALE_STEPS.map((step): StepAdvice => {
    const hex = family.shades[step].hex;
    const white = contrastRatio(WHITE, hex);
    const ink = contrastRatio(INK, hex);
    const ratio = Math.max(white, ink);
    return { step, hex, text: white >= ink ? WHITE : INK, ratio, aa: ratio >= AA_TEXT };
  });
  return {
    id: family.id,
    name: family.familyName,
    kind,
    baseHex: family.base.hex,
    use: kind === 'feedback' ? (FEEDBACK_USE[family.familyName] ?? USE.feedback) : USE[kind],
    fillStep,
    fillText: fill.on.ref ? 'dark' : 'white',
    fillRatio: fill.ratio,
    hoverStep: nextStep(fillStep),
    tintStep: 100,
    borderStep: 300,
    textOnWhite: SCALE_STEPS.find((s) => contrastRatio(family.shades[s].hex, WHITE) >= AA_TEXT) ?? null,
    textOnDark: [...SCALE_STEPS].reverse().find((s) => contrastRatio(family.shades[s].hex, family.shades[950].hex) >= AA_TEXT) ?? null,
    steps,
  };
}

export function buildGuide(project: Project): Guide | null {
  const key = keyFamilies(project);
  if (!key) return null;
  const { brand, feedback } = groupFamilies(project);
  const accentIds = new Set((project.palettes[0]?.colours ?? []).filter((c) => c.role === 'accent').map((c) => c.familyId));
  const kindOf = (f: ColourScale): FamilyKind =>
    f.id === key.primary.id ? 'primary' : f.id === key.neutral.id ? 'neutral' : f.id === key.accent.id || accentIds.has(f.id) ? 'accent' : isFeedbackName(f.familyName) ? 'feedback' : 'other';
  const families = [...brand.map((f) => familyGuide(f, kindOf(f), key.neutral)), ...feedback.map((f) => familyGuide(f, 'feedback', key.neutral))];

  const p = families.find((f) => f.id === key.primary.id)!;
  const n = families.find((f) => f.id === key.neutral.id)!;
  const a = families.find((f) => f.id === key.accent.id)!;
  const shade = (f: FamilyGuide, step: ScaleStep) => f.steps.find((s) => s.step === step)!;
  const body = formatRatio(contrastRatio(shade(n, 900).hex, shade(n, 50).hex));

  const dos = [
    `Use ${p.name}-${p.fillStep} for primary buttons, with ${p.fillText} text on it (${formatRatio(p.fillRatio)}).`,
    `Use ${n.name}-900 for body text on ${n.name}-50 (${body}).`,
    ...(p.textOnWhite ? [`When ${p.name} is used as text or a link on white, use ${p.name}-${p.textOnWhite} or darker.`] : []),
    ...(a.id !== p.id ? [`Keep ${a.name} to small areas: badges, highlights, one illustration colour.`] : []),
    `Use the 50 and 100 steps for tinted backgrounds, and 200 or 300 for borders.`,
    ...(feedback.length ? ['Pair every feedback colour with an icon or a label, so meaning never depends on colour alone (WCAG 1.4.1).'] : []),
  ];

  // Real failing examples from this palette: the darkest step where white still fails and the lightest where dark does.
  const whiteFails = ([600, 500, 400, 300] as const).map((s) => shade(p, s)).find((s) => contrastRatio(WHITE, s.hex) < AA_TEXT);
  const darkFails = ([600, 700, 800] as const).map((s) => shade(p, s)).find((s) => contrastRatio(INK, s.hex) < AA_TEXT);
  const weakText = p.textOnWhite ? SCALE_STEPS[SCALE_STEPS.indexOf(p.textOnWhite) - 1] : 400;
  const donts = [
    ...(whiteFails ? [`Don’t put white text on ${p.name}-${whiteFails.step} (${formatRatio(contrastRatio(WHITE, whiteFails.hex))}, below the 4.5:1 AA minimum).`] : []),
    ...(darkFails ? [`Don’t put dark text on ${p.name}-${darkFails.step} (${formatRatio(contrastRatio(INK, darkFails.hex))}, below the 4.5:1 AA minimum).`] : []),
    ...(weakText ? [`Don’t use ${p.name}-${weakText} or lighter as text on white (${formatRatio(contrastRatio(shade(p, weakText).hex, WHITE))}).`] : []),
    `Don’t use ${n.name}-400 or lighter for body text (${formatRatio(contrastRatio(shade(n, 400).hex, WHITE))} on white).`,
    ...(a.id !== p.id ? [`Don’t fill large areas with ${a.name}-${a.fillStep}. Use ${a.name}-50 or ${a.name}-100 for big tinted surfaces.`] : []),
    `Don’t use more than one solid ${p.name} button in the same view.`,
  ];

  const proportions = [
    { name: n.name, share: 60, hex: shade(n, 100).hex, note: 'backgrounds, text, borders' },
    { name: p.name, share: 30, hex: shade(p, p.fillStep).hex, note: 'actions, links, key surfaces' },
    ...(a.id !== p.id ? [{ name: a.name, share: 10, hex: shade(a, a.fillStep).hex, note: 'highlights only' }] : []),
  ];

  return { families, proportions, dos, donts };
}
