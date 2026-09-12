import Link from "next/link";
import { ArrowLeft, Sparkles, TrendingUp, HelpCircle, AlertOctagon } from "lucide-react";
import { getMenuEngineering } from "@/lib/queries/menu.queries";
import { PageHeader } from "@/components/shared/page-header";
import { BCG_CATEGORY_LABELS, type BCGCategory } from "@/types/restaurant";
import { formatNumber, formatVND } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Ma trận Menu Engineering | Restaurant ERP" };

export default async function MenuEngineeringPage() {
  const items = await getMenuEngineering();

  const stars = items.filter((i) => i.bcg_category === "STAR");
  const plowhorses = items.filter((i) => i.bcg_category === "PLOWHORSE");
  const puzzles = items.filter((i) => i.bcg_category === "PUZZLE");
  const dogs = items.filter((i) => i.bcg_category === "DOG");

  const avgPopularity = items[0]?.avg_popularity ?? 0;
  const avgMargin = items[0]?.avg_unit_margin ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ma trận Menu Engineering (BCG 30 ngày)"
        description={`Phân loại món ăn dựa trên số lượng bán (Ngưỡng trung bình: ${formatNumber(avgPopularity, 0)} món) và Lợi nhuận biên trên từng món (Ngưỡng: ${formatVND(avgMargin)}).`}
        breadcrumbs={[
          { label: "Thực đơn", href: "/menu" },
          { label: "Menu Engineering" },
        ]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/menu">
              <ArrowLeft className="mr-1.5 size-4" />
              Quay lại thực đơn
            </Link>
          </Button>
        }
      />

      {/* 4 BCG Quadrants */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* STAR */}
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-1.5 text-base font-semibold text-emerald-700 dark:text-emerald-400">
                <Sparkles className="size-4" />
                {BCG_CATEGORY_LABELS.STAR.label}
              </CardTitle>
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                {stars.length} món
              </Badge>
            </div>
            <CardDescription className="text-xs">
              {BCG_CATEGORY_LABELS.STAR.desc}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {stars.length === 0 ? (
              <p className="text-xs text-muted-foreground">Chưa có món trong nhóm này</p>
            ) : (
              stars.map((it) => (
                <div key={it.menu_item_id} className="flex items-center justify-between rounded-md border bg-card p-2 text-xs">
                  <div>
                    <p className="font-medium text-foreground">{it.name}</p>
                    <p className="text-muted-foreground">Đã bán: {formatNumber(it.total_sold)} món</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                      +{formatVND(it.unit_margin)}/món
                    </p>
                    <p className="text-muted-foreground">Doanh thu: {formatVND(it.total_revenue)}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* PLOWHORSE */}
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-1.5 text-base font-semibold text-blue-700 dark:text-blue-400">
                <TrendingUp className="size-4" />
                {BCG_CATEGORY_LABELS.PLOWHORSE.label}
              </CardTitle>
              <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400">
                {plowhorses.length} món
              </Badge>
            </div>
            <CardDescription className="text-xs">
              {BCG_CATEGORY_LABELS.PLOWHORSE.desc}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {plowhorses.length === 0 ? (
              <p className="text-xs text-muted-foreground">Chưa có món trong nhóm này</p>
            ) : (
              plowhorses.map((it) => (
                <div key={it.menu_item_id} className="flex items-center justify-between rounded-md border bg-card p-2 text-xs">
                  <div>
                    <p className="font-medium text-foreground">{it.name}</p>
                    <p className="text-muted-foreground">Đã bán: {formatNumber(it.total_sold)} món</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-blue-600 dark:text-blue-400">
                      +{formatVND(it.unit_margin)}/món
                    </p>
                    <p className="text-muted-foreground">Doanh thu: {formatVND(it.total_revenue)}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* PUZZLE */}
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-1.5 text-base font-semibold text-amber-700 dark:text-amber-400">
                <HelpCircle className="size-4" />
                {BCG_CATEGORY_LABELS.PUZZLE.label}
              </CardTitle>
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                {puzzles.length} món
              </Badge>
            </div>
            <CardDescription className="text-xs">
              {BCG_CATEGORY_LABELS.PUZZLE.desc}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {puzzles.length === 0 ? (
              <p className="text-xs text-muted-foreground">Chưa có món trong nhóm này</p>
            ) : (
              puzzles.map((it) => (
                <div key={it.menu_item_id} className="flex items-center justify-between rounded-md border bg-card p-2 text-xs">
                  <div>
                    <p className="font-medium text-foreground">{it.name}</p>
                    <p className="text-muted-foreground">Đã bán: {formatNumber(it.total_sold)} món</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-amber-600 dark:text-amber-400">
                      +{formatVND(it.unit_margin)}/món
                    </p>
                    <p className="text-muted-foreground">Doanh thu: {formatVND(it.total_revenue)}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* DOG */}
        <Card className="border-rose-500/30 bg-rose-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-1.5 text-base font-semibold text-rose-700 dark:text-rose-400">
                <AlertOctagon className="size-4" />
                {BCG_CATEGORY_LABELS.DOG.label}
              </CardTitle>
              <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400">
                {dogs.length} món
              </Badge>
            </div>
            <CardDescription className="text-xs">
              {BCG_CATEGORY_LABELS.DOG.desc}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {dogs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Chưa có món trong nhóm này</p>
            ) : (
              dogs.map((it) => (
                <div key={it.menu_item_id} className="flex items-center justify-between rounded-md border bg-card p-2 text-xs">
                  <div>
                    <p className="font-medium text-foreground">{it.name}</p>
                    <p className="text-muted-foreground">Đã bán: {formatNumber(it.total_sold)} món</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-rose-600 dark:text-rose-400">
                      +{formatVND(it.unit_margin)}/món
                    </p>
                    <p className="text-muted-foreground">Doanh thu: {formatVND(it.total_revenue)}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Bảng số liệu chi tiết 30 ngày</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Tên món</th>
                  <th className="px-4 py-3 font-medium text-center">Phân loại BCG</th>
                  <th className="px-4 py-3 font-medium text-right">Số lượng bán</th>
                  <th className="px-4 py-3 font-medium text-right">Giá bán</th>
                  <th className="px-4 py-3 font-medium text-right">Giá vốn (BOM)</th>
                  <th className="px-4 py-3 font-medium text-right">Lãi biên / món</th>
                  <th className="px-4 py-3 font-medium text-right">Tổng doanh thu</th>
                  <th className="px-4 py-3 font-medium text-right">Tổng lãi gộp</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => {
                  const cat = (item.bcg_category as BCGCategory) || "DOG";
                  const meta = BCG_CATEGORY_LABELS[cat] || BCG_CATEGORY_LABELS.DOG;

                  return (
                    <tr key={item.menu_item_id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{item.name}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${meta.color}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatNumber(item.total_sold)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {formatVND(item.selling_price)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {formatVND(item.ideal_cost)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                        {formatVND(item.unit_margin)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatVND(item.total_revenue)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatVND(item.total_margin)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
