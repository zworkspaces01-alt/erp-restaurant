import Link from "next/link";
import { ShieldAlert, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { USER_ROLE_LABELS, type UserRole } from "@/types/restaurant";

interface ForbiddenProps {
  requiredRoles?: UserRole[];
  currentRole?: UserRole;
  title?: string;
  description?: string;
}

export function Forbidden({
  requiredRoles,
  currentRole,
  title = "Không có quyền truy cập",
  description,
}: ForbiddenProps) {
  const currentRoleLabel = currentRole ? USER_ROLE_LABELS[currentRole] : "Chưa xác định";
  const requiredRoleLabels = requiredRoles
    ?.map((r) => USER_ROLE_LABELS[r])
    .join(" hoặc ");

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive shadow-sm">
        <ShieldAlert className="size-8" />
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">{title}</h1>

      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {description ??
          `Tài khoản của bạn đang có vai trò "${currentRoleLabel}". Tính năng này chỉ dành cho tài khoản có quyền: ${
            requiredRoleLabels ?? "Quản trị viên"
          }.`}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button variant="outline" asChild>
          <Link href="/dashboard">
            <Home className="mr-2 size-4" />
            Về bảng điều khiển
          </Link>
        </Button>
      </div>
    </div>
  );
}
