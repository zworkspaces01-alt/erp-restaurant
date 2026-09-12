import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";

const toneClasses: Record<BadgeTone, string> = {
  success: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  warning: "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-400",
  neutral: "border-border bg-muted text-muted-foreground",
  primary: "border-primary/30 bg-primary/10 text-primary",
};

interface StatusBadgeProps {
  tone: BadgeTone;
  children: React.ReactNode;
  className?: string;
  /** Show a small dot before the label. */
  dot?: boolean;
}

/** Colored pill for statuses. Use `tone` semantics: success = paid/ok, danger = alert, warning = attention. */
export function StatusBadge({ tone, children, className, dot = false }: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn(toneClasses[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </Badge>
  );
}

/** Food cost % -> badge tone per spec: red > 35%, amber 30–35%, green otherwise. */
export function foodCostTone(pct: number | null | undefined): BadgeTone {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "neutral";
  if (pct > 35) return "danger";
  if (pct >= 30) return "warning";
  return "success";
}
