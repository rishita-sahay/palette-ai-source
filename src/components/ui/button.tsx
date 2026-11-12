import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-colors disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // The only blue fill in the system. Use once per view.
        primary: 'bg-brand text-white hover:bg-brand-deep',
        secondary: 'border border-line bg-surface text-ink hover:bg-soft',
        ghost: 'text-ink hover:bg-soft',
        quiet: 'text-muted hover:bg-soft hover:text-ink',
      },
      size: {
        lg: 'px-6 py-3.5 text-[15px] leading-5',
        md: 'h-10 px-4 text-sm',
        sm: 'h-8 px-3 text-[13px]',
        icon: 'size-9',
        'icon-sm': 'size-7 rounded-field',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} type={asChild ? undefined : (type ?? 'button')} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = 'Button';
