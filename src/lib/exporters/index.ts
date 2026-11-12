import type { ExportFormat, ExportSettings, Project } from '@/types';
import { validateExport, type ValidationReport } from '@/lib/validation/export-validators';
import { exportCss } from './css';
import { exportJson } from './json';
import type { ExportResult } from './primitives';
import { exportTailwindV4 } from './tailwind-v4';

export * from './primitives';
export { exportCss, exportJson, exportTailwindV4 };

export const EXPORT_FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: 'css', label: 'CSS variables', hint: 'Custom properties on :root' },
  { id: 'tailwind-v4', label: 'Tailwind v4', hint: 'CSS-first @theme block' },
  { id: 'json', label: 'JSON', hint: 'Structured, versioned schema' },
];

export function generateExport(format: ExportFormat, project: Project, settings: ExportSettings): ExportResult & { report: ValidationReport } {
  const result = format === 'css' ? exportCss(project, settings) : format === 'tailwind-v4' ? exportTailwindV4(project, settings) : exportJson(project, settings);
  return { ...result, report: validateExport(format, result.content) };
}
