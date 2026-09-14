import { parseISO, isValid } from "date-fns";

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

/** Múi giờ nhà hàng (app_settings.timezone, mặc định theo DATABASE.md §9). */
export const RESTAURANT_TIMEZONE = "Asia/Ho_Chi_Minh";

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? parseISO(value) : value;
  return isValid(d) ? d : null;
}

interface DateParts {
  yyyy: string;
  MM: string;
  dd: string;
  HH: string;
  mm: string;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    partsFormatterCache.set(timeZone, f);
  }
  return f;
}

/** Tách một thời điểm thành các thành phần ngày/giờ **theo múi giờ nhà hàng**. */
function zonedParts(date: Date, timeZone: string): DateParts {
  const map: Record<string, string> = {};
  for (const part of partsFormatter(timeZone).formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    yyyy: map.year ?? "",
    MM: map.month ?? "",
    dd: map.day ?? "",
    HH: map.hour === "24" ? "00" : (map.hour ?? "00"),
    mm: map.minute ?? "00",
  };
}

function renderParts(parts: DateParts, pattern: string): string {
  return pattern.replace(/yyyy|dd|MM|HH|mm/g, (token) => parts[token as keyof DateParts]);
}

/**
 * "2026-09-11" -> "11/09/2026". Timestamptz được hiển thị theo giờ Việt Nam
 * (server chạy UTC vẫn ra đúng ngày); chuỗi date-only không bị đổi múi giờ.
 */
export function formatDate(
  value: string | Date | null | undefined,
  pattern = "dd/MM/yyyy",
  timeZone: string = RESTAURANT_TIMEZONE
): string {
  if (typeof value === "string") {
    const dateOnly = DATE_ONLY_RE.exec(value.trim());
    if (dateOnly) {
      const [, yyyy, MM, dd] = dateOnly;
      return renderParts({ yyyy, MM, dd, HH: "00", mm: "00" }, pattern);
    }
  }
  const d = toDate(value);
  return d ? renderParts(zonedParts(d, timeZone), pattern) : "—";
}

export function formatDateTime(
  value: string | Date | null | undefined,
  timeZone: string = RESTAURANT_TIMEZONE
): string {
  return formatDate(value, "dd/MM/yyyy HH:mm", timeZone);
}

/** Month label: "2026-09" or Date -> "Tháng 9/2026" */
export function formatMonth(
  value: string | Date | null | undefined,
  timeZone: string = RESTAURANT_TIMEZONE
): string {
  if (typeof value === "string" && /^\d{4}-\d{2}$/.test(value.trim())) {
    const [yyyy, MM] = value.trim().split("-");
    return `Tháng ${Number(MM)}/${yyyy}`;
  }
  const d = toDate(value);
  if (!d) return "—";
  const p = zonedParts(d, timeZone);
  return `Tháng ${Number(p.MM)}/${p.yyyy}`;
}

/** Hôm nay (YYYY-MM-DD) **theo giờ nhà hàng** — dùng làm mặc định cho <input type="date">. */
export function todayISO(timeZone: string = RESTAURANT_TIMEZONE): string {
  const p = zonedParts(new Date(), timeZone);
  return `${p.yyyy}-${p.MM}-${p.dd}`;
}

/** Food cost thresholds used by badges across the app. */
export const FOOD_COST_WARN = 30; // %
export const FOOD_COST_DANGER = 35; // %
