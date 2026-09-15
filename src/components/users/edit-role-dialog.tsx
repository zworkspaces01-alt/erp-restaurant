"use client";

import { useState, useTransition } from "react";
import { Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateUserRoleAction } from "@/server-actions/users.actions";
import { USER_ROLE_OPTIONS, type UserRole } from "@/types/restaurant";

interface EditRoleDialogProps {
  user: {
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function EditRoleDialog({ user, open, onOpenChange, onSuccess }: EditRoleDialogProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole>(user?.role ?? "staff");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Sync state khi user thay đổi
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && user) {
      setSelectedRole(user.role);
      setError(null);
    }
    onOpenChange(isOpen);
  };

  const handleSave = () => {
    if (!user) return;
    setError(null);
    startTransition(async () => {
      const result = await updateUserRoleAction({
        userId: user.id,
        newRole: selectedRole,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      toast.success(`Đã cập nhật vai trò cho "${user.full_name}" thành công!`);
      onOpenChange(false);
      onSuccess?.();
    });
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="size-5 text-primary" />
            Phân lại vai trò người dùng
          </DialogTitle>
          <DialogDescription>
            Thay đổi quyền hạn truy cập của tài khoản <strong>{user.full_name}</strong> ({user.email}).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-role-select">Vai trò mới</Label>
            <Select
              value={selectedRole}
              onValueChange={(val) => setSelectedRole(val as UserRole)}
            >
              <SelectTrigger id="edit-role-select">
                <SelectValue placeholder="Chọn vai trò" />
              </SelectTrigger>
              <SelectContent>
                {USER_ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Hủy
          </Button>
          <Button onClick={handleSave} disabled={pending || selectedRole === user.role}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Lưu thay đổi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
