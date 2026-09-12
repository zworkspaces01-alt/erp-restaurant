import { format as formatDateFns, parseISO, isValid } from "date-fns";
import { vi } from "date-fns/locale";

const vndFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const numberFormatterCache = new Map<string, Intl.NumberFormat>();

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 1234567 -> "1.234.567 ₫" */
export function formatVND(value: number | string | null | undefined): string {
  return vndFormatter.format(toNumber(value));
}

/** Compact currency for charts/tiles: 1_250_000 -> "1,25 tr", 2_300_000_000 -> "2,3 tỷ" */
export function formatVNDCompact(value: number | string | null | undefined): string {
  const n = toNumber(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${formatNumber(abs / 1_000_000_000, 2)} tỷ`;
  if (abs >= 1_000_000) return `${sign}${formatNumber(abs / 1_000_000, 2)} tr`;
  if (abs >= 1_000) return `${sign}${formatNumber(abs / 1_000, 0)} k`;
  return formatVND(n);
}

/** 1234.5 -> "1.234,5" */
export function formatNumber(
  value: number | string | null | undefined,
  maxFractionDigits = 2,
  minFractionDigits = 0
): string {
  const key = `${minFractionDigits}-${maxFractionDigits}`;
  let f = numberFormatterCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("vi-VN", {
      minimumFractionDigits: minFractionDigits,
      maximumFractionDigits: maxFractionDigits,
    });
    numberFormatterCache.set(key, f);
  }
  return f.format(toNumber(value));
}

/** 0.325 (ratio) or 32.5 (percent) -> "32,5%". Pass `isRatio` for 0..1 inputs. */
export function formatPercent(
  value: number | string | null | undefined,
  digits = 1,
  isRatio = false
): string {
  const n = toNumber(value) * (isRatio ? 100 : 1);
  return `${formatNumber(n, digits, digits)}%`;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? parseISO(value) : value;
  return isValid(d) ? d : null;
}

/** "2026-09-11" -> "11/09/2026" */
export function formatDate(
  value: string | Date | null | undefined,
  pattern = "dd/MM/yyyy"
): string {
  const d = toDate(value);
  return d ? formatDateFns(d, pattern, { locale: vi }) : "—";
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, "dd/MM/yyyy HH:mm");
}

/** Month label: "2026-09" or Date -> "Tháng 9/2026" */
export function formatMonth(value: string | Date | null | undefined): string {
  const d = typeof value === "string" && /^\d{4}-\d{2}$/.test(value) ? parseISO(`${value}-01`) : toDate(value);
  return d ? `Tháng ${d.getMonth() + 1}/${d.getFullYear()}` : "—";
}

/** Today's date as YYYY-MM-DD in local time (for <input type="date"> defaults). */
export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Food cost thresholds used by badges across the app. */
export const FOOD_COST_WARN = 30; // %
export const FOOD_COST_DANGER = 35; // %
