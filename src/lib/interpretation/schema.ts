// Interpretation schema (Phase 3). Shared by the browser and the server route, so this file
// must only import `zod` — no path aliases, no UI, no colour engine.
import { z } from 'zod';

/** Bump when the shape or meaning of the interpretation changes. Part of every cache key. */
export const SCHEMA_VERSION = 1;
export const PROMPT_LIMIT = 600;

export const TEMPERATURES = ['warm', 'cool', 'neutral', 'warm-neutral', 'cool-neutral'] as const;
export type Temperature = (typeof TEMPERATURES)[number];

const unit = z.number().min(0).max(1);
const HEX_LIKE = /#[0-9a-f]{3,8}\b|\b(rgb|hsl|oklch|lab|lch)a?\s*\(/i;
/** Short plain-language phrase. Colour *values* are rejected: the model names colours, the engine makes them. */
const phrase = z.string().trim().min(1).max(80).refine((s) => !HEX_LIKE.test(s), { message: 'Colour values are not allowed here — use a colour name.' });
const phrases = (max: number) => z.array(phrase).max(max);

export const InterpretationSchema = z.strictObject({
  primary_vibe: phrase,
  secondary_vibes: phrases(6),
  emotions: z
    .array(z.strictObject({ name: phrase, role: z.enum(['primary', 'secondary']), intensity: unit, confidence: unit }))
    .max(8),
  emotional_dimensions: z.strictObject({ valence: unit, arousal: unit, dominance: unit }),
  visual_attributes: z.strictObject({
    temperature: z.enum(TEMPERATURES),
    lightness: unit,
    chroma: unit,
    contrast: unit,
    hue_preferences: phrases(4),
    hue_exclusions: phrases(8),
  }),
  aesthetic_descriptors: phrases(8),
  sensory_context: phrases(8),
  modifiers: phrases(8),
  explicit_colour_preferences: phrases(4),
  negative_constraints: phrases(8),
  interpretation_summary: z.string().trim().min(1).max(400).refine((s) => !HEX_LIKE.test(s), { message: 'No colour values in the summary.' }),
  confidence: unit,
  needs_clarification: z.boolean(),
});
export type Interpretation = z.infer<typeof InterpretationSchema>;

export const ATTRIBUTES = ['temperature', 'lightness', 'chroma', 'contrast', 'hue'] as const;
export type AttributeName = (typeof ATTRIBUTES)[number];

/**
 * Operational hints that sit beside the interpretation, not inside it:
 * which attributes the user stated outright (these outrank any association), and, for a
 * refinement, which attributes the user asked to change.
 */
export const HintsSchema = z.strictObject({
  explicit_attributes: z.array(z.enum(ATTRIBUTES)).max(5),
  changed_attributes: z.array(z.enum(ATTRIBUTES)).max(5),
});
export type ResolutionHints = z.infer<typeof HintsSchema>;

export const EnvelopeSchema = z.strictObject({ interpretation: InterpretationSchema, resolution_hints: HintsSchema });
export type Envelope = z.infer<typeof EnvelopeSchema>;

export type Validation<T> = { ok: true; data: T } | { ok: false; errors: string[] };

function run<T>(schema: z.ZodType<T>, value: unknown): Validation<T> {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, errors: result.error.issues.slice(0, 12).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
}

/** Nothing from a model reaches the resolver or the colour engine without passing this. */
export const validateEnvelope = (value: unknown) => run(EnvelopeSchema, value);
export const validateInterpretation = (value: unknown) => run(InterpretationSchema, value);

/** Current resolved targets, sent back with a refinement so the model edits rather than restarts. */
const TargetsSummarySchema = z.strictObject({ temperature: z.enum(TEMPERATURES), lightness: unit, chroma: unit, contrast: unit });

export const RequestSchema = z.strictObject({
  prompt: z.string().trim().min(1).max(PROMPT_LIMIT),
  context: z
    .strictObject({
      original_prompt: z.string().trim().min(1).max(PROMPT_LIMIT),
      refinements: z.array(z.string().trim().min(1).max(PROMPT_LIMIT)).max(12),
      previous_interpretation: InterpretationSchema,
      current_targets: TargetsSummarySchema,
    })
    .optional(),
});
export type InterpretRequest = z.infer<typeof RequestSchema>;
export const validateRequest = (value: unknown) => run(RequestSchema, value);

export type InterpretErrorCode = 'no_credentials' | 'timeout' | 'rate_limited' | 'overloaded' | 'provider_error' | 'invalid_response' | 'bad_request' | 'network' | 'unavailable';

export interface InterpretSuccess {
  interpretation: Interpretation;
  resolution_hints: ResolutionHints;
  meta: { provider: string; model: string; schemaVersion: number; cached: boolean; refined: boolean };
}
export interface InterpretFailure {
  error: { code: InterpretErrorCode; message: string };
}

/** JSON Schema handed to the model as the tool's input schema (structured output). */
export function envelopeJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(EnvelopeSchema) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}
