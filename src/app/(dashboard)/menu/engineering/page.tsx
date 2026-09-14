import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMenuEngineering } from "@/lib/queries/menu.queries";
import { PageHeader, StatCard } from "@/components/shared";
import { MenuEngineeringView } from "@/components/menu/menu-engineering-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatVND } from "@/lib/format";

export const metadata = { title: "Menu Engineering | Restaurant ERP" };

export default async function MenuEngineeringPage() {
  const items = await getMenuEngineering();

  const totalQty = items.reduce((sum, i) => sum + i.qty_sold, 0);
  const totalRevenue = items.reduce((sum, i) => sum + i.revenue, 0);
  const totalCm = items.reduce((sum, i) => sum + i.total_cm, 0);
  const benchmarkCm = items[0]?.benchmark_cm ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menu Engineering"
        description="Phân nhóm món theo ma trận Kasavana-Smith dựa trên dữ liệu bán hàng 30 ngày gần nhất."
        breadcrumbs={[{ label: "Thực đơn", href: "/menu" }, { label: "Menu Engineering" }]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/menu">
              <ArrowLeft className="size-4" />
              Về thực đơn
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Số phần đã bán" value={formatNumber(totalQty)} hint="30 ngày gần nhất" />
        <StatCard title="Doanh thu" value={formatVND(totalRevenue)} hint="Đơn đã hoàn tất" />
        <StatCard title="Tổng lãi gộp" value={formatVND(totalCm)} tone="success" />
        <StatCard
          title="Lãi gộp bình quân / phần"
          value={benchmarkCm === null ? "—" : formatVND(benchmarkCm)}
          hint={
            benchmarkCm === null
              ? "Chưa có dữ liệu bán hàng 30 ngày"
              : "Ngưỡng phân loại lãi cao / thấp"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quy tắc Kasavana-Smith 30 ngày</CardTitle>
          <CardDescription>Cách mỗi món được xếp nhóm</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Mỗi món được chấm theo hai trục: <strong>mức độ phổ biến</strong> (tỷ trọng số phần bán
            ra trên tổng số phần) và <strong>lãi gộp trung bình mỗi phần</strong> (giá bán trừ giá
            vốn chuẩn theo định lượng).
          </p>
          <p>
            Món được coi là bán chạy khi tỷ trọng đạt từ ngưỡng <em>70% ÷ số món có bán</em> trở lên
            (quy tắc 70%), và được coi là lãi cao khi lãi gộp trung bình không thấp hơn lãi gộp bình
            quân toàn menu.
          </p>
          <p>
            Giao của hai trục cho bốn nhóm: <strong>Ngôi sao</strong> (bán chạy &amp; lãi cao — giữ
            nguyên, đẩy lên đầu menu), <strong>Bò kéo cày</strong> (bán chạy, lãi thấp — giảm giá vốn
            hoặc tăng giá nhẹ), <strong>Câu đố</strong> (lãi cao, bán ít — đẩy marketing, gợi ý cho
            khách) và <strong>Món ế</strong> (bán ít &amp; lãi thấp — cân nhắc bỏ khỏi menu).
          </p>
          <p>
            Số liệu chỉ tính đơn <strong>đã hoàn tất</strong> trong 30 ngày gần nhất và các món đang
            bán; lãi gộp dùng giá vốn chuẩn hiện tại nên thay đổi định lượng sẽ cập nhật ngay.
          </p>
        </CardContent>
      </Card>

      <MenuEngineeringView items={items} />
    </div>
  );
}
