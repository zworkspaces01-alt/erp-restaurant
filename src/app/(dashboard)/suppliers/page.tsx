import Link from "next/link";
import { ShoppingCart, Wallet } from "lucide-react";
import { getSuppliers } from "@/lib/queries/purchases.queries";
import { PageHeader } from "@/components/shared/page-header";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { PAYMENT_TERM_LABELS } from "@/types/restaurant";
import { formatVND } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Nhà cung cấp & Công nợ | Restaurant ERP" };

export default async function SuppliersPage() {
  const suppliers = await getSuppliers();

  const totalDebt = suppliers.reduce((sum, s) => sum + Number(s.current_debt), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nhà cung cấp & Quản lý công nợ"
        description="Theo dõi danh bạ nhà cung cấp, điều khoản gối đầu (COD, Net 7/15/30) và tổng dư nợ hiện tại."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/payments">
                <Wallet className="mr-1.5 size-4" />
                Sổ quỹ trả nợ
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/purchases/new">
                <ShoppingCart className="mr-1.5 size-4" />
                Tạo phiếu nhập
              </Link>
            </Button>
            <AddSupplierDialog />
          </div>
        }
      />

      {/* Summary card */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Tổng số đối tác NCC</p>
          <p className="mt-1 text-2xl font-semibold">{suppliers.length} nhà cung cấp</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Tổng dư nợ gối đầu hiện tại</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600 dark:text-amber-400">
            {formatVND(totalDebt)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">NCC có dư nợ cần thanh toán</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {suppliers.filter((s) => Number(s.current_debt) > 0).length} đơn vị
          </p>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Mã / Tên NCC</th>
                  <th className="px-4 py-3 font-medium">Liên hệ</th>
                  <th className="px-4 py-3 font-medium">Địa chỉ</th>
                  <th className="px-4 py-3 font-medium">Điều khoản nợ</th>
                  <th className="px-4 py-3 font-medium text-right">Dư nợ hiện tại</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{s.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{s.code}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <p>{s.phone || "—"}</p>
                      <p>{s.email || ""}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {s.address || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {PAYMENT_TERM_LABELS[s.payment_terms] || s.payment_terms}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-amber-600 dark:text-amber-400">
                      {formatVND(s.current_debt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
