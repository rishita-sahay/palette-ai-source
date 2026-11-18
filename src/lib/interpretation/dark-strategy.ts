import { DEFAULT_DARK_STRATEGY, type DarkStrategy } from '@/lib/colour-engine/dark';
import type { VisualTargets } from './attribute-resolver';

/**
 * Decides how the dark theme should be built for a brief, from the visual targets the AI
 * interpretation produced. It only chooses the strategy; the colour engine does the maths.
 * With no AI reading (a colour seed, or the keyword fallback) the engine's default strategy is used.
 *
 * - Contrast: a high-contrast brief gets a deeper background and bigger steps between layers;
 *   a soft one gets a lifted, gentler dark.
 * - Chroma: a muted brief keeps less of each brand colour's chroma on dark; a vivid one keeps more.
 * - Temperature: a warm or cool brief lets the dark neutrals carry more of that tint; a neutral one keeps them near grey.
 */
export function darkStrategyFor(targets?: Pick<VisualTargets, 'contrast' | 'chroma' | 'temperature'>): DarkStrategy {
  if (!targets) return DEFAULT_DARK_STRATEGY;
  const round = (n: number) => Number(n.toFixed(4));
  return {
    depth: round(0.2 - 0.07 * targets.contrast),
    elevation: round(0.04 + 0.025 * targets.contrast),
    chromaKeep: round(0.8 + 0.18 * targets.chroma),
    tint: targets.temperature === 'neutral' ? 0.008 : targets.temperature === 'warm' || targets.temperature === 'cool' ? 0.022 : 0.015,
    basis: 'brief',
  };
}
