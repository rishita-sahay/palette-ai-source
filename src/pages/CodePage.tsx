import { useMemo, useState } from 'react';
import { Check, Copy, Download, TriangleAlert } from 'lucide-react';
import type { ExportFormat, ExportSettings } from '@/types';
import { EXPORT_FORMATS, generateExport } from '@/lib/exporters';
import { resolveRoles } from '@/lib/tokens/roles';
import { CodePreview } from '@/components/exports/CodePreview';
import { EmptyTab } from '@/components/layout/EmptyTab';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toaster';
import { useProjectStore } from '@/store/project-store';
import { copyText, saveFile } from '@/utils/download';

// Module-level so the chosen format survives switching tabs.
let rememberedFormat: ExportFormat = 'tailwind-v4';

const SCOPES = [{ value: 'complete', label: 'Scales + role tokens' }, { value: 'primitive', label: 'Scales only' }] as const;
const VALUE_FORMATS = [{ value: 'hex', label: 'HEX' }, { value: 'oklch', label: 'OKLCH' }] as const;

export function CodePage() {
  const project = useProjectStore((s) => s.project);
  const setExportSettings = useProjectStore((s) => s.setExportSettings);
  const [format, setFormatState] = useState<ExportFormat>(rememberedFormat);
  const setFormat = (f: ExportFormat) => { rememberedFormat = f; setFormatState(f); };
  const output = useMemo(() => generateExport(format, project, project.exportSettings), [format, project]);
  const roles = useMemo(() => resolveRoles(project), [project]);
  const families = project.colourFamilies;

  if (families.length === 0) {
    return <EmptyTab eyebrow="Code" lead="Nothing to export yet." rest="Make a palette and the code appears here." body="Exports are built from your colour scales: CSS variables, a Tailwind v4 @theme block, or structured JSON." />;
  }

  const { report } = output;
  const settings = project.exportSettings;
  const withRoles = settings.scope !== 'primitive';

  return (
    <div className="mx-auto max-w-[1200px] p-5 sm:p-6 lg:p-8">
      <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.01em] text-ink">Code</h1>
      <p className="mt-1 text-sm leading-6 text-muted">Every scale as tokens, with role tokens for light and dark. The download is byte-for-byte what you see below.</p>

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Tabs value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
          <TabsList aria-label="Export format">
            {EXPORT_FORMATS.map((f) => <TabsTrigger key={f.id} value={f.id} title={f.hint}>{f.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <Segmented value={withRoles ? 'complete' : 'primitive'} onChange={(scope: ExportSettings['scope']) => setExportSettings({ scope })} options={SCOPES} label="What to include" />
        {format !== 'json' && <Segmented value={settings.colourFormat} onChange={(colourFormat: ExportSettings['colourFormat']) => setExportSettings({ colourFormat })} options={VALUE_FORMATS} label="Colour value format" />}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {report.valid ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-[18px] text-ink" role="status">
            <Check className="size-4 text-success" strokeWidth={1.75} aria-hidden />
            Validated: {report.checked} scale values{report.roles ? ` and ${report.roles} role values` : ''} checked. <span className="font-mono text-muted">{output.filename}</span>
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
          <Button variant="primary" disabled={!report.valid} onClick={async () => {
            const outcome = await saveFile(output.filename, output.content, output.mime);
            if (outcome === 'saved') toast(`Downloaded ${output.filename}`);
            else if (outcome === 'unsupported') toast('This preview can’t save that file type', { description: 'Use Copy instead, or run the app outside the preview.' });
          }}>
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

      <div className="mt-8 grid gap-x-10 gap-y-6 border-t border-line pt-6 md:grid-cols-2">
        <section>
          <h2 className="text-[15px] leading-5 font-semibold text-ink">Scales ({families.length})</h2>
          <p className="mt-1 text-[13px] leading-[18px] text-muted">Named <span className="font-mono text-ink">--color-{'{family}'}-{'{step}'}</span>. In Tailwind v4 each becomes utilities such as <span className="font-mono text-ink">bg-{families[0].familyName}-500</span>.</p>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
            {families.map((f) => (
              <li key={f.id} className="flex items-center gap-2.5 text-[13px] leading-[18px]">
                <span className="swatch-edge size-5 shrink-0 rounded-[6px]" style={{ background: f.shades[f.anchorStep].hex }} aria-hidden />
                <span className="truncate font-medium text-ink">{f.familyName}</span>
                <span className="ml-auto text-muted tabular-nums">11</span>
              </li>
            ))}
          </ul>
        </section>
        {roles && (
          <section>
            <h2 className="text-[15px] leading-5 font-semibold text-ink">Role tokens ({roles.light.length})</h2>
            <p className="mt-1 text-[13px] leading-[18px] text-muted">
              {withRoles ? 'Light roles point at scale steps. Dark roles have their own values, rebuilt from the palette in OKLCH for dark surfaces. Both are checked so text reaches AA contrast.' : 'Not in this export. Switch to “Scales + role tokens” to include them.'}
            </p>
            <table className="mt-3 w-full text-left text-[13px] leading-[18px]">
              <thead>
                <tr className="text-label"><th className="pb-1.5 font-medium">Role</th><th className="pb-1.5 font-medium">Light</th><th className="pb-1.5 font-medium">Dark</th></tr>
              </thead>
              <tbody>
                {roles.light.map((role, i) => (
                  <tr key={role.name} className="border-t border-line">
                    <th scope="row" className="py-1.5 pr-3 font-mono font-normal text-ink" title={role.description}>{role.name}</th>
                    {[role, roles.dark[i]].map((r, n) => (
                      <td key={n} className="py-1.5 pr-3">
                        <span className="flex items-center gap-2 font-mono text-muted">
                          <span className="swatch-edge size-4 shrink-0 rounded-[4px]" style={{ background: r.hex }} aria-hidden />{r.ref ?? r.hex}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}
