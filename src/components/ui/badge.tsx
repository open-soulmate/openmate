import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "destructive";

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-primary/15 text-primary",
  success: "bg-emerald-500/15 text-emerald-400",
  warning: "bg-amber-500/15 text-amber-400",
  destructive: "bg-destructive/15 text-destructive",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
        variantStyles[variant],
        className,
      )}
      {...props}
    />
  );
}
