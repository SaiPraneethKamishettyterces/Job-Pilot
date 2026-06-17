import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold tracking-[-0.005em] transition-[background,border-color,color,transform,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "gradient-primary gradient-primary-hover text-white shadow-[0_12px_30px_-8px_rgba(37,99,235,0.45)] hover:-translate-y-px",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-[0_10px_24px_-10px_rgba(239,68,68,0.5)]",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-accent hover:border-[color:var(--border-medium)]",
        secondary:
          "bg-foreground/[0.06] text-foreground border border-border hover:bg-foreground/[0.1]",
        ghost: "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
        link: "text-brand-blue-soft underline-offset-4 hover:underline",
        success: "bg-success text-success-foreground hover:bg-success/90",
      },
      size: {
        default: "h-11 px-[18px] py-2",
        sm: "h-9 rounded-lg px-3 text-[13px]",
        lg: "h-12 rounded-lg px-6 text-[15px]",
        xl: "h-12 rounded-lg px-10 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
