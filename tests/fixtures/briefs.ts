import type { Envelope, Temperature, AttributeName } from '@/lib/interpretation/schema';

/**
 * Recorded interpretations for the evaluation prompts.
 *
 * IMPORTANT: these are hand-recorded model outputs used as mocked API responses so the tests
 * run without an API key. They show what the interpretation layer is expected to return and
 * let the resolver → engine path be tested end to end. They are not a measurement of a live
 * model. `npm run eval:live` runs the same prompts against the real API once a key is set.
 */

type Emo = [name: string, role: 'primary' | 'secondary', intensity: number];
interface Spec {
  pv: string; sv?: string[]; emo?: Emo[]; vad: [number, number, number];
  temp: Temperature; L: number; C: number; K: number;
  hues?: string[]; excl?: string[]; aes?: string[]; sens?: string[]; mods?: string[]; cols?: string[]; neg?: string[];
  explicit?: AttributeName[]; changed?: AttributeName[]; summary: string; conf?: number; clarify?: boolean;
}
export function envelope(s: Spec): Envelope {
  return {
    interpretation: {
      primary_vibe: s.pv,
      secondary_vibes: s.sv ?? [],
      emotions: (s.emo ?? []).map(([name, role, intensity]) => ({ name, role, intensity, confidence: 0.8 })),
      emotional_dimensions: { valence: s.vad[0], arousal: s.vad[1], dominance: s.vad[2] },
      visual_attributes: { temperature: s.temp, lightness: s.L, chroma: s.C, contrast: s.K, hue_preferences: s.hues ?? [], hue_exclusions: s.excl ?? [] },
      aesthetic_descriptors: s.aes ?? [],
      sensory_context: s.sens ?? [],
      modifiers: s.mods ?? [],
      explicit_colour_preferences: s.cols ?? [],
      negative_constraints: s.neg ?? [],
      interpretation_summary: s.summary,
      confidence: s.conf ?? 0.8,
      needs_clarification: s.clarify ?? false,
    },
    resolution_hints: { explicit_attributes: s.explicit ?? [], changed_attributes: s.changed ?? [] },
  };
}

export type Check =
  | ['lightness' | 'chroma' | 'contrast', '>' | '<', number]
  | ['temperature', Temperature]
  | ['excludes', ...string[]]
  | ['hueNear', number, number?]
  | ['warmHue'] | ['coolHue']
  | ['unresolved', string]
  | ['matched', string]
  | ['clarify']
  | ['hueTier', string];

export interface BriefCase {
  id: number;
  category: string;
  prompt: string;
  envelope: Envelope;
  checks: Check[];
}

const c = (id: number, category: string, prompt: string, spec: Spec, checks: Check[]): BriefCase => ({ id, category, prompt, envelope: envelope(spec), checks });

export const BRIEFS: BriefCase[] = [
  c(1, 'multiple emotions', 'A peaceful and comforting palette.',
    { pv: 'peaceful', sv: ['comforting'], emo: [['serenity', 'primary', 0.8], ['comfort', 'secondary', 0.7]], vad: [0.75, 0.2, 0.35], temp: 'warm-neutral', L: 0.7, C: 0.28, K: 0.25, summary: 'A quiet, reassuring palette: soft, light and gently warm, with nothing that jumps out.' },
    [['chroma', '<', 0.4], ['contrast', '<', 0.4], ['lightness', '>', 0.55], ['matched', 'calm']]),
  c(2, 'multiple emotions', 'Something exciting, loud and energetic.',
    { pv: 'energetic', sv: ['exciting', 'loud'], emo: [['excitement', 'primary', 0.95]], vad: [0.8, 0.95, 0.75], temp: 'warm', L: 0.62, C: 0.92, K: 0.88, summary: 'High energy throughout: saturated colour, strong contrast and a warm lead.' },
    [['chroma', '>', 0.8], ['contrast', '>', 0.75], ['warmHue']]),
  c(3, 'contradictory moods', 'Nostalgic but bright and colourful.',
    { pv: 'nostalgic', sv: ['bright', 'colourful'], emo: [['nostalgia', 'primary', 0.7]], vad: [0.7, 0.55, 0.5], temp: 'warm', L: 0.76, C: 0.74, K: 0.55, explicit: ['lightness', 'chroma'], summary: 'Nostalgia carried by warm, familiar hues, kept bright and colourful as you asked rather than faded.' },
    [['lightness', '>', 0.7], ['chroma', '>', 0.7], ['warmHue']]),
  c(4, 'hue exclusions', 'Warm and sophisticated without orange or yellow.',
    { pv: 'sophisticated', sv: ['warm'], vad: [0.6, 0.35, 0.6], temp: 'warm', L: 0.44, C: 0.36, K: 0.52, excl: ['orange', 'yellow'], aes: ['understated elegance'], explicit: ['temperature', 'hue'], summary: 'Warmth through deeper reds and rosy tones instead of orange or yellow, kept restrained and grown-up.' },
    [['excludes', 'orange', 'yellow'], ['warmHue'], ['temperature', 'warm'], ['chroma', '<', 0.5]]),
  c(5, 'sensory description', 'A rainy evening, slightly melancholic but comforting.',
    { pv: 'comforting', sv: ['melancholic'], emo: [['comfort', 'primary', 0.7], ['melancholy', 'secondary', 0.3]], vad: [0.5, 0.2, 0.3], temp: 'cool-neutral', L: 0.4, C: 0.24, K: 0.3, sens: ['rainy evening'], aes: ['atmospheric'], mods: ['slightly melancholic'], summary: 'Soft grey-blue dusk with a little warmth in it: quiet and a touch sad, but somewhere you would want to stay.' },
    [['lightness', '<', 0.5], ['chroma', '<', 0.35], ['coolHue'], ['matched', 'rainy']]),
  c(6, 'negations', 'Bold and playful, but not childish.',
    { pv: 'bold', sv: ['playful'], emo: [['playfulness', 'secondary', 0.7]], vad: [0.8, 0.8, 0.7], temp: 'warm-neutral', L: 0.6, C: 0.78, K: 0.8, neg: ['childish'], aes: ['contemporary'], summary: 'Confident and fun, with strong colour and contrast, but tuned to look grown-up rather than toy-like.' },
    [['chroma', '>', 0.6], ['contrast', '>', 0.7], ['chroma', '<', 0.9]]),
  c(7, 'multiple emotions', 'Dark, elegant and mysterious.',
    { pv: 'mysterious', sv: ['elegant'], vad: [0.45, 0.4, 0.7], temp: 'cool', L: 0.2, C: 0.38, K: 0.62, aes: ['elegant'], explicit: ['lightness'], summary: 'Deep, low-lit and refined: dark tones with a restrained jewel-like accent.' },
    [['lightness', '<', 0.3], ['coolHue'], ['matched', 'mysterious']]),
  c(8, 'aesthetic description', 'Minimal, clean and trustworthy.',
    { pv: 'trustworthy', sv: ['minimal', 'clean'], emo: [['trust', 'primary', 0.8]], vad: [0.65, 0.3, 0.55], temp: 'cool-neutral', L: 0.66, C: 0.34, K: 0.5, aes: ['minimal', 'clean'], summary: 'A pared-back, dependable palette: plenty of quiet space and one calm, steady lead colour.' },
    [['chroma', '<', 0.45], ['coolHue'], ['matched', 'minimal']]),
  c(9, 'environmental context', 'A quiet summer morning.',
    { pv: 'calm', sv: ['fresh'], emo: [['serenity', 'primary', 0.7]], vad: [0.8, 0.2, 0.3], temp: 'warm-neutral', L: 0.84, C: 0.34, K: 0.28, sens: ['summer', 'morning'], summary: 'Early light on a warm day: pale, soft and unhurried.' },
    [['lightness', '>', 0.7], ['contrast', '<', 0.4], ['matched', 'morning']]),
  c(10, 'negations', 'Luxury without looking too formal.',
    { pv: 'luxurious', sv: ['approachable'], vad: [0.7, 0.4, 0.65], temp: 'warm-neutral', L: 0.46, C: 0.42, K: 0.58, aes: ['luxury'], neg: ['formal'], mods: ['not too formal'], summary: 'Rich and considered, but relaxed: depth and warmth without stiffness.' },
    [['matched', 'luxurious'], ['lightness', '<', 0.6]]),
  c(11, 'aesthetic description', 'Fresh, natural and organic.',
    { pv: 'fresh', sv: ['natural', 'organic'], vad: [0.8, 0.4, 0.4], temp: 'neutral', L: 0.68, C: 0.42, K: 0.42, aes: ['natural', 'organic'], hues: ['green'], summary: 'Leafy, clean and alive: greens leading, with earthy support.' },
    [['hueNear', 148, 25], ['matched', 'natural']]),
  c(12, 'negations', 'Romantic but not overly feminine.',
    { pv: 'romantic', vad: [0.75, 0.4, 0.45], emo: [['love', 'primary', 0.6]], temp: 'warm', L: 0.5, C: 0.42, K: 0.46, neg: ['overly feminine'], mods: ['not overly feminine'], summary: 'Romance through deeper, wine-like warmth and soft contrast, steering away from pale pinks.' },
    [['warmHue'], ['lightness', '<', 0.65], ['hueTier', 'research']]),
  c(13, 'mixed emotions', 'Something futuristic but approachable.',
    { pv: 'futuristic', sv: ['approachable'], vad: [0.7, 0.6, 0.55], temp: 'cool-neutral', L: 0.62, C: 0.6, K: 0.58, aes: ['futuristic'], summary: 'Forward-looking and clean, softened so it feels friendly rather than cold.' },
    [['coolHue'], ['matched', 'futuristic'], ['lightness', '>', 0.5]]),
  c(14, 'mixed emotions', 'A little nostalgic, but with a contemporary feel.',
    { pv: 'contemporary', sv: ['nostalgic'], emo: [['nostalgia', 'secondary', 0.3]], vad: [0.65, 0.4, 0.5], temp: 'warm-neutral', L: 0.6, C: 0.46, K: 0.52, aes: ['contemporary'], mods: ['a little nostalgic'], summary: 'A modern palette with a hint of something remembered: mostly crisp, slightly warm.' },
    [['matched', 'contemporary'], ['chroma', '>', 0.35]]),
  c(15, 'modifiers', 'Something calm but not boring, warm yet sophisticated.',
    { pv: 'calm', sv: ['sophisticated'], emo: [['serenity', 'primary', 0.7]], vad: [0.7, 0.3, 0.5], temp: 'warm', L: 0.56, C: 0.38, K: 0.5, aes: ['understated elegance'], neg: ['boring'], mods: ['not boring'], explicit: ['temperature'], summary: 'Calm and warm with enough depth and colour to stay interesting: understated, not flat.' },
    [['temperature', 'warm'], ['chroma', '>', 0.25], ['chroma', '<', 0.5], ['warmHue']]),
  c(16, 'sensory description', 'A rainy evening, nostalgic, slightly melancholic but comforting.',
    { pv: 'nostalgic', sv: ['melancholic', 'comforting'], emo: [['nostalgia', 'primary', 0.8], ['melancholy', 'secondary', 0.3], ['comfort', 'secondary', 0.6]], vad: [0.5, 0.2, 0.3], temp: 'cool-neutral', L: 0.38, C: 0.22, K: 0.3, sens: ['rainy evening'], aes: ['cinematic', 'atmospheric'], mods: ['slightly melancholic'], summary: 'A cinematic, low-lit palette: cool and muted like wet streets, with a small warm note for comfort.' },
    [['lightness', '<', 0.5], ['chroma', '<', 0.35], ['contrast', '<', 0.45], ['matched', 'cinematic']]),
  c(17, 'negations', 'Bold, energetic and playful, but avoid anything too childish.',
    { pv: 'energetic', sv: ['playful', 'bold'], emo: [['excitement', 'primary', 0.85], ['playfulness', 'secondary', 0.7]], vad: [0.85, 0.9, 0.7], temp: 'warm-neutral', L: 0.64, C: 0.8, K: 0.84, aes: ['contemporary', 'expressive'], neg: ['childish'], summary: 'Lively and expressive with strong contrast, kept contemporary rather than primary-school bright.' },
    [['chroma', '>', 0.6], ['chroma', '<', 0.9], ['contrast', '>', 0.7]]),
  c(18, 'single emotion', 'Joyful.',
    { pv: 'joyful', emo: [['joy', 'primary', 0.9]], vad: [0.95, 0.7, 0.6], temp: 'warm', L: 0.78, C: 0.7, K: 0.55, summary: 'Bright, sunny and open.' },
    [['lightness', '>', 0.65], ['warmHue'], ['hueTier', 'research']]),
  c(19, 'single emotion', 'Anger.',
    { pv: 'angry', emo: [['anger', 'primary', 0.9]], vad: [0.1, 0.9, 0.85], temp: 'warm', L: 0.4, C: 0.85, K: 0.85, summary: 'Hot, intense and confrontational.' },
    [['hueNear', 27, 15], ['hueTier', 'research'], ['contrast', '>', 0.7]]),
  c(20, 'contradictory moods', 'Calm but energetic.',
    { pv: 'calm', sv: ['energetic'], vad: [0.7, 0.5, 0.5], temp: 'cool-neutral', L: 0.66, C: 0.42, K: 0.6, summary: 'A calm base with a few energetic accents: mostly quiet, with deliberate sparks.' },
    [['contrast', '>', 0.5], ['chroma', '<', 0.6]]),
  c(21, 'contradictory moods', 'Dark but optimistic.',
    { pv: 'optimistic', sv: ['dark'], emo: [['optimism', 'primary', 0.7]], vad: [0.75, 0.5, 0.6], temp: 'warm-neutral', L: 0.26, C: 0.6, K: 0.68, explicit: ['lightness'], summary: 'A dark palette lifted by warm, hopeful highlights.' },
    [['lightness', '<', 0.35], ['chroma', '>', 0.45]]),
  c(22, 'intensity modifiers', 'Not too bright, subtle rather than loud.',
    { pv: 'subtle', vad: [0.55, 0.2, 0.35], temp: 'neutral', L: 0.52, C: 0.2, K: 0.26, mods: ['not too bright', 'subtle rather than loud'], neg: ['loud'], explicit: ['lightness', 'chroma'], summary: 'Quiet and mid-toned: nothing bright, nothing shouting.' },
    [['lightness', '<', 0.62], ['chroma', '<', 0.3], ['contrast', '<', 0.4]]),
  c(23, 'explicit colour preferences', 'Deep navy with a touch of gold.',
    { pv: 'refined', vad: [0.6, 0.35, 0.7], temp: 'cool', L: 0.26, C: 0.46, K: 0.66, cols: ['navy', 'gold'], mods: ['a touch of gold'], explicit: ['hue', 'lightness'], summary: 'Deep navy leading, with gold used sparingly as the accent.' },
    [['hueNear', 262, 10], ['lightness', '<', 0.35]]),
  c(24, 'hue exclusions', 'Anything but blue or green, make it feel trustworthy.',
    { pv: 'trustworthy', emo: [['trust', 'primary', 0.8]], vad: [0.65, 0.3, 0.6], temp: 'neutral', L: 0.5, C: 0.4, K: 0.52, excl: ['blue', 'green'], explicit: ['hue'], summary: 'Dependable and steady, built without the usual blues or greens.' },
    [['excludes', 'blue', 'green']]),
  c(25, 'metaphor', 'Like the inside of an old library at dusk.',
    { pv: 'contemplative', sv: ['nostalgic'], emo: [['nostalgia', 'secondary', 0.5]], vad: [0.55, 0.2, 0.5], temp: 'warm', L: 0.3, C: 0.34, K: 0.52, sens: ['old library', 'dusk'], aes: ['dark academia'], summary: 'Leather, old paper and low lamplight: deep, warm browns with a muted glow.' },
    [['lightness', '<', 0.4], ['warmHue'], ['matched', 'dark-academia'], ['unresolved', 'contemplative']]),
  c(26, 'metaphor', 'The feeling of the first sip of coffee on a cold morning.',
    { pv: 'comforting', sv: ['awakening'], emo: [['comfort', 'primary', 0.8]], vad: [0.75, 0.35, 0.4], temp: 'warm', L: 0.48, C: 0.36, K: 0.48, sens: ['coffee', 'cold morning'], hues: ['brown'], summary: 'Warm, roasted browns against a cool, pale morning: comfort arriving.' },
    [['warmHue'], ['hueNear', 55, 20]]),
  c(27, 'ambiguous', 'Something nice.',
    { pv: 'pleasant', vad: [0.7, 0.4, 0.45], temp: 'neutral', L: 0.62, C: 0.45, K: 0.45, summary: 'A generally pleasant, balanced palette. The brief leaves most choices open.', conf: 0.25, clarify: true },
    [['clarify'], ['unresolved', 'pleasant']]),
  c(28, 'aesthetic description', 'Japandi living room, quiet and considered.',
    { pv: 'calm', sv: ['considered'], vad: [0.65, 0.15, 0.4], temp: 'warm-neutral', L: 0.68, C: 0.16, K: 0.3, aes: ['japandi', 'minimal'], sens: ['living room'], summary: 'Pale wood, stone and soft grey-greens: quiet, natural and carefully reduced.' },
    [['matched', 'japandi'], ['chroma', '<', 0.3], ['unresolved', 'living room']]),
  c(29, 'long descriptive', 'I want a palette that feels like a quiet Sunday afternoon, warm sunlight coming through curtains, a little nostalgic, but still modern and sophisticated.',
    { pv: 'calm', sv: ['nostalgic', 'sophisticated'], emo: [['contentment', 'primary', 0.7], ['nostalgia', 'secondary', 0.35]], vad: [0.75, 0.2, 0.45], temp: 'warm', L: 0.72, C: 0.34, K: 0.4, sens: ['sunday afternoon', 'warm sunlight', 'curtains'], aes: ['modern', 'sophisticated'], mods: ['a little nostalgic'], summary: 'Soft, sunlit warmth with a gentle nostalgic tint, kept clean and current rather than vintage.' },
    [['lightness', '>', 0.6], ['warmHue'], ['chroma', '<', 0.5], ['matched', 'sunlight'], ['unresolved', 'curtains']]),
  c(30, 'intensity modifiers', 'Extremely vivid, almost neon, very high contrast.',
    { pv: 'electric', vad: [0.7, 0.95, 0.8], temp: 'cool-neutral', L: 0.66, C: 0.98, K: 0.97, aes: ['neon'], explicit: ['chroma', 'contrast'], summary: 'Maximum saturation and contrast.' },
    [['chroma', '>', 0.9], ['contrast', '>', 0.9]]),
  c(31, 'intensity modifiers', 'Slightly muted, a little dark.',
    { pv: 'subdued', vad: [0.5, 0.3, 0.45], temp: 'neutral', L: 0.42, C: 0.38, K: 0.45, mods: ['slightly muted', 'a little dark'], explicit: ['chroma', 'lightness'], summary: 'A touch quieter and a touch darker than a middle-of-the-road palette.' },
    [['lightness', '<', 0.5], ['lightness', '>', 0.3], ['chroma', '<', 0.5], ['chroma', '>', 0.25]]),
  c(32, 'environmental context', 'Ocean at night, calm and vast.',
    { pv: 'calm', sv: ['vast'], emo: [['awe', 'secondary', 0.5]], vad: [0.6, 0.15, 0.6], temp: 'cool', L: 0.22, C: 0.36, K: 0.5, sens: ['ocean', 'night'], summary: 'Deep blue-black water under a dark sky: still, cool and very wide.' },
    [['lightness', '<', 0.3], ['coolHue'], ['matched', 'ocean']]),
];

/** Contextual refinements: [index of the brief being refined, refinement text, recorded reply, attributes that must not move]. */
export const REFINEMENTS: { of: number; text: string; envelope: Envelope; unchanged: ('lightness' | 'contrast' | 'chroma')[]; checks: Check[] }[] = [
  {
    of: 16, text: 'Make it warmer and less saturated.',
    envelope: envelope({ pv: 'nostalgic', sv: ['melancholic', 'comforting'], emo: [['nostalgia', 'primary', 0.8], ['melancholy', 'secondary', 0.3], ['comfort', 'secondary', 0.6]], vad: [0.5, 0.2, 0.3], temp: 'warm-neutral', L: 0.38, C: 0.1, K: 0.3, sens: ['rainy evening'], aes: ['cinematic', 'atmospheric'], mods: ['slightly melancholic', 'warmer', 'less saturated'], explicit: ['temperature', 'chroma'], changed: ['temperature', 'chroma'], summary: 'The same rainy, nostalgic evening, now tipped warmer and quieter in colour.' }),
    unchanged: ['lightness', 'contrast'],
    checks: [['temperature', 'warm-neutral'], ['chroma', '<', 0.2]],
  },
  {
    of: 3, text: 'Keep the same mood but reduce the contrast.',
    envelope: envelope({ pv: 'nostalgic', sv: ['bright', 'colourful'], emo: [['nostalgia', 'primary', 0.7]], vad: [0.7, 0.55, 0.5], temp: 'warm', L: 0.76, C: 0.74, K: 0.36, explicit: ['lightness', 'chroma', 'contrast'], changed: ['contrast'], summary: 'Still bright, colourful nostalgia, with the colours sitting closer together.' }),
    unchanged: ['lightness', 'chroma'],
    checks: [['contrast', '<', 0.45], ['lightness', '>', 0.7]],
  },
];
