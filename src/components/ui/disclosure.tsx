import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

/** A quiet show/hide row. Content stays in the page for search-in-page only while open. */
export function Disclosure({ label, openLabel, children, className, defaultOpen = false }: { label: string; openLabel?: string; children: ReactNode; className?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={className}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="flex items-center gap-1.5 rounded-field py-1 text-[13px] leading-[18px] font-medium text-ink hover:text-muted">
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} strokeWidth={1.5} aria-hidden />
        {open ? (openLabel ?? label) : label}
      </button>
      {open && <div id={id} className="mt-3">{children}</div>}
    </div>
  );
}
