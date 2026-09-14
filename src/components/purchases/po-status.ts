import type { BadgeTone } from "@/components/shared";
import type { PoPaymentStatus } from "@/types/restaurant";

/** Badge màu theo trạng thái thanh toán phiếu nhập: đã trả = xanh, một phần = vàng, chưa trả = đỏ. */
export function poStatusTone(status: PoPaymentStatus): BadgeTone {
  switch (status) {
    case "paid":
      return "success";
    case "partial":
      return "warning";
    default:
      return "danger";
  }
}
