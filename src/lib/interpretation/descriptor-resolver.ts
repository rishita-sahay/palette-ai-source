import { matchDescriptor, type DescriptorMatch } from '@/lib/vibe-db';
import type { Interpretation } from './schema';

/**
 * Step 2 of the pipeline: take the concepts the model extracted and match them to canonical
 * database entries. Deterministic. Anything without a match is kept as "unresolved" and gets
 * no colour association at all.
 */

export type DescriptorRole = 'aesthetic' | 'primary-emotion' | 'secondary-emotion' | 'vibe' | 'sensory' | 'avoid';

export interface ResolvedDescriptor extends DescriptorMatch {
  role: DescriptorRole;
  /** How strongly this descriptor should count (role weight × stated intensity). */
  weight: number;
}

export interface DescriptorResolution {
  resolved: ResolvedDescriptor[];
  /** Descriptors the user wants to stay away from ("not childish"). Never treated as positive. */
  avoided: ResolvedDescriptor[];
  unresolved: string[];
}

/** Priority order from the brief: aesthetic intent > emotion and mood > sensory context. */
const ROLE_WEIGHT: Record<DescriptorRole, number> = {
  aesthetic: 1,
  'primary-emotion': 0.8,
  vibe: 0.7,
  'secondary-emotion': 0.5,
  sensory: 0.4,
  avoid: 0,
};

const ATTRIBUTE_WORDS = new Set(['warm', 'warmer', 'cool', 'cooler', 'cold', 'neutral', 'bright', 'brighter', 'dark', 'darker', 'light', 'lighter', 'colourful', 'colorful', 'saturated', 'desaturated', 'high contrast', 'low contrast']);

export function resolveDescriptors(interpretation: Interpretation): DescriptorResolution {
  const resolved: ResolvedDescriptor[] = [];
  const avoided: ResolvedDescriptor[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();

  const negated = interpretation.negative_constraints.map((c) => matchDescriptor(c)).filter((m): m is DescriptorMatch => !!m);
  const negatedIds = new Set(negated.map((m) => m.record.id));
  for (const m of negated) avoided.push({ ...m, role: 'avoid', weight: 0 });

  const add = (term: string, role: DescriptorRole, intensity = 1) => {
    const match = matchDescriptor(term);
    if (!match) {
      // Plain attribute words ("warm", "bright") are already carried by the visual attributes; they are not unknown concepts.
      if (!ATTRIBUTE_WORDS.has(term.trim().toLowerCase()) && !unresolved.includes(term)) unresolved.push(term);
      return;
    }
    // A concept the user negated must never come back in as a positive association.
    if (negatedIds.has(match.record.id) || seen.has(match.record.id)) return;
    seen.add(match.record.id);
    resolved.push({ ...match, role, weight: ROLE_WEIGHT[role] * Math.max(0.2, intensity) });
  };

  for (const d of interpretation.aesthetic_descriptors) add(d, 'aesthetic');
  for (const e of interpretation.emotions) add(e.name, e.role === 'primary' ? 'primary-emotion' : 'secondary-emotion', e.intensity);
  add(interpretation.primary_vibe, 'vibe');
  for (const v of interpretation.secondary_vibes) add(v, 'vibe', 0.7);
  for (const s of interpretation.sensory_context) add(s, 'sensory');

  return { resolved, avoided, unresolved };
}
