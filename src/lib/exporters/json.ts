import { SCALE_STEPS, SCHEMA_VERSION, type ExportSettings, type Project } from '@/types';
import { formatOklch } from '@/lib/colour-engine/convert';
import { derivePrimitives, type ExportResult } from './primitives';

const round = (n: number, dp: number) => Number(n.toFixed(dp));

/** Structured JSON (EX-004). Shape follows PRD §24: schemaVersion, project, families, primitives, semantics, themes. */
export function buildJsonExport(project: Project) {
  return {
    schemaVersion: SCHEMA_VERSION,
    generator: 'Palette AI',
    project: {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    families: project.colourFamilies.map((family) => ({
      name: family.familyName,
      base: { hex: family.base.hex, oklch: formatOklch(family.base.oklch) },
      anchorStep: family.anchorStep,
      generationSettings: family.generationSettings,
      scale: Object.fromEntries(
        SCALE_STEPS.map((step) => {
          const s = family.shades[step];
          return [
            String(step),
            {
              hex: s.hex,
              oklch: { l: round(s.oklch.l, 4), c: round(s.oklch.c, 4), h: s.oklch.h === null ? null : round(s.oklch.h, 2) },
              css: formatOklch(s.oklch),
              locked: s.locked,
              gamutMapped: !!s.gamutMapped,
            },
          ];
        }),
      ),
    })),
    primitives: derivePrimitives(project.colourFamilies).map((t) => ({
      name: t.name,
      type: 'primitive' as const,
      family: t.family,
      step: t.step,
      value: t.hex,
    })),
    // Semantic tokens and themes are added by Token Manager and Theme Studio.
    semantics: [] as unknown[],
    themes: [] as unknown[],
  };
}

export function exportJson(project: Project, _settings: ExportSettings): ExportResult {
  return {
    filename: 'palette-ai.tokens.json',
    mime: 'application/json',
    content: JSON.stringify(buildJsonExport(project), null, 2) + '\n',
  };
}
