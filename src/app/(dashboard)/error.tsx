"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard Server Error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <Card className="max-w-md w-full border-destructive/30 bg-destructive/5 shadow-md">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="size-6" />
          </div>
          <CardTitle className="text-lg text-foreground">Không thể tải dữ liệu</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Đã có lỗi xảy ra trong quá trình kết nối hoặc xử lý dữ liệu từ máy chủ.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-2 text-center">
          {error.message && (
            <div className="rounded bg-background p-2.5 text-xs font-mono text-muted-foreground text-left max-h-24 overflow-auto border">
              {error.message}
            </div>
          )}
          <div className="flex justify-center gap-2">
            <Button variant="default" size="sm" onClick={() => reset()} className="gap-1.5">
              <RotateCcw className="size-3.5" />
              Thử tải lại trang
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
