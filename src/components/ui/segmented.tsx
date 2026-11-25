import { cn } from '@/utils/cn';

/** A small set of mutually exclusive choices. Each option is a toggle button, so it reads correctly to assistive tech. */
export function Segmented<T extends string>({ value, onChange, options, label, size = 'md', className }: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex rounded-control bg-soft', size === 'sm' ? 'gap-0.5 p-0.5' : 'gap-1 p-1', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-field font-medium',
            size === 'sm' ? 'px-2 py-1 text-[12px] leading-4' : 'px-3 py-1.5 text-[13px] leading-[18px]',
            value === option.value ? 'bg-surface text-ink shadow-[inset_0_0_0_1px_var(--color-line)]' : 'text-muted hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
