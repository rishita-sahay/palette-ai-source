import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/** Nestly eyebrow: short dash + small blue label, one line, directly above a headline. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-center gap-2.5 text-[13px] leading-[18px] font-medium text-brand-deep', className)}>
      <span className="h-px w-5 bg-brand-deep" aria-hidden />
      {children}
    </p>
  );
}
