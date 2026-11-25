import { useMemo, useState } from 'react';
import { FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { canvasToPng, renderSheetCanvas } from '@/lib/brandkit/canvas';
import { renderSheetPdf } from '@/lib/brandkit/pdf';
import { buildSheet, PAGE, type SheetOp } from '@/lib/brandkit/sheet';
import { slugify } from '@/lib/validation/names';
import { EmptyTab } from '@/components/layout/EmptyTab';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster';
import { useProjectStore } from '@/store/project-store';
import { saveFile } from '@/utils/download';

/** The sheet drawn as SVG from the same operations the PNG and PDF use. */
function SheetSvg({ ops, title }: { ops: SheetOp[]; title: string }) {
  return (
    <svg viewBox={`0 0 ${PAGE.w} ${PAGE.h}`} className="block h-auto w-full" role="img" aria-label={`Brand colour sheet for ${title}`}>
      {ops.map((op, i) =>
        op.kind === 'rect' ? (
          <rect key={i} x={op.x} y={op.y} width={op.w} height={op.h} rx={op.r ? Math.min(op.r, op.w / 2, op.h / 2) : 0} fill={op.fill} stroke={op.stroke} strokeWidth={op.stroke ? 0.5 : undefined} />
        ) : (
          <text key={i} x={op.x} y={op.y} fontSize={op.size} fontWeight={op.bold ? 600 : 400} fill={op.fill} style={{ fontFamily: op.mono ? 'var(--font-mono)' : 'var(--font-sans)', whiteSpace: 'pre' }}>{op.text}</text>
        ),
      )}
    </svg>
  );
}

export function BrandkitPage() {
  const project = useProjectStore((s) => s.project);
  const ops = useMemo(() => buildSheet(project), [project]);
  const [busy, setBusy] = useState<'pdf' | 'png' | null>(null);

  if (project.colourFamilies.length === 0) {
    return <EmptyTab eyebrow="Brandkit" lead="No brand sheet yet." rest="It is drawn from your palette." body="Once there is a palette, this tab lays it out on one page — colours, shades and role tokens — ready to download as a PDF or an image." />;
  }

  const base = slugify(project.name) || 'colour-system';
  const save = async (kind: 'pdf' | 'png') => {
    setBusy(kind);
    const filename = `${base}-brandkit.${kind}`;
    try {
      const blob = kind === 'pdf' ? new Blob([renderSheetPdf(ops, project.name)], { type: 'application/pdf' }) : await canvasToPng(await renderSheetCanvas(ops));
      const outcome = await saveFile(filename, blob);
      if (outcome === 'saved') toast(`Downloaded ${filename}`);
      else if (outcome === 'unsupported') toast('The file couldn’t be saved here', { description: 'Try again, or run the app outside the preview.' });
    } catch (e) {
      toast('The file couldn’t be created', { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] p-5 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.01em] text-ink">Brandkit</h1>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted">One page with the palette, every shade and the role tokens, to hand to a client or a teammate. It follows your edits and uses the project name from the top bar.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => save('png')} disabled={busy !== null}>
            {busy === 'png' ? <Loader2 className="animate-spin" strokeWidth={1.5} /> : <ImageIcon strokeWidth={1.5} />} Download PNG
          </Button>
          <Button variant="primary" onClick={() => save('pdf')} disabled={busy !== null}><FileText strokeWidth={1.5} /> Download PDF</Button>
        </div>
      </div>

      <div className="mt-6 rounded-frame bg-soft p-4 sm:p-8">
        <div className="mx-auto max-w-[720px] overflow-hidden rounded-field border border-line bg-white">
          <SheetSvg ops={ops} title={project.name} />
        </div>
      </div>
      <p className="mt-3 text-[12px] leading-4 text-muted">A4 portrait. In the PDF the text is real text, so HEX values can be selected and copied. The PDF uses Helvetica and Courier in place of the app’s fonts.</p>
    </div>
  );
}
