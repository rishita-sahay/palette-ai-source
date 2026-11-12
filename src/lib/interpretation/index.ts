import type { SeedParams } from '@/lib/colour-engine/palette';
import { VIBE_DB_VERSION } from '@/lib/vibe-db';
import type { BriefRecord } from '@/types';
import { resolveAttributes, type VisualTargets } from './attribute-resolver';
import { requestInterpretation, type ClientDeps } from './client';
import { resolveDescriptors, type DescriptorResolution } from './descriptor-resolver';
import { targetsToSeedParams } from './engine-adapter';
import { SCHEMA_VERSION, type Interpretation, type InterpretErrorCode, type InterpretRequest, type ResolutionHints } from './schema';

export * from './schema';
export * from './attribute-resolver';
export * from './descriptor-resolver';
export * from './engine-adapter';
export { FALLBACK_REASONS, getAiStatus, requestInterpretation, resetClientState, clientCacheKey } from './client';

/**
 * The pipeline, end to end:
 *   brief ──(1) AI interpretation, server-side──▶ validated interpretation
 *         ──(2) descriptor resolution──▶ canonical database entries (+ unresolved)
 *         ──(3) attribute resolution──▶ final visual targets
 *         ──(4) engine adapter──▶ seed parameters for the existing colour engine
 * Steps 2–4 are pure and run in the browser; they are recomputed on every use, so a new
 * database version takes effect without invalidating cached interpretations.
 */
export interface Resolved {
  descriptors: DescriptorResolution;
  targets: VisualTargets;
  params: SeedParams;
}

export function resolveInterpretation(interpretation: Interpretation, hints: ResolutionHints): Resolved {
  const descriptors = resolveDescriptors(interpretation);
  const targets = resolveAttributes(interpretation, hints, descriptors);
  return { descriptors, targets, params: targetsToSeedParams(targets) };
}

export type BriefOutcome =
  | { kind: 'ai'; params: SeedParams; record: BriefRecord }
  | { kind: 'unavailable'; code: InterpretErrorCode; reason: string };

export interface BriefContext {
  originalPrompt: string;
  refinements: string[];
  previous: Interpretation;
  targets: VisualTargets;
}

export async function interpretBrief(prompt: string, context?: BriefContext, deps?: ClientDeps): Promise<BriefOutcome> {
  const request: InterpretRequest = {
    prompt,
    context: context && {
      original_prompt: context.originalPrompt,
      refinements: context.refinements,
      previous_interpretation: context.previous,
      current_targets: { temperature: context.targets.temperature, lightness: context.targets.lightness, chroma: context.targets.chroma, contrast: context.targets.contrast },
    },
  };
  const result = await requestInterpretation(request, deps);
  if (!result.ok) return { kind: 'unavailable', code: result.code, reason: result.message };

  const { interpretation, resolution_hints, meta } = result.data;
  const { descriptors, targets, params } = resolveInterpretation(interpretation, resolution_hints);
  return {
    kind: 'ai',
    params,
    record: {
      originalPrompt: context?.originalPrompt ?? prompt,
      refinements: context ? [...context.refinements, prompt] : [],
      meta: { mode: context ? 'refined' : 'ai', provider: meta.provider, model: meta.model, schemaVersion: SCHEMA_VERSION, dbVersion: VIBE_DB_VERSION, cached: meta.cached },
      interpretation,
      targets,
      unresolved: descriptors.unresolved,
      matched: descriptors.resolved.map((d) => ({ term: d.term, canonical: d.record.id, kind: d.record.kind, tier: d.record.hueTier === 'research' ? 'research' : d.record.tier })),
    },
  };
}
