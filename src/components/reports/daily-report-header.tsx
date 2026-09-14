"use client";

import { useRouter } from "next/navigation";
import { Calendar, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exportDailyReportToExcel } from "@/lib/excel";
import type { DailyReportSummary, DailyIngredientUsageRow, DailyTrendRow } from "@/lib/queries/reports.queries";

import { TelegramReportDialog } from "@/components/reports/telegram-report-dialog";

interface DailyReportHeaderProps {
  date: string;
  summary: DailyReportSummary;
  ingredients: DailyIngredientUsageRow[];
  trend: DailyTrendRow[];
}

export function DailyReportHeader({
  date,
  summary,
  ingredients,
  trend,
}: DailyReportHeaderProps) {
  const router = useRouter();

  const handleDateChange = (newDate: string) => {
    if (!newDate) return;
    router.push(`/reports/daily?date=${newDate}`);
  };

  const setQuickDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    const dateStr = d.toISOString().slice(0, 10);
    router.push(`/reports/daily?date=${dateStr}`);
  };

  const handleExport = () => {
    exportDailyReportToExcel(date, summary, ingredients, trend);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 bg-muted/50 border rounded-lg px-2.5 py-1">
          <Calendar className="size-4 text-primary" />
          <span className="text-xs font-medium">Chọn ngày xem:</span>
          <Input
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            className="h-7 w-[145px] text-xs font-semibold bg-background border-none shadow-none focus-visible:ring-1"
          />
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setQuickDate(0)}
            className="h-8 text-xs"
          >
            Hôm nay
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setQuickDate(1)}
            className="h-8 text-xs"
          >
            Hôm qua
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setQuickDate(2)}
            className="h-8 text-xs"
          >
            Hôm kia
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <TelegramReportDialog
          date={date}
          summary={summary}
          ingredients={ingredients}
        />

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExport}
          className="gap-1.5 text-xs h-8 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
        >
          <FileSpreadsheet className="size-3.5 text-emerald-600" />
          <Download className="size-3" />
          <span>Xuất Excel</span>
        </Button>
      </div>
    </div>
  );
}
