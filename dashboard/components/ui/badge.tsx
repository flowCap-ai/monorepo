import * as React from "react";
import { cn } from "@/lib/utils";

const Badge = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: "default" | "secondary" | "outline" | "success" | "warning" | "destructive";
  }
>(({ className, variant = "default", ...props }, ref) => {
  const variants = {
    default: "bg-orange-500/8 text-orange-400 border-orange-500/15",
    secondary: "bg-surface text-zinc-400 border-[var(--border)]",
    outline: "bg-transparent text-zinc-500 border-[var(--border)]",
    success: "bg-orange-500/8 text-orange-400 border-orange-500/15",
    warning: "bg-orange-500/8 text-orange-400/80 border-orange-500/10",
    destructive: "bg-zinc-800/50 text-zinc-400 border-zinc-700/50",
  };

  return (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors",
        variants[variant],
        className
      )}
      {...props}
    />
  );
});
Badge.displayName = "Badge";

export { Badge };
