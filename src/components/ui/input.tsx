import * as React from 'react';
import { cn } from '@/utils/cn';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'h-10 w-full min-w-0 rounded-field border border-line bg-surface px-3 text-sm text-ink placeholder:text-faint',
        'focus-visible:border-brand focus-visible:outline-1 focus-visible:outline-offset-0 aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full resize-none rounded-field border border-line bg-surface px-3 py-2.5 text-sm leading-6 text-ink placeholder:text-faint',
        'focus-visible:border-brand focus-visible:outline-1 focus-visible:outline-offset-0',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export function FieldLabel({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-[13px] leading-[18px] font-medium text-label', className)} {...props} />;
}
