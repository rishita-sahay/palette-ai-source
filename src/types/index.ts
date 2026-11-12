// Shared contract for the whole app. Mirrors PRD §24 (Data Models & Schemas).
import type { VisualTargets } from '@/lib/interpretation/attribute-resolver';
import type { Interpretation } from '@/lib/interpretation/schema';

export const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type ScaleStep = (typeof SCALE_STEPS)[number];

/** Canonical colour value. `h` is null when the colour is achromatic. */
export interface Oklch {
  l: number; // 0–1
  c: number; // ≥ 0
  h: number | null; // 0–360
}

export interface Colour {
  id: string;
  name?: string;
  /** sRGB display value, always 6-digit uppercase. */
  hex: string;
  rgb: { r: number; g: number; b: number }; // 0–255
  hsl: { h: number; s: number; l: number }; // h 0–360, s/l 0–100
  /** Canonical value, stored at full precision. */
  oklch: Oklch;
  locked: boolean;
  familyId?: string;
  /** True when chroma was reduced to fit sRGB (the hex is an approximation of the request). */
  gamutMapped?: boolean;
}

export type HarmonyMode =
  | 'complementary'
  | 'analogous'
  | 'triadic'
  | 'split-complementary'
  | 'tetradic'
  | 'monochromatic';

export type TermCategory = 'hue' | 'temperature' | 'mood' | 'industry' | 'role';

export interface InterpretedTerm {
  term: string;
  category: TermCategory;
  /** Plain-language description of what the keyword changed. */
  effect: string;
}

export type SeedRole = 'primary' | 'accent' | 'neutral';

export interface PaletteColour extends Colour {
  /** Stable role, independent of display order, so reordering never changes how a colour regenerates. */
  role: SeedRole;
  /** Position among the accent seeds (walks the harmony's hue offsets). */
  accentIndex: number;
}

export interface PaletteSource {
  kind: 'colour' | 'prompt';
  input: string;
  interpreted?: InterpretedTerm[];
  unmatched?: string[];
  /** Present when the brief went through the interpretation pipeline (AI or labelled fallback). */
  brief?: BriefRecord;
}

/** How a brief was interpreted. Kept separate from the interpretation itself (Phase 3.2). */
export interface InterpretationMeta {
  mode: 'ai' | 'refined' | 'fallback';
  provider?: string;
  model?: string;
  schemaVersion: number;
  dbVersion: string;
  cached: boolean;
  /** Set only in fallback mode: why the AI path was not used. */
  fallbackReason?: string;
}

export interface BriefRecord {
  /** The user's first prompt, kept verbatim through every refinement. */
  originalPrompt: string;
  refinements: string[];
  meta: InterpretationMeta;
  /** Validated interpretation (absent in fallback mode). */
  interpretation?: Interpretation;
  targets?: VisualTargets;
  unresolved?: string[];
  matched?: { term: string; canonical: string; kind: string; tier: string }[];
}

export interface Palette {
  id: string;
  name: string;
  colours: PaletteColour[];
  harmony: HarmonyMode;
  /** The colour every harmony is computed from. */
  anchor: Oklch;
  /** Chroma / lightness bias applied to derived seeds (set by prompt keywords). */
  chromaBias: number;
  lightnessBias: number;
  /** Explicit hues named in a prompt ("lavender accent", "warm neutrals"); null = derive from harmony. */
  accentHue: number | null;
  neutralHue: number | null;
  /** Increments on "regenerate". Same anchor + harmony + roll = same result. */
  roll: number;
  /** Optional engine settings from the interpretation layer; absent for colour- and keyword-seeded palettes. */
  excludedHues?: [number, number][];
  accentLightnessOffset?: number;
  source: PaletteSource;
}

export type LightnessCurve = 'balanced' | 'linear' | 'high-contrast';

export interface GenerationSettings {
  lightnessCurve: LightnessCurve;
  chromaScale: number; // 1 = as generated
  hueShift: number; // degrees across the ramp, default 0
  gamut: 'srgb' | 'p3';
}

export interface ColourScale {
  id: string;
  familyName: string; // unique, slug-safe
  baseColourId: string;
  base: Colour;
  /** The step the base colour sits on. */
  anchorStep: ScaleStep;
  shades: Record<ScaleStep, Colour>;
  generationSettings: GenerationSettings;
}

export interface Token {
  id: string;
  name: string; // DTCG-safe
  type: 'primitive' | 'semantic';
  value?: string;
  reference?: string; // "{group.token}"
  description?: string;
  group?: string;
}

export interface Theme {
  id: string;
  name: string;
  mode: 'light' | 'dark' | 'custom';
  mappings: Record<string, string>; // semanticTokenId -> primitiveTokenId
  overrides?: Record<string, string>;
}

export type ExportFormat = 'css' | 'tailwind-v4' | 'json';

export interface ExportSettings {
  scope: 'primitive' | 'semantic' | 'complete';
  includeThemes: string[];
  colourFormat: 'hex' | 'oklch';
  namingConvention?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  activeThemeId: string;
  schemaVersion: number;
  palettes: Palette[];
  colourFamilies: ColourScale[];
  tokens: Token[]; // semantic tokens arrive with Token Manager; primitives are derived from scales
  themes: Theme[];
  exportSettings: ExportSettings;
}

export const SCHEMA_VERSION = 1;
