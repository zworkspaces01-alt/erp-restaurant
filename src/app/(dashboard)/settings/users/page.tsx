import { Shield, ShieldCheck, UserCheck, Users } from "lucide-react";
import { Forbidden, PageHeader, StatCard } from "@/components/shared";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { UsersTable } from "@/components/users/users-table";
import { getUsersList } from "@/server-actions/users.actions";
import { requireAuth } from "@/lib/auth";

export const metadata = { title: "Tài khoản & Phân quyền | Restaurant ERP" };

export default async function UsersManagementPage() {
  const { role, user, authorized } = await requireAuth(["owner"]);
  if (!authorized) {
    return <Forbidden requiredRoles={["owner"]} currentRole={role} />;
  }

  const result = await getUsersList();
  const users = result.success ? result.data : [];

  const ownersCount = users.filter((u) => u.role === "owner").length;
  const managersCount = users.filter((u) => u.role === "manager").length;
  const staffCount = users.filter((u) => u.role === "staff").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tài khoản & Phân quyền"
        description="Quản lý danh sách tài khoản, phân vai trò truy cập (Chủ nhà hàng, Quản lý, Nhân viên) và bảo mật hệ thống ERP."
        breadcrumbs={[
          { label: "Hệ thống", href: "/settings/users" },
          { label: "Tài khoản & Phân quyền" },
        ]}
        actions={<CreateUserDialog />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Tổng số tài khoản"
          value={String(users.length)}
          hint="Người dùng có thể đăng nhập"
          icon={Users}
        />
        <StatCard
          title="Chủ nhà hàng"
          value={String(ownersCount)}
          hint="Toàn quyền quản trị cấp cao"
          icon={ShieldCheck}
        />
        <StatCard
          title="Quản lý"
          value={String(managersCount)}
          hint="Vận hành kho, menu, POS"
          icon={Shield}
        />
        <StatCard
          title="Nhân viên"
          value={String(staffCount)}
          hint="Bán hàng & chấm công"
          icon={UserCheck}
        />
      </div>

      <UsersTable users={users} currentUserId={user.id} />
    </div>
  );
}
