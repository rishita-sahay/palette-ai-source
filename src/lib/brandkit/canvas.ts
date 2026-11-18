import { PAGE, type SheetOp } from './sheet';

const SANS = "'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

/** Draws the sheet on a canvas at `scale` pixels per point (3 ≈ 216 dpi on A4). Browser only. */
export async function renderSheetCanvas(ops: SheetOp[], scale = 3): Promise<HTMLCanvasElement> {
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(PAGE.w * scale);
  canvas.height = Math.round(PAGE.h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';
  for (const op of ops) {
    if (op.kind === 'rect') {
      ctx.beginPath();
      if (op.r && typeof ctx.roundRect === 'function') ctx.roundRect(op.x, op.y, op.w, op.h, Math.min(op.r, op.w / 2, op.h / 2));
      else ctx.rect(op.x, op.y, op.w, op.h);
      ctx.fillStyle = op.fill;
      ctx.fill();
      if (op.stroke) {
        ctx.strokeStyle = op.stroke;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    } else {
      ctx.font = `${op.bold ? 600 : 400} ${op.size}px ${op.mono ? MONO : SANS}`;
      ctx.fillStyle = op.fill;
      ctx.fillText(op.text, op.x, op.y);
    }
  }
  return canvas;
}

export const canvasToPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The browser could not create the image.'))), 'image/png'));
