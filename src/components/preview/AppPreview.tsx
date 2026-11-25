import { useMemo } from 'react';
import { Bell, Menu, Search } from 'lucide-react';
import { formatRatio } from '@/lib/contrast';
import { contrastPairs, resolveRoles, type RoleToken, type ThemeMode } from '@/lib/tokens/roles';
import { Badge } from '@/components/ui/badge';
import { Disclosure } from '@/components/ui/disclosure';
import { Segmented } from '@/components/ui/segmented';
import { useProjectStore } from '@/store/project-store';

const MODES = [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }] as const;
const FEEDBACK_SAMPLE: Record<string, string> = { success: 'Saved', warning: 'Check details', error: 'Payment failed', info: 'New tip' };

/** A small app screen painted only with the role tokens of the chosen theme. */
export function MockApp({ roles }: { roles: RoleToken[] }) {
  const c = (name: string) => roles.find((r) => r.name === name)?.hex;
  const feedback = roles.filter((r) => r.name in FEEDBACK_SAMPLE);
  return (
    <div className="overflow-hidden rounded-control border" style={{ background: c('background'), color: c('text'), borderColor: c('border') }} aria-label="Example app screen using this palette" role="img">
      <div className="flex h-12 items-center justify-between px-4" style={{ background: c('primary'), color: c('on-primary') }}>
        <span className="flex items-center gap-3 text-sm font-semibold"><Menu className="size-4" strokeWidth={1.75} aria-hidden /> Brand App</span>
        <span className="flex items-center gap-3"><Search className="size-4" strokeWidth={1.75} aria-hidden /><Bell className="size-4" strokeWidth={1.75} aria-hidden /></span>
      </div>
      <div className="p-4">
        <p className="text-[19px] leading-6 font-semibold">Welcome to Brand App</p>
        <p className="mt-1 text-[13px] leading-5" style={{ color: c('text-muted') }}>This is how your palette looks in a real interface.</p>
        <div className="mt-3.5 flex flex-wrap gap-2">
          <span className="rounded-field px-3.5 py-2 text-[13px] font-medium" style={{ background: c('primary'), color: c('on-primary') }}>Get started</span>
          <span className="rounded-field border px-3.5 py-2 text-[13px] font-medium" style={{ borderColor: c('border'), background: c('surface') }}>Learn more</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {['Feature one', 'Feature two'].map((title, i) => (
            <div key={title} className="rounded-field border p-3" style={{ background: c('surface'), borderColor: c('border') }}>
              <span className="flex size-7 items-center justify-center rounded-full text-[13px] font-semibold" style={{ background: c('accent'), color: c('on-accent') }}>{i + 1}</span>
              <p className="mt-2 text-[13px] leading-[18px] font-semibold">{title}</p>
              <p className="mt-0.5 text-[12px] leading-4" style={{ color: c('text-muted') }}>A short line describing it.</p>
            </div>
          ))}
        </div>

        <div className="mt-2.5 flex items-center gap-2.5 rounded-field px-3 py-2.5 text-[13px] leading-[18px] font-medium" style={{ background: c('primary-soft'), color: c('on-primary-soft') }}>
          <Bell className="size-4 shrink-0" strokeWidth={1.75} aria-hidden /> Three updates since your last visit
        </div>

        {feedback.length > 0 && (
          <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-field border p-3 text-[12px] leading-4 font-medium" style={{ background: c('surface'), borderColor: c('border') }}>
            {feedback.map((role) => (
              <span key={role.name} className="flex items-center gap-1.5" style={{ color: role.hex }}>
                <span className="size-2 rounded-full bg-current" aria-hidden /> {FEEDBACK_SAMPLE[role.name]}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="border-t px-4 py-2.5 text-[12px] leading-4" style={{ borderColor: c('border'), color: c('text-muted') }}>Footer in muted text</div>
    </div>
  );
}

/** Live preview column: the mock app, a light/dark switch, and the AA contrast check for every pair it uses. */
export function AppPreview() {
  const project = useProjectStore((s) => s.project);
  const mode = useProjectStore((s) => s.ui.themeMode);
  const setThemeMode = useProjectStore((s) => s.setThemeMode);
  const roles = useMemo(() => resolveRoles(project), [project]);
  if (!roles) return null;
  const pairs = contrastPairs(roles[mode]);
  const passing = pairs.filter((p) => p.pass).length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[22px] leading-[30px] font-semibold text-ink">Live preview</h2>
        <Segmented value={mode} onChange={(v: ThemeMode) => setThemeMode(v)} options={MODES} label="Preview theme" />
      </div>
      <MockApp roles={roles[mode]} />
      <p className="mt-2.5 text-[12px] leading-4 text-muted">
        {mode === 'light'
          ? 'Painted with the light role tokens, which are in the Code tab.'
          : `Dark values are not copies of the light ones. Each is rebuilt from your palette in OKLCH: same hue, with lightness and chroma re-set for its job on a dark surface. Strategy: ${roles.darkStrategy.basis === 'brief' ? 'from the AI reading of your brief' : 'default'}.`}
      </p>

      <div className="mt-6 flex items-center justify-between gap-3">
        <h3 className="text-[15px] leading-5 font-semibold text-ink">Contrast</h3>
        <Badge tone={passing === pairs.length ? 'success' : 'caution'}>{passing} of {pairs.length} pass AA</Badge>
      </div>
      <ul className="mt-3 space-y-2 text-[13px] leading-[18px]">
        {pairs.map((pair) => (
          <li key={pair.label} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2.5 text-ink">
              <span className="swatch-edge flex size-7 shrink-0 items-center justify-center rounded-[6px] text-[11px] font-semibold" style={{ background: pair.bg.hex, color: pair.fg.hex }} aria-hidden>Aa</span>
              <span className="truncate">{pair.label}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="font-mono text-ink tabular-nums">{formatRatio(pair.ratio)}</span>
              <Badge tone={pair.pass ? 'success' : 'danger'} className="w-[60px] justify-center">{pair.pass ? 'Pass' : 'Fail'}</Badge>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] leading-4 text-muted">WCAG 2.2 AA for normal text is 4.5:1. Ratios are for the {mode} theme.</p>

      <Disclosure className="mt-5 border-t border-line pt-4" label="Compare light and dark values" openLabel="Light and dark values" defaultOpen>
        <table className="w-full text-left text-[12px] leading-4">
          <thead>
            <tr className="text-label"><th className="pb-1.5 font-medium">Role</th><th className="pb-1.5 font-medium">Light</th><th className="pb-1.5 font-medium">Dark</th></tr>
          </thead>
          <tbody>
            {roles.light.map((role, i) => (
              <tr key={role.name} className="border-t border-line">
                <th scope="row" className="py-1.5 pr-2 font-normal text-ink" title={role.description}>{role.name}</th>
                {[role, roles.dark[i]].map((r, n) => (
                  <td key={n} className="py-1.5 pr-2">
                    <span className="flex items-center gap-1.5 font-mono text-muted">
                      <span className="swatch-edge size-4 shrink-0 rounded-[4px]" style={{ background: r.hex }} aria-hidden />{r.hex}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Disclosure>
    </div>
  );
}
