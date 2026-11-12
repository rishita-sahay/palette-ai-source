import type { HTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

const tones = {
  neutral: 'bg-soft text-ink',
  success: 'bg-success-bg text-success',
  danger: 'bg-danger-bg text-danger',
  caution: 'bg-caution-bg text-caution',
} as const;

/** Status pill. Always pair with text or an icon — never colour alone. */
export function Badge({ tone = 'neutral', dot, className, children, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] leading-[18px] font-medium whitespace-nowrap', tones[tone], className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
