import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/** Editor panel shown beside the live preview (or in a dialog on small screens). */
export function Inspector({ title, onClose, children }: { title: string; onClose?: () => void; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="mb-4 flex items-center justify-between gap-2 pr-8 xl:pr-0">
        <h2 className="text-[15px] leading-5 font-semibold text-ink">{title}</h2>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close editor" className="flex size-8 items-center justify-center rounded-field text-muted hover:bg-soft hover:text-ink">
            <X className="size-4" strokeWidth={1.5} />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

export function InspectorEmpty({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-muted">{children}</p>;
}

export function InspectorSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-4 first:border-0 first:pt-0 last:pb-0">
      <h3 className="mb-2.5 text-[13px] leading-[18px] font-medium text-label">{label}</h3>
      {children}
    </section>
  );
}
