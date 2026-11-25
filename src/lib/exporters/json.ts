import { SCALE_STEPS, SCHEMA_VERSION, type ExportSettings, type Project } from '@/types';
import { formatOklch } from '@/lib/colour-engine/convert';
import { resolveRoles } from '@/lib/tokens/roles';
import { derivePrimitives, type ExportResult } from './primitives';

const round = (n: number, dp: number) => Number(n.toFixed(dp));

/** Structured JSON (EX-004). Shape follows PRD §24: schemaVersion, project, families, primitives, semantics, themes. */
export function buildJsonExport(project: Project, settings?: ExportSettings) {
  const roles = settings && settings.scope !== 'primitive' ? resolveRoles(project) : null;
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
    // Role tokens: one entry per role with its light and dark value. Empty when exporting scales only.
    semantics: (roles?.light ?? []).map((role, i) => ({
      name: role.name,
      type: 'semantic' as const,
      description: role.description,
      light: { reference: role.ref, value: role.hex },
      dark: { reference: roles!.dark[i].ref, value: roles!.dark[i].hex },
    })),
    themes: roles
      ? (['light', 'dark'] as const).map((mode) => ({
          name: mode,
          mode,
          mappings: Object.fromEntries(roles[mode].map((role) => [role.name, role.ref ?? role.hex])),
        }))
      : [],
  };
}

export function exportJson(project: Project, settings: ExportSettings): ExportResult {
  return {
    filename: 'palette-ai.tokens.json',
    mime: 'application/json',
    content: JSON.stringify(buildJsonExport(project, settings), null, 2) + '\n',
  };
}
