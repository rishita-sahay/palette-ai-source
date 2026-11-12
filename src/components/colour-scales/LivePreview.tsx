import { Bell, Search } from 'lucide-react';
import type { ColourScale } from '@/types';
import { classifyContrast, readableOn } from '@/lib/contrast';

/**
 * A small slice of interface painted only with this family's steps (plus the neutral family when
 * one exists), so scale edits can be judged on real components. Updates on every change.
 */
export function LivePreview({ scale, neutral }: { scale: ColourScale; neutral?: ColourScale }) {
  const s = scale.shades;
  const n = (neutral ?? scale).shades;
  // Use the darkest of 500/600/700 needed for white text to reach 4.5:1; fall back to dark text.
  const action = ([500, 600, 700] as const).find((step) => classifyContrast('#FFFFFF', s[step].hex).aa.normalText) ?? 600;
  const actionText = classifyContrast('#FFFFFF', s[action].hex).aa.normalText ? '#FFFFFF' : readableOn(s[action].hex);
  const usesNeutral = neutral && neutral.id !== scale.id;

  return (
    <div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-control border p-4" style={{ background: '#FFFFFF', borderColor: n[200].hex }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: n[900].hex }}>Invoices</p>
            <span className="rounded-full px-2.5 py-0.5 text-[12px] font-medium" style={{ background: s[100].hex, color: s[800].hex }}>12 open</span>
          </div>
          <p className="mt-1 text-[13px] leading-5" style={{ color: n[600].hex }}>Three are due this week. Send reminders in one go.</p>
          <div className="mt-3 flex h-9 items-center gap-2 rounded-field border px-3 text-[13px]" style={{ borderColor: s[500].hex, boxShadow: `0 0 0 3px ${s[100].hex}`, color: n[500].hex }}>
            <Search className="size-4" strokeWidth={1.5} aria-hidden /> Search customers
          </div>
          <div className="mt-3 flex gap-2">
            <span className="rounded-field px-3.5 py-2 text-[13px] font-medium" style={{ background: s[action].hex, color: actionText }}>Send reminders</span>
            <span className="rounded-field border px-3.5 py-2 text-[13px] font-medium" style={{ borderColor: s[300].hex, color: s[700].hex }}>Preview</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex gap-2.5 rounded-control border p-3.5" style={{ background: s[50].hex, borderColor: s[200].hex }}>
            <Bell className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} style={{ color: s[600].hex }} aria-hidden />
            <div>
              <p className="text-[13px] leading-[18px] font-semibold" style={{ color: s[900].hex }}>Payout scheduled</p>
              <p className="text-[13px] leading-[18px]" style={{ color: s[800].hex }}>Funds arrive on Thursday.</p>
            </div>
          </div>
          <div className="flex flex-1 flex-col justify-between rounded-control p-4" style={{ background: s[950].hex }}>
            <p className="text-[13px] leading-[18px]" style={{ color: s[300].hex }}>Collected this month</p>
            <div className="mt-2 flex items-end justify-between">
              <p className="text-2xl font-semibold tracking-tight" style={{ color: s[50].hex }}>£48,210</p>
              <div className="flex items-end gap-1" aria-hidden>
                {([300, 400, 500, 600, 400] as const).map((step, i) => <span key={i} className="w-2.5 rounded-sm" style={{ height: 12 + i * 6, background: s[step].hex }} />)}
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2.5 text-[12px] leading-4 text-muted">
        Painted with {scale.familyName}-50…950{usesNeutral ? ` and ${neutral.familyName} for text and borders` : ''}. Button uses {scale.familyName}-{action}.
      </p>
    </div>
  );
}
