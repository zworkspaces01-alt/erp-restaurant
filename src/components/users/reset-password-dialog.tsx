"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetUserPasswordAction } from "@/server-actions/users.actions";

interface ResetPasswordDialogProps {
  user: {
    id: string;
    email: string;
    full_name: string;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ResetPasswordDialog({ user, open, onOpenChange }: ResetPasswordDialogProps) {
  const [newPassword, setNewPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setNewPassword("");
      setError(null);
    }
    onOpenChange(isOpen);
  };

  const handleReset = () => {
    if (!user) return;
    if (newPassword.length < 6) {
      setError("Mật khẩu mới phải có tối thiểu 6 ký tự");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await resetUserPasswordAction({
        userId: user.id,
        newPassword,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      toast.success(`Đã đặt lại mật khẩu cho tài khoản "${user.email}"!`);
      onOpenChange(false);
    });
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            Đặt lại mật khẩu
          </DialogTitle>
          <DialogDescription>
            Tạo mật khẩu mới cho tài khoản <strong>{user.full_name}</strong> ({user.email}).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admin-new-password">Mật khẩu mới</Label>
            <Input
              id="admin-new-password"
              type="text"
              placeholder="Tối thiểu 6 ký tự"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
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
          <Button onClick={handleReset} disabled={pending || newPassword.length < 6}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Xác nhận đổi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
