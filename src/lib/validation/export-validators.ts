import { parse } from 'culori';
import { SCALE_STEPS, type ExportFormat } from '@/types';

/**
 * Export validation gate (PRD §22): every file is checked before it can be downloaded.
 * These validators re-read the generated text independently of the exporters.
 */

export interface ValidationReport {
  valid: boolean;
  errors: string[];
  /** Number of colour declarations / primitives that were checked. */
  checked: number;
}

const DECLARATION = /^--color-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)-(\d{2,3}):\s*(.+);$/;

function validateBlock(content: string, opener: RegExp, label: string): ValidationReport {
  const errors: string[] = [];
  const stripped = content.replace(/\/\*[\s\S]*?\*\//g, '');
  const opens = (stripped.match(/{/g) ?? []).length;
  const closes = (stripped.match(/}/g) ?? []).length;
  if (opens !== closes) errors.push('Unbalanced braces.');
  const match = stripped.match(opener);
  if (!match) {
    errors.push(`Missing ${label} block.`);
    return { valid: false, errors, checked: 0 };
  }
  const start = (match.index ?? 0) + match[0].length;
  const end = stripped.indexOf('}', start);
  const body = stripped.slice(start, end === -1 ? undefined : end);
  const seen = new Set<string>();
  let checked = 0;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(DECLARATION);
    if (!m) {
      errors.push(`Unexpected line: “${line}”`);
      continue;
    }
    const [, family, step, value] = m;
    const name = `${family}-${step}`;
    if (seen.has(name)) errors.push(`Duplicate variable --color-${name}.`);
    seen.add(name);
    if (!SCALE_STEPS.includes(Number(step) as (typeof SCALE_STEPS)[number])) errors.push(`--color-${name}: ${step} is not a scale step.`);
    if (!parse(value)) errors.push(`--color-${name}: “${value}” is not a valid CSS colour.`);
    checked++;
  }
  if (checked === 0) errors.push('No colour variables found — generate at least one scale first.');
  return { valid: errors.length === 0, errors, checked };
}

export function validateCss(content: string): ValidationReport {
  return validateBlock(content, /:root\s*{/, ':root');
}

export function validateTailwindV4(content: string): ValidationReport {
  const report = validateBlock(content, /@theme\s*{/, '@theme');
  if (/module\.exports|tailwind\.config/.test(content)) {
    report.errors.push('Contains Tailwind v3 config syntax.');
    report.valid = false;
  }
  return report;
}

export function validateJson(content: string): ValidationReport {
  const errors: string[] = [];
  let data: any;
  try {
    data = JSON.parse(content);
  } catch (e) {
    return { valid: false, errors: [`Not valid JSON: ${(e as Error).message}`], checked: 0 };
  }
  if (typeof data?.schemaVersion !== 'number') errors.push('schemaVersion is missing.');
  if (typeof data?.project?.name !== 'string') errors.push('project.name is missing.');
  for (const key of ['families', 'primitives', 'semantics', 'themes']) {
    if (!Array.isArray(data?.[key])) errors.push(`${key} must be an array.`);
  }
  let checked = 0;
  if (Array.isArray(data?.families)) {
    for (const family of data.families) {
      for (const step of SCALE_STEPS) {
        const shade = family?.scale?.[String(step)];
        if (!shade) {
          errors.push(`${family?.name ?? 'family'}: step ${step} is missing.`);
          continue;
        }
        if (!/^#[0-9A-F]{6}$/.test(shade.hex)) errors.push(`${family.name}-${step}: “${shade.hex}” is not a 6-digit HEX.`);
        if (!parse(shade.css ?? '')) errors.push(`${family.name}-${step}: OKLCH value is not valid CSS.`);
        checked++;
      }
    }
    if (Array.isArray(data.primitives) && data.primitives.length !== checked) {
      errors.push('primitives does not match the number of scale steps.');
    }
  }
  if (checked === 0) errors.push('No colour families found — generate at least one scale first.');
  return { valid: errors.length === 0, errors, checked };
}

export function validateExport(format: ExportFormat, content: string): ValidationReport {
  if (format === 'css') return validateCss(content);
  if (format === 'tailwind-v4') return validateTailwindV4(content);
  return validateJson(content);
}
