import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full rounded-[12px] border border-black/8 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] px-3 py-2 text-sm text-dark placeholder:text-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:border-brand/40 disabled:cursor-not-allowed disabled:opacity-50 backdrop-blur-md transition-all",
        className
      )}
      {...props}
    />
  );
}

export { Input };
