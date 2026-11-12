import type { ReactNode } from 'react';

/** Right contextual panel. Each module supplies its own content. */
export function Inspector({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside aria-label={title} className="scroll-quiet w-full shrink-0 overflow-y-auto border-t border-line p-5 xl:w-[328px] xl:border-t-0 xl:border-l">
      <h2 className="mb-4 text-[13px] leading-[18px] font-medium text-label">{title}</h2>
      {children}
    </aside>
  );
}

export function InspectorEmpty({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-muted">{children}</p>;
}

export function InspectorSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-4 first:border-0 first:pt-0">
      <h3 className="mb-2.5 text-[13px] leading-[18px] font-medium text-label">{label}</h3>
      {children}
    </section>
  );
}
