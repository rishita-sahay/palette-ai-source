import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/** The Nestly signature: lead clause in near-black, continuation in mid-gray. */
export function TwoToneHeadline({ lead, rest, size = 'display', as: Tag = 'h1', className }: {
  lead: ReactNode;
  rest: ReactNode;
  size?: 'display' | 'section';
  as?: 'h1' | 'h2';
  className?: string;
}) {
  return (
    <Tag
      className={cn(
        'font-bold text-balance text-ink',
        size === 'display' ? 'text-[40px] leading-[1.02] tracking-[-0.02em] sm:text-[56px] 2xl:text-display' : 'text-[32px] leading-10 font-semibold tracking-[-0.01em]',
        className,
      )}
    >
      {lead} <span className="text-muted">{rest}</span>
    </Tag>
  );
}
