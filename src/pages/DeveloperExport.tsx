import { useMemo, useState } from 'react';
import { ArrowRight, Check, Copy, Download, TriangleAlert } from 'lucide-react';
import type { ExportFormat } from '@/types';
import { EXPORT_FORMATS, generateExport } from '@/lib/exporters';
import { CodePreview } from '@/components/exports/CodePreview';
import { Eyebrow } from '@/components/layout/Eyebrow';
import { Inspector, InspectorSection } from '@/components/layout/Inspector';
import { TwoToneHeadline } from '@/components/layout/TwoToneHeadline';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toaster';
import { useProjectStore } from '@/store/project-store';
import { cn } from '@/utils/cn';
import { copyText, downloadText } from '@/utils/download';

// Module-level so the chosen tab survives navigating away and back.
let rememberedFormat: ExportFormat = 'tailwind-v4';

function useExport() {
  const project = useProjectStore((s) => s.project);
  const [format, setFormatState] = useState<ExportFormat>(rememberedFormat);
  const setFormat = (f: ExportFormat) => { rememberedFormat = f; setFormatState(f); };
  const output = useMemo(() => generateExport(format, project, project.exportSettings), [format, project]);
  return { project, format, setFormat, output };
}

export function DeveloperExport() {
  const { project, format, setFormat, output } = useExport();
  const setExportSettings = useProjectStore((s) => s.setExportSettings);
  const setModule = useProjectStore((s) => s.setModule);
  const families = project.colourFamilies;

  if (families.length === 0) {
    return (
      <div className="flex min-h-full flex-col justify-center p-8 lg:p-12">
        <Eyebrow>Developer Export</Eyebrow>
        <TwoToneHeadline as="h1" size="section" className="mt-4 max-w-xl" lead="Nothing to export yet." rest="Create a scale and the code appears here." />
        <p className="mt-4 max-w-lg text-sm leading-6 text-muted">Exports are built from your colour scales: CSS variables, a Tailwind v4 @theme block, or structured JSON.</p>
        <div className="mt-7"><Button variant="primary" size="lg" onClick={() => setModule(project.palettes.length ? 'scales' : 'palette')}>{project.palettes.length ? 'Go to Colour Scales' : 'Start in Palette Studio'} <ArrowRight strokeWidth={1.5} /></Button></div>
      </div>
    );
  }

  const { report } = output;
  const colourFormat = project.exportSettings.colourFormat;

  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.01em] text-ink">Developer export</h1>
      <p className="mt-1 text-sm leading-6 text-muted">Primitive tokens for every scale. The download is byte-for-byte what you see in the preview.</p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
          <TabsList aria-label="Export format">
            {EXPORT_FORMATS.map((f) => <TabsTrigger key={f.id} value={f.id} title={f.hint}>{f.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        {format !== 'json' && (
          <div className="inline-flex gap-1 rounded-control bg-soft p-1" role="group" aria-label="Colour value format">
            {(['hex', 'oklch'] as const).map((f) => (
              <button key={f} type="button" aria-pressed={colourFormat === f} onClick={() => setExportSettings({ colourFormat: f })} className={cn('rounded-field px-3 py-1.5 text-[13px] leading-[18px] font-medium', colourFormat === f ? 'bg-surface text-ink shadow-[inset_0_0_0_1px_var(--color-line)]' : 'text-muted hover:text-ink')}>
                {f === 'hex' ? 'HEX' : 'OKLCH'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {report.valid ? (
          <p className="flex items-center gap-2 text-[13px] leading-[18px] text-ink" role="status">
            <Check className="size-4 text-success" strokeWidth={1.75} aria-hidden />
            Validated — {report.checked} colour values checked. <span className="font-mono text-muted">{output.filename}</span>
          </p>
        ) : (
          <p className="flex items-center gap-2 text-[13px] leading-[18px] font-medium text-danger" role="alert">
            <TriangleAlert className="size-4" strokeWidth={1.75} aria-hidden /> This output didn’t pass validation, so download is switched off.
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" disabled={!report.valid} onClick={async () => { toast((await copyText(output.content)) ? 'Copied to clipboard' : 'Copy was blocked by the browser', { description: output.filename }); }}>
            <Copy strokeWidth={1.5} /> Copy
          </Button>
          <Button variant="primary" disabled={!report.valid} onClick={() => { downloadText(output.filename, output.content, output.mime); toast(`Downloaded ${output.filename}`); }}>
            <Download strokeWidth={1.5} /> Download
          </Button>
        </div>
      </div>

      {!report.valid && (
        <ul className="mt-3 list-disc space-y-1 rounded-control bg-danger-bg py-3 pr-4 pl-8 text-[13px] leading-[18px] text-danger">
          {report.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <div className="mt-4"><CodePreview code={output.content} label={`${output.filename} preview`} /></div>
    </div>
  );
}

export function ExportInspector() {
  const families = useProjectStore((s) => s.project.colourFamilies);
  return (
    <Inspector title="What’s in this export">
      <InspectorSection label={`Families (${families.length})`}>
        {families.length === 0 ? <p className="text-sm leading-6 text-muted">None yet.</p> : (
          <ul className="space-y-1.5">
            {families.map((f) => (
              <li key={f.id} className="flex items-center gap-2.5 text-[13px] leading-[18px]">
                <span className="swatch-edge size-5 shrink-0 rounded-[6px]" style={{ background: f.shades[f.anchorStep].hex }} aria-hidden />
                <span className="font-medium text-ink">{f.familyName}</span>
                <span className="ml-auto text-muted tabular-nums">11 tokens</span>
              </li>
            ))}
          </ul>
        )}
      </InspectorSection>
      <InspectorSection label="Naming">
        <p className="font-mono text-[13px] leading-[22px] text-ink">--color-{'{family}'}-{'{step}'}</p>
        <p className="mt-1 text-[13px] leading-[18px] text-muted">In Tailwind v4 each variable becomes utilities such as <span className="font-mono text-ink">bg-primary-500</span>.</p>
      </InspectorSection>
      <InspectorSection label="Not included yet">
        <p className="text-[13px] leading-[18px] text-muted">Semantic tokens and the light / dark theme blocks are added once Token Manager and Theme Studio are built. The JSON already has empty <span className="font-mono text-ink">semantics</span> and <span className="font-mono text-ink">themes</span> arrays reserved for them.</p>
      </InspectorSection>
    </Inspector>
  );
}
