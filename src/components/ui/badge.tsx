import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold leading-none whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-brand/10 text-brand",
        success: "bg-green-500/15 text-green-700 dark:text-green-400",
        warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        error: "bg-error/10 text-error",
        info: "bg-blue-500/12 text-blue-700 dark:text-blue-400",
        purple: "bg-purple-500/12 text-purple-700 dark:text-purple-400",
        muted: "bg-black/[0.04] dark:bg-white/[0.06] text-muted",
        vip: "bg-gradient-to-r from-brand to-brand-light text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant, className }))} {...props} />
  );
}

export { Badge, badgeVariants };
