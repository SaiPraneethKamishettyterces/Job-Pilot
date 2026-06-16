import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-4 transition-colors",
  {
    variants: {
      variant: {
        // Default reads as a brand/info pill (was solid primary).
        default: "border-brand-blue/30 bg-brand-blue/15 text-brand-blue-soft",
        info: "border-brand-blue/30 bg-brand-blue/15 text-brand-blue-soft",
        secondary: "border-border bg-foreground/[0.06] text-muted-foreground",
        success: "border-green-500/30 bg-green-500/12 text-green-300 light:text-green-700",
        warning: "border-amber-500/30 bg-amber-500/12 text-amber-300 light:text-amber-700",
        destructive: "border-red-500/30 bg-red-500/12 text-red-300 light:text-red-600",
        purple: "border-brand-purple/30 bg-brand-purple/15 text-brand-purple-soft",
        cyan: "border-cyan-500/30 bg-cyan-500/12 text-cyan-300 light:text-cyan-700",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
