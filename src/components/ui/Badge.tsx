import { cn } from "@/lib/utils";

type BadgeVariant = "success" | "warning" | "danger" | "neutral" | "primary";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = "neutral", className }: BadgeProps) {
  return (
    <span className={cn("badge", `badge-${variant}`, className)}>
      {children}
    </span>
  );
}

// Billing category → variant mapping
export function billingStatusVariant(
  status: "pending" | "paid" | "overdue" | "cancelled"
): BadgeVariant {
  return (
    { pending: "warning", paid: "success", overdue: "danger", cancelled: "neutral" } as const
  )[status];
}
