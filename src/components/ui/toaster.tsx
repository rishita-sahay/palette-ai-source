import { Toaster as Sonner, toast } from 'sonner';

/** Toasts (shadcn's sonner wrapper), restyled flat to match Nestly. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: 'flex w-full items-start gap-3 rounded-control border border-line bg-surface px-4 py-3 text-sm text-ink font-sans',
          title: 'font-medium leading-5',
          description: 'text-muted leading-5 mt-0.5',
          icon: 'mt-0.5 text-ink',
        },
      }}
    />
  );
}

export { toast };
