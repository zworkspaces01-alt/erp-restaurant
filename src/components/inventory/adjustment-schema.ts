import { z } from "zod";
import { stockAdjustmentSchema } from "@/types/restaurant";

/**
 * `p_txn_at` — ngày nghiệp vụ của giao dịch (DATABASE.md §5.5 / BL-11): hao hụt phát hiện
 * ngày 31 nhưng nhập ngày 2 vẫn phải thuộc tháng đã xảy ra. Không được ở tương lai
 * (`INVALID_TXN_DATE`).
 */
export const txnAtSchema = z
  .string()
  .trim()
  .min(1, "Ngày ghi nhận không hợp lệ")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Ngày ghi nhận không hợp lệ")
  .refine((v) => Date.parse(v) <= Date.now() + 60_000, "Ngày ghi nhận không được ở tương lai")
  .optional();

/** Giao dịch kho thủ công (hao hụt / điều chỉnh / kiểm kê) + ngày nghiệp vụ tuỳ chọn. */
export const stockAdjustmentWithDateSchema = stockAdjustmentSchema.and(
  z.object({ txn_at: txnAtSchema })
);
export type StockAdjustmentWithDateInput = z.infer<typeof stockAdjustmentWithDateSchema>;
export type StockAdjustmentWithDateFormValues = z.input<typeof stockAdjustmentWithDateSchema>;

/**
 * Chuyển giá trị của `<input type="date">` sang timestamp cho `p_txn_at`.
 * - Ngày hôm nay → `undefined` (RPC dùng `now()`, tránh `INVALID_TXN_DATE` khi 12h trưa chưa tới).
 * - Ngày quá khứ → 12:00 giờ địa phương (UTC+7) của ngày đó.
 */
export function toTxnTimestamp(value: string | undefined, today: string): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value >= today ? undefined : `${value}T12:00:00+07:00`;
  }
  return new Date(value).toISOString();
}

/** Phiếu kiểm kê hàng loạt: chỉ gửi các dòng có số đếm khác tồn sổ (DATABASE.md §7.4). */
export const stocktakeSheetSchema = z.object({
  txn_at: txnAtSchema,
  note: z.string().trim().max(500, "Ghi chú tối đa 500 ký tự").optional(),
  lines: z
    .array(
      z.object({
        ingredient_id: z.string().uuid("Nguyên liệu không hợp lệ"),
        counted: z.coerce.number({ invalid_type_error: "Số đếm không hợp lệ" }).min(0, "Số đếm phải lớn hơn hoặc bằng 0"),
      })
    )
    .min(1, "Chưa có dòng kiểm kê nào thay đổi"),
});
export type StocktakeSheetInput = z.infer<typeof stocktakeSheetSchema>;
