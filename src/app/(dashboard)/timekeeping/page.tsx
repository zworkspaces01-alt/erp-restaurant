import { CalendarDays, Clock, Users } from "lucide-react";
import { getTimekeeping } from "@/lib/queries/hr.queries";
import { formatDate, formatNumber, todayISO } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/shared";
import { TimekeepingDialog } from "@/components/hr/timekeeping-dialog";
import { TimekeepingFilters, type TimekeepingView } from "@/components/hr/timekeeping-filters";
import { TimekeepingTable } from "@/components/hr/timekeeping-table";

export const metadata = { title: "Chấm công | Restaurant ERP" };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 0));
  return end.toISOString().slice(0, 10);
}

export default async function TimekeepingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const view: TimekeepingView = sp.view === "month" ? "month" : "day";
  const today = todayISO();

  const raw = sp.date ?? (view === "month" ? today.slice(0, 7) : today);
  const value =
    view === "month"
      ? MONTH_RE.test(raw)
        ? raw
        : today.slice(0, 7)
      : DAY_RE.test(raw)
        ? raw
        : today;

  const from = view === "month" ? `${value}-01` : value;
  const to = view === "month" ? lastDayOfMonth(value) : value;

  const { rows, employees, totalHours } = await getTimekeeping(from, to);

  const shiftOptions = Array.from(
    new Set(rows.map((r) => r.shift).filter((s): s is string => Boolean(s)))
  ).sort((a, b) => a.localeCompare(b, "vi"));
  const uniqueEmployees = new Set(rows.map((r) => r.employee_id)).size;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chấm công"
        description="Ghi nhận giờ công theo ngày và ca làm; số giờ được hệ thống tự tính từ giờ vào/ra."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TimekeepingFilters view={view} value={value} />
            <TimekeepingDialog employees={employees} defaultDate={from} />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title={view === "month" ? "Khoảng thời gian" : "Ngày chấm công"}
          value={view === "month" ? `${formatDate(from)} – ${formatDate(to)}` : formatDate(from)}
          hint={`${formatNumber(rows.length)} lượt chấm công`}
          icon={CalendarDays}
        />
        <StatCard
          title="Tổng giờ công"
          value={`${formatNumber(totalHours, 1)} giờ`}
          hint="Tổng số giờ đã ghi nhận trong khoảng thời gian"
          icon={Clock}
          tone="info"
        />
        <StatCard
          title="Nhân viên có công"
          value={formatNumber(uniqueEmployees)}
          hint={`${formatNumber(employees.length)} nhân viên đang làm việc`}
          icon={Users}
          tone="success"
        />
      </div>

      <TimekeepingTable rows={rows} shiftOptions={shiftOptions} />
    </div>
  );
}
