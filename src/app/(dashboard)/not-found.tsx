import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export default function DashboardNotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Không tìm thấy dữ liệu"
      description="Bản ghi bạn tìm không tồn tại hoặc đã bị xóa."
      action={
        <Button asChild variant="outline">
          <Link href="/dashboard">Về bảng điều khiển</Link>
        </Button>
      }
    />
  );
}
