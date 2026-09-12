import { cn } from "@/lib/utils";
import { formatVND } from "@/lib/format";

interface MoneyProps {
  value: number | string | null | undefined;
  className?: string;
  /** Color negative values red and positive green. */
  signed?: boolean;
}

/** Right-aligned tabular VND amount. */
export function Money({ value, className, signed = false }: MoneyProps) {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return (
    <span
      className={cn(
        "tabular-nums",
        signed && n > 0 && "text-emerald-600 dark:text-emerald-400",
        signed && n < 0 && "text-destructive",
        className
      )}
    >
      {formatVND(n)}
    </span>
  );
}
