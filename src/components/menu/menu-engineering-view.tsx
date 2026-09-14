"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { MenuEngineeringItem } from "@/lib/queries/menu.queries";
import {
  MENU_CLASS_HINTS,
  MENU_CLASS_LABELS,
  menuClassTone,
  type MenuClass,
} from "@/types/restaurant";
import { formatNumber, formatPercent, formatVND, formatVNDCompact } from "@/lib/format";
import {
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  Money,
  StatusBadge,
} from "@/components/shared";
import type { DataTableFilter } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Validated categorical palette (dataviz six-checks, light + dark surfaces). */
const CLASS_COLORS: Record<MenuClass, string> = {
  star: "#059669",
  plowhorse: "#0284c7",
  puzzle: "#d97706",
  dog: "#e11d48",
};

const CLASS_ORDER: MenuClass[] = ["star", "plowhorse", "puzzle", "dog"];

interface Props {
  items: MenuEngineeringItem[];
}

interface ScatterPoint {
  x: number;
  y: number;
  z: number;
  name: string;
  qty: number;
  revenue: number;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ScatterPoint }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{p.name}</p>
      <p className="text-muted-foreground">Tỷ trọng bán: {formatPercent(p.x, 1, true)}</p>
      <p className="text-muted-foreground">Lãi gộp TB: {formatVND(p.y)}</p>
      <p className="text-muted-foreground">Đã bán: {formatNumber(p.qty)} phần</p>
      <p className="text-muted-foreground">Doanh thu: {formatVND(p.revenue)}</p>
    </div>
  );
}

export function MenuEngineeringView({ items }: Props) {
  const sold = useMemo(() => items.filter((i) => i.qty_sold > 0), [items]);
  // null = không có doanh số trong 30 ngày → "chưa có dữ liệu", không phải "món kém".
  const popularityThreshold = items[0]?.popularity_threshold ?? null;
  const benchmarkCm = items[0]?.benchmark_cm ?? null;
  const hasBenchmark = benchmarkCm !== null;

  const series = useMemo(
    () =>
      CLASS_ORDER.map((cls) => ({
        cls,
        data: items
          .filter((i) => i.menu_class === cls)
          .map<ScatterPoint>((i) => ({
            x: i.popularity_share,
            y: i.avg_cm,
            z: Math.max(i.qty_sold, 1),
            name: i.name,
            qty: i.qty_sold,
            revenue: i.revenue,
          })),
      })).filter((s) => s.data.length > 0),
    [items]
  );

  const columns = useMemo<ColumnDef<MenuEngineeringItem>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Món" />,
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <Link href={`/menu/${row.original.id}`} className="font-medium hover:underline">
              {row.original.name}
            </Link>
            <span className="font-mono text-xs text-muted-foreground">
              {row.original.code ?? "—"}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "category",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Danh mục" />,
        cell: ({ row }) => row.original.category ?? "—",
        filterFn: "equals",
      },
      {
        id: "menu_class",
        accessorFn: (row) => (row.menu_class ? MENU_CLASS_LABELS[row.menu_class] : "—"),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nhóm" />,
        cell: ({ row }) => {
          const cls = row.original.menu_class;
          return cls ? (
            <StatusBadge tone={menuClassTone(cls)}>{MENU_CLASS_LABELS[cls]}</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">—</StatusBadge>
          );
        },
        filterFn: "equals",
      },
      {
        accessorKey: "qty_sold",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="SL bán" className="justify-end" />
        ),
        cell: ({ row }) => <div className="text-right">{formatNumber(row.original.qty_sold)}</div>,
      },
      {
        accessorKey: "popularity_share",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Tỷ trọng" className="justify-end" />
        ),
        cell: ({ row }) => (
          <div className="text-right">{formatPercent(row.original.popularity_share, 1, true)}</div>
        ),
      },
      {
        accessorKey: "revenue",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Doanh thu" className="justify-end" />
        ),
        cell: ({ row }) => <div className="text-right">{formatVND(row.original.revenue)}</div>,
      },
      {
        accessorKey: "avg_cm",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Lãi gộp TB" className="justify-end" />
        ),
        cell: ({ row }) => (
          <div className="text-right">
            <Money value={row.original.avg_cm} />
          </div>
        ),
      },
      {
        accessorKey: "total_cm",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Tổng lãi gộp" className="justify-end" />
        ),
        cell: ({ row }) => (
          <div className="text-right font-medium">
            <Money value={row.original.total_cm} />
          </div>
        ),
      },
    ],
    []
  );

  const filters = useMemo<DataTableFilter[]>(() => {
    const categories = Array.from(
      new Set(items.map((i) => i.category).filter((c): c is string => Boolean(c)))
    ).sort((a, b) => a.localeCompare(b, "vi"));
    return [
      {
        columnId: "menu_class",
        title: "Nhóm",
        options: CLASS_ORDER.map((c) => ({ label: MENU_CLASS_LABELS[c], value: MENU_CLASS_LABELS[c] })),
      },
      {
        columnId: "category",
        title: "Danh mục",
        options: categories.map((c) => ({ label: c, value: c })),
      },
    ];
  }, [items]);

  if (items.length === 0) {
    return (
      <EmptyState
        title="Chưa có dữ liệu Menu Engineering"
        description="Cần ít nhất một món đang bán để dựng ma trận Kasavana-Smith."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ma trận Kasavana-Smith (30 ngày gần nhất)</CardTitle>
          <CardDescription>
            Trục ngang: tỷ trọng số lượng bán của món trên tổng số phần bán ra. Trục dọc: lãi gộp
            trung bình mỗi phần.
            {hasBenchmark ? (
              <>
                {" "}
                Hai đường tham chiếu là ngưỡng phổ biến (quy tắc 70%:{" "}
                {popularityThreshold === null ? "—" : formatPercent(popularityThreshold, 2, true)})
                và lãi gộp bình quân toàn menu ({formatVND(benchmarkCm)}). Món nằm trên/phải cả hai
                ngưỡng là “Ngôi sao”.
              </>
            ) : (
              " Chưa có đơn hoàn tất nào trong 30 ngày nên chưa có ngưỡng tham chiếu."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasBenchmark || sold.length === 0 ? (
            <EmptyState
              title="Chưa có đơn bán nào trong 30 ngày"
              description="Ma trận sẽ hiển thị sau khi có đơn hàng hoàn tất; hiện tại mọi món đều chưa đủ dữ liệu."
            />
          ) : (
            <div className="h-[420px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 24, bottom: 32, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Tỷ trọng bán"
                    tickFormatter={(v: number) => formatPercent(v, 0, true)}
                    tick={{ fontSize: 12 }}
                    label={{ value: "Mức độ phổ biến", position: "insideBottom", offset: -16, fontSize: 12 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Lãi gộp TB"
                    tickFormatter={(v: number) => formatVNDCompact(v)}
                    tick={{ fontSize: 12 }}
                    width={72}
                  />
                  <ZAxis type="number" dataKey="z" range={[60, 320]} name="SL bán" />
                  <Tooltip content={<ChartTooltip />} cursor={{ strokeDasharray: "3 3" }} />
                  <Legend verticalAlign="top" height={32} />
                  {popularityThreshold !== null ? (
                    <ReferenceLine
                      x={popularityThreshold}
                      stroke="currentColor"
                      strokeDasharray="6 4"
                      className="text-muted-foreground"
                    />
                  ) : null}
                  {benchmarkCm !== null ? (
                    <ReferenceLine
                      y={benchmarkCm}
                      stroke="currentColor"
                      strokeDasharray="6 4"
                      className="text-muted-foreground"
                    />
                  ) : null}
                  {series.map((s) => (
                    <Scatter
                      key={s.cls}
                      name={MENU_CLASS_LABELS[s.cls]}
                      data={s.data}
                      fill={CLASS_COLORS[s.cls]}
                      fillOpacity={0.85}
                      stroke="var(--background)"
                      strokeWidth={2}
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {hasBenchmark ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {CLASS_ORDER.map((cls) => {
              const count = items.filter((i) => i.menu_class === cls).length;
              return (
                <Card key={cls}>
                  <CardContent className="space-y-2 pt-6">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge tone={menuClassTone(cls)}>{MENU_CLASS_LABELS[cls]}</StatusBadge>
                      <span className="text-lg font-semibold">{count}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{MENU_CLASS_HINTS[cls]}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <DataTable
            columns={columns}
            data={items}
            filters={filters}
            searchPlaceholder="Tìm món..."
            emptyMessage="Không có món phù hợp."
            initialSorting={[{ id: "total_cm", desc: true }]}
          />
        </>
      ) : (
        <EmptyState
          title="Chưa đủ dữ liệu để phân nhóm"
          description="Không có đơn hoàn tất nào trong 30 ngày gần nhất, nên chưa tính được ngưỡng phổ biến và lãi gộp bình quân. Mọi món sẽ được phân nhóm ngay khi có doanh số."
        />
      )}
    </div>
  );
}
