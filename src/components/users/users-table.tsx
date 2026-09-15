"use client";

import { useState } from "react";
import { KeyRound, MoreHorizontal, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared";
import { EditRoleDialog } from "@/components/users/edit-role-dialog";
import { ResetPasswordDialog } from "@/components/users/reset-password-dialog";
import { deleteUserAction, type UserAccountItem } from "@/server-actions/users.actions";
import { formatDate, formatDateTime } from "@/lib/format";
import { USER_ROLE_LABELS, type UserRole } from "@/types/restaurant";

interface UsersTableProps {
  users: UserAccountItem[];
  currentUserId?: string;
}

export function UsersTable({ users, currentUserId }: UsersTableProps) {
  const [editingRoleUser, setEditingRoleUser] = useState<UserAccountItem | null>(null);
  const [resettingUser, setResettingUser] = useState<UserAccountItem | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserAccountItem | null>(null);

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case "owner":
        return "default"; // dark/primary
      case "manager":
        return "secondary";
      case "staff":
      default:
        return "outline";
    }
  };

  const handleDelete = async () => {
    if (!deletingUser) return;
    const result = await deleteUserAction({ userId: deletingUser.id });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`Đã xóa tài khoản "${deletingUser.email}"`);
    setDeletingUser(null);
  };

  return (
    <>
      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Họ và tên</TableHead>
              <TableHead>Email đăng nhập</TableHead>
              <TableHead>Vai trò</TableHead>
              <TableHead>Ngày tạo</TableHead>
              <TableHead>Đăng nhập gần nhất</TableHead>
              <TableHead className="w-[80px] text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              return (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{user.full_name}</span>
                      {isSelf && (
                        <Badge variant="outline" className="text-[10px] text-primary">
                          Bạn
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(user.role)}>
                      {USER_ROLE_LABELS[user.role]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(user.created_at)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {user.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : "Chưa từng đăng nhập"}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Menu thao tác</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setEditingRoleUser(user)}
                          disabled={isSelf}
                        >
                          <Shield className="mr-2 size-4" />
                          Đổi vai trò
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setResettingUser(user)}>
                          <KeyRound className="mr-2 size-4" />
                          Đặt lại mật khẩu
                        </DropdownMenuItem>
                        {!isSelf && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeletingUser(user)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 size-4" />
                              Xóa tài khoản
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <EditRoleDialog
        user={editingRoleUser}
        open={Boolean(editingRoleUser)}
        onOpenChange={(open) => !open && setEditingRoleUser(null)}
      />

      <ResetPasswordDialog
        user={resettingUser}
        open={Boolean(resettingUser)}
        onOpenChange={(open) => !open && setResettingUser(null)}
      />

      <ConfirmDialog
        open={Boolean(deletingUser)}
        onOpenChange={(open) => !open && setDeletingUser(null)}
        title="Xóa tài khoản người dùng"
        description={`Bạn có chắc chắn muốn xóa tài khoản "${deletingUser?.email}" không? Thao tác này không thể hoàn tác.`}
        confirmLabel="Xóa tài khoản"
        destructive
        onConfirm={handleDelete}
      />
    </>
  );
}
