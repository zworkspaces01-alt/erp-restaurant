"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calculator, CheckCircle2, DollarSign } from "lucide-react";
import { toast } from "sonner";
import {
  finalizePayrollAction,
  generatePayrollAction,
  payPayrollAction,
} from "@/server-actions/hr.actions";
import { Button } from "@/components/ui/button";

export function PayrollActions({
  periodId,
  status,
}: {
  periodId: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    const res = await generatePayrollAction(periodId);
    setLoading(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success("Đã tự động tính lương từ dữ liệu chấm công!");
    router.refresh();
  };

  const handleFinalize = async () => {
    setLoading(true);
    const res = await finalizePayrollAction(periodId);
    setLoading(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success("Đã chốt bảng lương!");
    router.refresh();
  };

  const handlePay = async () => {
    setLoading(true);
    const res = await payPayrollAction(periodId);
    setLoading(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success("Đã chi trả bảng lương!");
    router.refresh();
  };

  return (
    <div className="flex items-center gap-1.5">
      {status === "draft" && (
        <>
          <Button size="xs" variant="outline" onClick={handleGenerate} disabled={loading}>
            <Calculator className="mr-1 size-3" />
            Tính lương
          </Button>
          <Button size="xs" variant="secondary" onClick={handleFinalize} disabled={loading}>
            <CheckCircle2 className="mr-1 size-3" />
            Chốt
          </Button>
        </>
      )}
      {status === "finalized" && (
        <Button size="xs" onClick={handlePay} disabled={loading}>
          <DollarSign className="mr-1 size-3" />
          Chi trả
        </Button>
      )}
    </div>
  );
}
