import * as React from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { cn } from '@/utils/cn';

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof Menu.Content>,
  React.ComponentPropsWithoutRef<typeof Menu.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <Menu.Portal>
    <Menu.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn('z-50 min-w-44 rounded-control border border-line bg-surface p-1 text-sm text-ink', className)}
      {...props}
    />
  </Menu.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

const itemClass =
  'flex cursor-default items-center gap-2 rounded-field px-2.5 py-2 outline-none select-none data-[highlighted]:bg-soft data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:text-muted';

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof Menu.Item>,
  React.ComponentPropsWithoutRef<typeof Menu.Item>
>(({ className, ...props }, ref) => <Menu.Item ref={ref} className={cn(itemClass, className)} {...props} />);
DropdownMenuItem.displayName = 'DropdownMenuItem';

export const DropdownMenuRadioGroup = Menu.RadioGroup;

export const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof Menu.RadioItem>,
  React.ComponentPropsWithoutRef<typeof Menu.RadioItem>
>(({ className, children, ...props }, ref) => (
  <Menu.RadioItem ref={ref} className={cn(itemClass, 'justify-between', className)} {...props}>
    <span>{children}</span>
    <Menu.ItemIndicator>
      <Check strokeWidth={1.5} className="!text-ink" />
    </Menu.ItemIndicator>
  </Menu.RadioItem>
));
DropdownMenuRadioItem.displayName = 'DropdownMenuRadioItem';

export function DropdownMenuSeparator() {
  return <Menu.Separator className="my-1 h-px bg-line" />;
}
export function DropdownMenuLabel({ className, ...props }: React.ComponentPropsWithoutRef<typeof Menu.Label>) {
  return <Menu.Label className={cn('px-2.5 pt-2 pb-1 text-[12px] font-medium text-label', className)} {...props} />;
}
