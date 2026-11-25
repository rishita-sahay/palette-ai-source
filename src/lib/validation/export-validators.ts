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
  /** Number of role-token declarations that were checked (0 when exporting scales only). */
  roles?: number;
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

const ROLE_DECLARATION = /^\s*--color-([a-z][a-z-]*[a-z]):\s*(.+);$/;

/**
 * Role tokens sit in their own blocks after the primitives. Each one must either point at a
 * primitive that this file defines or be a valid CSS colour, and light and dark must define the same roles.
 */
function validateRoles(content: string, report: ValidationReport): ValidationReport {
  const stripped = content.replace(/\/\*[\s\S]*?\*\//g, '');
  const primitives = new Set([...stripped.matchAll(/--color-([a-z][a-z0-9]*(?:-[a-z0-9]+)*-\d{2,3}):/g)].map((m) => m[1]));
  const counts = new Map<string, number>();
  let roles = 0;
  for (const line of stripped.split('\n')) {
    const m = line.match(ROLE_DECLARATION);
    if (!m) continue;
    const [, name, value] = m;
    roles++;
    counts.set(name, (counts.get(name) ?? 0) + 1);
    const ref = value.match(/^var\(--color-(.+)\)$/);
    if (ref ? !primitives.has(ref[1]) : !parse(value)) report.errors.push(`--color-${name}: “${value}” is not a colour or a primitive in this file.`);
  }
  for (const [name, n] of counts) if (n !== 2) report.errors.push(`--color-${name} should be defined once for light and once for dark.`);
  return { ...report, roles, valid: report.errors.length === 0 };
}

export function validateCss(content: string): ValidationReport {
  return validateRoles(content, validateBlock(content, /:root\s*{/, ':root'));
}

export function validateTailwindV4(content: string): ValidationReport {
  const report = validateRoles(content, validateBlock(content, /@theme\s*{/, '@theme'));
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
  let roles = 0;
  if (Array.isArray(data?.semantics)) {
    const names = new Set((data.primitives ?? []).map((p: any) => p?.name));
    for (const role of data.semantics) {
      roles++;
      for (const mode of ['light', 'dark']) {
        const v = role?.[mode];
        if (!v || !/^#[0-9A-F]{6}$/.test(v.value ?? '')) errors.push(`${role?.name ?? 'role'} (${mode}): value is not a 6-digit HEX.`);
        else if (v.reference !== null && !names.has(v.reference)) errors.push(`${role.name} (${mode}): “${v.reference}” is not a primitive in this file.`);
      }
    }
  }
  return { valid: errors.length === 0, errors, checked, roles };
}

export function validateExport(format: ExportFormat, content: string): ValidationReport {
  if (format === 'css') return validateCss(content);
  if (format === 'tailwind-v4') return validateTailwindV4(content);
  return validateJson(content);
}
