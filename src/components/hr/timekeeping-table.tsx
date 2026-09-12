"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { recordTimekeeping } from "@/server-actions/hr.actions";
import {
  TIMEKEEPING_STATUSES,
  TIMEKEEPING_STATUS_LABELS,
  type TimekeepingStatus,
} from "@/types/restaurant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface EmployeeRow {
  id: string;
  code: string;
  full_name: string;
  role: string;
  employment_type: string;
}

interface LogEntry {
  employee_id: string;
  shift: "morning" | "evening" | "full" | "custom";
  hours_worked: number;
  status: TimekeepingStatus;
  notes: string;
}

interface TimekeepingTableProps {
  targetDate: string;
  employees: EmployeeRow[];
  timekeeping: Array<{
    employee_id: string;
    shift: string;
    hours_worked: number;
    status: string;
    notes: string | null;
  }>;
}

export function TimekeepingTable({
  targetDate,
  employees,
  timekeeping,
}: TimekeepingTableProps) {
  const router = useRouter();

  // Khởi tạo state từ dữ liệu sẵn có hoặc mặc định
  const [entries, setEntries] = useState<Record<string, LogEntry>>(() => {
    const map: Record<string, LogEntry> = {};
    for (const emp of employees) {
      const existing = timekeeping.find((t) => t.employee_id === emp.id);
      map[emp.id] = {
        employee_id: emp.id,
        shift: (existing?.shift as "morning" | "evening" | "full" | "custom") ?? "full",
        hours_worked: existing ? Number(existing.hours_worked) : emp.employment_type === "full_time" ? 8 : 5,
        status: (existing?.status as TimekeepingStatus) ?? "present",
        notes: existing?.notes ?? "",
      };
    }
    return map;
  });

  const [savingId, setSavingId] = useState<string | null>(null);

  const updateEntry = <K extends keyof LogEntry>(empId: string, field: K, value: LogEntry[K]) => {
    setEntries((prev) => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        [field]: value,
      },
    }));
  };

  const saveOne = async (empId: string) => {
    setSavingId(empId);
    const entry = entries[empId];
    const res = await recordTimekeeping({
      employee_id: empId,
      work_date: targetDate,
      shift: entry.shift,
      hours_worked: Number(entry.hours_worked),
      status: entry.status,
      notes: entry.notes || undefined,
    });
    setSavingId(null);

    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success("Đã lưu chấm công!");
    router.refresh();
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Nhân viên</th>
            <th className="px-4 py-3 font-medium">Vị trí</th>
            <th className="px-4 py-3 font-medium">Trạng thái công</th>
            <th className="px-4 py-3 font-medium">Ca làm</th>
            <th className="px-4 py-3 font-medium text-right">Số giờ làm</th>
            <th className="px-4 py-3 font-medium">Ghi chú</th>
            <th className="px-4 py-3 text-center">Lưu</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {employees.map((emp) => {
            const entry = entries[emp.id] || {
              employee_id: emp.id,
              shift: "full",
              hours_worked: 8,
              status: "present",
              notes: "",
            };

            return (
              <tr key={emp.id} className="hover:bg-muted/30">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-foreground">{emp.full_name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{emp.code}</p>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{emp.role}</td>
                <td className="px-4 py-2.5">
                  <select
                    value={entry.status}
                    onChange={(e) => updateEntry(emp.id, "status", e.target.value as TimekeepingStatus)}
                    className="rounded-md border bg-background px-2.5 py-1 text-xs shadow-xs"
                  >
                    {TIMEKEEPING_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {TIMEKEEPING_STATUS_LABELS[st]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  <select
                    value={entry.shift}
                    onChange={(e) =>
                      updateEntry(emp.id, "shift", e.target.value as "morning" | "evening" | "full" | "custom")
                    }
                    className="rounded-md border bg-background px-2.5 py-1 text-xs shadow-xs"
                  >
                    <option value="morning">Ca sáng</option>
                    <option value="evening">Ca tối</option>
                    <option value="full">Cả ngày</option>
                    <option value="custom">Tùy biến</option>
                  </select>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    max="24"
                    value={entry.hours_worked}
                    onChange={(e) => updateEntry(emp.id, "hours_worked", Number(e.target.value))}
                    className="h-8 w-20 text-right text-xs"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <Input
                    placeholder="Đi trễ, đổi ca..."
                    value={entry.notes}
                    onChange={(e) => updateEntry(emp.id, "notes", e.target.value)}
                    className="h-8 text-xs"
                  />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="outline"
                    disabled={savingId === emp.id}
                    onClick={() => saveOne(emp.id)}
                  >
                    <Check className="size-3.5" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
