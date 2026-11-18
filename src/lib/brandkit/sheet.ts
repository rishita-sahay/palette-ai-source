import { SCALE_STEPS, type Project } from '@/types';
import { formatHsl, formatRgb } from '@/lib/colour-engine/convert';
import { readableOn } from '@/lib/contrast';
import { groupFamilies, resolveRoles } from '@/lib/tokens/roles';

/**
 * The brand sheet as a flat list of drawing operations on one A4 page (points, origin top-left).
 * The page preview (SVG), the PNG (canvas) and the PDF are all drawn from this same list, so the
 * download is what the preview shows.
 */

export const PAGE = { w: 595, h: 842, margin: 44 } as const;

export type SheetOp =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: string; stroke?: string; r?: number }
  | { kind: 'text'; x: number; y: number; text: string; size: number; bold?: boolean; mono?: boolean; fill: string };

const INK = '#0A0A0A';
const MUTED = '#6B6B6B';
const LINE = '#E0E0E0';
const WHITE = '#FFFFFF';

/** Rough advance width per character, in em. Only used to wrap and truncate, so it errs on the wide side. */
const em = (bold?: boolean, mono?: boolean) => (mono ? 0.6 : bold ? 0.6 : 0.54);
const fit = (text: string, width: number, size: number, bold?: boolean, mono?: boolean) => {
  const max = Math.max(1, Math.floor(width / (size * em(bold, mono))));
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
};
function wrap(text: string, width: number, size: number, maxLines: number, bold?: boolean): string[] {
  const max = Math.max(4, Math.floor(width / (size * em(bold))));
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= max) line = next;
    else {
      if (line) lines.push(line);
      line = word.length > max ? `${word.slice(0, max - 1)}…` : word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, max - 1).trimEnd()}…`;
    return kept;
  }
  return lines;
}

const light = (hex: string) => readableOn(hex) === INK;

export function buildSheet(project: Project, date = new Date()): SheetOp[] {
  const ops: SheetOp[] = [];
  const { w: W, h: H, margin: M } = PAGE;
  const CW = W - M * 2;
  const rect = (x: number, y: number, w: number, h: number, fill: string, r = 0) =>
    ops.push({ kind: 'rect', x, y, w, h, fill, r, ...(light(fill) && contrastless(fill) ? { stroke: LINE } : {}) });
  const text = (x: number, y: number, value: string, size: number, opts: { bold?: boolean; mono?: boolean; fill?: string } = {}) =>
    ops.push({ kind: 'text', x, y, text: value, size, bold: opts.bold, mono: opts.mono, fill: opts.fill ?? INK });
  const heading = (y: number, value: string) => text(M, y, value, 10, { bold: true });

  ops.push({ kind: 'rect', x: 0, y: 0, w: W, h: H, fill: WHITE });

  const palette = project.palettes[0];
  const colours = palette?.colours ?? [];
  const { brand, feedback } = groupFamilies(project);
  const families = [...brand, ...feedback];

  // ---- header ----
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  text(M, 56, `COLOUR SYSTEM  ·  ${day}`, 8, { bold: true, fill: MUTED });
  let y = 86;
  for (const line of wrap(project.name, CW, 24, 2, true)) {
    text(M, y, line, 24, { bold: true });
    y += 28;
  }
  y -= 12;
  if (palette?.source.kind === 'prompt') {
    const brief = palette.source.brief?.originalPrompt ?? palette.source.input;
    for (const line of wrap(`Brief: “${brief}”`, CW, 9, 2)) {
      text(M, y, line, 9, { fill: MUTED });
      y += 12;
    }
  } else if (palette) {
    text(M, y, `Built from ${palette.source.input}`, 9, { fill: MUTED });
    y += 12;
  }

  // ---- palette ----
  y += 16;
  heading(y, 'Palette');
  y += 10;
  if (colours.length) {
    const cols = colours.length <= 5 ? colours.length : Math.ceil(colours.length / 2);
    const rows = Math.ceil(colours.length / cols);
    const gap = 8;
    const cw = (CW - gap * (cols - 1)) / cols;
    const sh = rows === 1 ? 72 : 44;
    colours.forEach((c, i) => {
      const x = M + (i % cols) * (cw + gap);
      const top = y + Math.floor(i / cols) * (sh + 50);
      rect(x, top, cw, sh, c.hex, 6);
      text(x, top + sh + 13, fit(c.name ?? 'colour', cw, 9, true), 9, { bold: true });
      text(x, top + sh + 24, c.hex, 8, { mono: true });
      text(x, top + sh + 33, fit(formatRgb(c.rgb), cw, 7, false, true), 7, { mono: true, fill: MUTED });
      text(x, top + sh + 42, fit(formatHsl(c.hsl), cw, 7, false, true), 7, { mono: true, fill: MUTED });
    });
    y += rows * (sh + 50);
  }

  // ---- scales ----
  const roles = resolveRoles(project);
  const rolesBlock = roles ? 118 : 0;
  const footerTop = H - M - 6;
  y += 20;
  heading(y, 'Scales');
  y += 14;
  const labelW = 80;
  const stepGap = 3;
  const sw = (CW - labelW - stepGap * 10) / 11;
  SCALE_STEPS.forEach((step, i) => text(M + labelW + i * (sw + stepGap), y, String(step), 6.5, { fill: MUTED }));
  y += 5;
  const room = footerTop - rolesBlock - y;
  const rowH = Math.max(16, Math.min(30, Math.floor(room / Math.max(1, families.length))));
  const shown = families.slice(0, Math.max(1, Math.floor(room / rowH)));
  for (const family of shown) {
    text(M, y + rowH / 2 + 1, fit(family.familyName, labelW - 6, 8.5, true), 8.5, { bold: true });
    SCALE_STEPS.forEach((step, i) => {
      const hex = family.shades[step].hex;
      const x = M + labelW + i * (sw + stepGap);
      rect(x, y, sw, rowH - 4, hex, 3);
      text(x + 3, y + (rowH - 4) / 2 + 2, hex.slice(1), 5.5, { mono: true, fill: readableOn(hex) });
    });
    y += rowH;
  }
  if (shown.length < families.length) {
    text(M, y + 8, `+ ${families.length - shown.length} more ${families.length - shown.length === 1 ? 'family' : 'families'} in the code export`, 7.5, { fill: MUTED });
    y += 12;
  }

  // ---- role tokens ----
  if (roles) {
    y += 20;
    heading(y, 'Role tokens');
    y += 13;
    const names = ['background', 'surface', 'text', 'text-muted', 'border', 'primary', 'on-primary', 'primary-soft', 'accent', 'on-accent'];
    const cw = (CW - labelW - stepGap * (names.length - 1)) / names.length;
    names.forEach((name, i) => text(M + labelW + i * (cw + stepGap), y, fit(name, cw, 6, false), 6, { fill: MUTED }));
    y += 5;
    for (const mode of ['light', 'dark'] as const) {
      text(M, y + 13, mode === 'light' ? 'Light theme' : 'Dark theme', 8.5, { bold: true });
      names.forEach((name, i) => {
        const role = roles[mode].find((r) => r.name === name);
        if (!role) return;
        const x = M + labelW + i * (cw + stepGap);
        ops.push({ kind: 'rect', x, y, w: cw, h: 20, fill: role.hex, r: 3, stroke: LINE });
        text(x, y + 27, fit(role.ref ?? role.hex, cw, 5.5, false, true), 5.5, { mono: true, fill: MUTED });
      });
      y += 36;
    }
  }

  // ---- footer ----
  ops.push({ kind: 'rect', x: M, y: footerTop - 8, w: CW, h: 0.5, fill: LINE });
  text(M, footerTop + 4, 'Made with Palette AI. Scales are generated in OKLCH; values shown are sRGB.', 7, { fill: MUTED });
  return ops;
}

/** Near-white swatches get a hairline so they stay visible on the white page. */
function contrastless(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) > 235 && ((n >> 8) & 255) > 235 && (n & 255) > 235;
}
