import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSupplierPayments, getSuppliers } from "@/lib/queries/purchases.queries";
import { PageHeader } from "@/components/shared/page-header";
import { AddPaymentDialog } from "@/components/payments/add-payment-dialog";
import { formatDate, formatVND } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Sổ quỹ trả nợ NCC | Restaurant ERP" };

export default async function PaymentsPage() {
  const [payments, suppliers] = await Promise.all([
    getSupplierPayments(),
    getSuppliers(),
  ]);

  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  const formattedSuppliers = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    current_debt: Number(s.current_debt),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sổ quỹ thanh toán & Trả nợ NCC"
        description="Lịch sử chi trả nợ nhà cung cấp. Khoản chi được tự động khấu trừ dư nợ và cập nhật trạng thái phiếu nhập kho."
        breadcrumbs={[
          { label: "Mua hàng & công nợ", href: "/suppliers" },
          { label: "Thanh toán NCC" },
        ]}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/suppliers">
                <ArrowLeft className="mr-1.5 size-4" />
                Danh sách NCC
              </Link>
            </Button>
            <AddPaymentDialog suppliers={formattedSuppliers} />
          </div>
        }
      />

      <Card className="p-4">
        <p className="text-xs font-medium text-muted-foreground">Tổng số tiền đã thanh toán cho NCC</p>
        <p className="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
          {formatVND(totalPaid)}
        </p>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Mã phiếu chi</th>
                  <th className="px-4 py-3 font-medium">Nhà cung cấp</th>
                  <th className="px-4 py-3 font-medium">Ngày chi</th>
                  <th className="px-4 py-3 font-medium">Hình thức</th>
                  <th className="px-4 py-3 font-medium text-right">Số tiền chi</th>
                  <th className="px-4 py-3 font-medium">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      Chưa có phiếu thanh toán nào được ghi nhận.
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => {
                    const sup = p.suppliers as { name?: string; code?: string } | null;

                    return (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono font-medium">{p.payment_number}</td>
                        <td className="px-4 py-3 font-medium">
                          {sup?.name ?? "—"} ({sup?.code ?? ""})
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {formatDate(p.payment_date)}
                        </td>
                        <td className="px-4 py-3 text-xs capitalize text-muted-foreground">
                          {p.payment_method === "bank_transfer" ? "Chuyển khoản" : "Tiền mặt"}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {formatVND(p.amount)}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {p.notes || "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
