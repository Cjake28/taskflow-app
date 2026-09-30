import { CircleCheck, Info, LoaderCircle, OctagonX, TriangleAlert } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

import { useTheme } from '@/hooks/use-theme';

/** Sonner toasts styled with the design tokens: solid icon circle, bold title, muted description. */
function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme}
      position="top-right"
      offset={20}
      mobileOffset={16}
      icons={{
        success: <CircleCheck className="size-4" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4" />,
        error: <OctagonX className="size-4" />,
        loading: <LoaderCircle className="size-4 animate-spin" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-full items-center gap-3 rounded-2xl bg-card px-[15px] py-[13px] font-sans text-[13.5px] text-foreground shadow-pop',
          icon: 'grid size-[30px] shrink-0 place-items-center rounded-full bg-primary text-white',
          content: 'flex min-w-0 flex-col gap-0.5',
          title: 'font-bold',
          description: 'text-[12.5px] text-muted-foreground',
          success: '[&_[data-icon]]:bg-status-done',
          error: '[&_[data-icon]]:bg-danger',
          warning: '[&_[data-icon]]:bg-status-progress [&_[data-icon]]:text-on-progress',
          info: '[&_[data-icon]]:bg-primary',
          actionButton:
            'ml-auto shrink-0 cursor-pointer rounded-full px-2.5 py-1 text-[13px] font-bold text-primary hover:bg-fill',
          cancelButton:
            'shrink-0 cursor-pointer rounded-full px-2.5 py-1 text-[13px] font-bold text-muted-foreground hover:bg-fill',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
