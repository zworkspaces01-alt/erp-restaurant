import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export type StatTone = "default" | "success" | "warning" | "danger" | "info";

interface StatCardProps {
  title: string;
  value: string;
  /** Small caption under the value. */
  hint?: string;
  icon?: LucideIcon;
  /** Percentage change vs previous period. Positive = up. */
  trend?: number | null;
  trendLabel?: string;
  /** When true, a negative trend is good (e.g. costs). */
  invertTrend?: boolean;
  tone?: StatTone;
  className?: string;
}

const toneClasses: Record<StatTone, string> = {
  default: "bg-muted text-muted-foreground",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
};

export function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  trend,
  trendLabel = "so với kỳ trước",
  invertTrend = false,
  tone = "default",
  className,
}: StatCardProps) {
  const hasTrend = typeof trend === "number" && Number.isFinite(trend);
  const good = hasTrend ? (invertTrend ? trend <= 0 : trend >= 0) : true;

  return (
    <Card className={cn("gap-0 py-4", className)}>
      <CardContent className="flex items-start justify-between gap-3 px-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 truncate text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          {hasTrend && (
            <p
              className={cn(
                "mt-1 flex items-center gap-1 text-xs",
                good ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
              )}
            >
              {trend >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {trend >= 0 ? "+" : ""}
              {trend.toFixed(1)}% {trendLabel}
            </p>
          )}
        </div>
        {Icon && (
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", toneClasses[tone])}>
            <Icon className="size-4" />
          </span>
        )}
      </CardContent>
    </Card>
  );
}
