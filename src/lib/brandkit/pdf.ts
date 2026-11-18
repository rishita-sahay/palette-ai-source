import { PAGE, type SheetOp } from './sheet';

/**
 * A minimal one-page PDF writer for the brand sheet: filled (optionally rounded) rectangles and text
 * in the three standard fonts. Text is real text, so HEX values can be selected and copied in a reader.
 * Output is plain ASCII, so byte offsets equal string offsets.
 */

// Characters outside Latin-1 that WinAnsi can still show, mapped to their WinAnsi byte.
const WIN_ANSI: Record<string, number> = { '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97 };

export function pdfString(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = WIN_ANSI[ch] ?? ch.codePointAt(0)!;
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`;
    else if (code >= 0x20 && code <= 0x7e) out += ch;
    else if (WIN_ANSI[ch] !== undefined || (code >= 0xa0 && code <= 0xff)) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += '?';
  }
  return out;
}

const n = (v: number) => Number(v.toFixed(2)).toString();
const rgb = (hex: string) => [1, 3, 5].map((i) => n(parseInt(hex.slice(i, i + 2), 16) / 255)).join(' ');

function rectPath(x: number, y: number, w: number, h: number, r: number): string {
  if (r <= 0) return `${n(x)} ${n(y)} ${n(w)} ${n(h)} re`;
  const k = r * 0.5523;
  const [x1, y1] = [x + w, y + h];
  return [
    `${n(x + r)} ${n(y)} m`,
    `${n(x1 - r)} ${n(y)} l`, `${n(x1 - r + k)} ${n(y)} ${n(x1)} ${n(y + r - k)} ${n(x1)} ${n(y + r)} c`,
    `${n(x1)} ${n(y1 - r)} l`, `${n(x1)} ${n(y1 - r + k)} ${n(x1 - r + k)} ${n(y1)} ${n(x1 - r)} ${n(y1)} c`,
    `${n(x + r)} ${n(y1)} l`, `${n(x + r - k)} ${n(y1)} ${n(x)} ${n(y1 - r + k)} ${n(x)} ${n(y1 - r)} c`,
    `${n(x)} ${n(y + r)} l`, `${n(x)} ${n(y + r - k)} ${n(x + r - k)} ${n(y)} ${n(x + r)} ${n(y)} c`, 'h',
  ].join(' ');
}

export function renderSheetPdf(ops: SheetOp[], title = 'Colour system'): string {
  const content: string[] = [];
  for (const op of ops) {
    if (op.kind === 'rect') {
      // PDF's origin is bottom-left; the sheet's is top-left.
      const path = rectPath(op.x, PAGE.h - op.y - op.h, op.w, op.h, Math.min(op.r ?? 0, op.w / 2, op.h / 2));
      content.push(op.stroke ? `${rgb(op.fill)} rg ${rgb(op.stroke)} RG 0.5 w ${path} B` : `${rgb(op.fill)} rg ${path} f`);
    } else {
      const font = op.mono ? 'F3' : op.bold ? 'F2' : 'F1';
      content.push(`BT /${font} ${n(op.size)} Tf ${rgb(op.fill)} rg ${n(op.x)} ${n(PAGE.h - op.y)} Td (${pdfString(op.text)}) Tj ET`);
    }
  }
  const stream = content.join('\n');
  const font = (name: string) => `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    font('Helvetica'),
    font('Helvetica-Bold'),
    font('Courier'),
    `<< /Title (${pdfString(title)}) /Producer (Palette AI) >>`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const at = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}
