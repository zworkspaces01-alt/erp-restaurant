import { Banknote, CalendarClock, Receipt, Wallet } from "lucide-react";
import { Forbidden, PageHeader, StatCard } from "@/components/shared";
import { PaymentsTable } from "@/components/payments/payments-table";
import { RecordPaymentButton } from "@/components/payments/record-payment-button";
import {
  getOutstandingPurchaseOrders,
  getSupplierOptions,
  getSupplierPayments,
} from "@/lib/queries/purchases.queries";
import { formatDate, formatVND, todayISO } from "@/lib/format";
import { requireAuth } from "@/lib/auth";

export const metadata = { title: "Thanh toán nhà cung cấp" };

export default async function PaymentsPage() {
  const { role, authorized } = await requireAuth(["owner", "manager"]);
  if (!authorized) {
    return <Forbidden requiredRoles={["owner", "manager"]} currentRole={role} />;
  }

  const [payments, suppliers, outstandingOrders] = await Promise.all([
    getSupplierPayments(),
    getSupplierOptions(),
    getOutstandingPurchaseOrders(),
  ]);

  const totalDebt = suppliers.reduce((s, o) => s + o.current_debt, 0);
  const month = todayISO().slice(0, 7);
  const paidThisMonth = payments
    .filter((p) => p.payment_date.startsWith(month))
    .reduce((s, p) => s + p.amount, 0);
  const nextDue = outstandingOrders
    .map((o) => o.due_date)
    .filter((d): d is string => Boolean(d))
    .sort()[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Thanh toán nhà cung cấp"
        description="Sổ quỹ trả nợ NCC: mỗi phiếu chi được phân bổ vào phiếu nhập đích danh hoặc trừ dần theo hạn (FIFO)."
        actions={
          <RecordPaymentButton suppliers={suppliers} outstandingOrders={outstandingOrders} />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Số phiếu chi" value={String(payments.length)} icon={Receipt} />
        <StatCard title="Đã chi tháng này" value={formatVND(paidThisMonth)} icon={Banknote} />
        <StatCard
          title="Tổng công nợ còn lại"
          value={formatVND(totalDebt)}
          icon={Wallet}
          tone={totalDebt > 0 ? "info" : "success"}
          hint={`${outstandingOrders.length} phiếu nhập còn nợ`}
        />
        <StatCard
          title="Hạn gần nhất"
          value={nextDue ? formatDate(nextDue) : "—"}
          icon={CalendarClock}
        />
      </div>

      <PaymentsTable payments={payments} />
    </div>
  );
}
