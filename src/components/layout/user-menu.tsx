"use client";

import { KeyRound, LogOut, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/server-actions/auth.actions";
import { USER_ROLE_LABELS, type UserRole } from "@/types/restaurant";
import { ChangePasswordDialog } from "@/components/auth/change-password-dialog";

interface UserMenuProps {
  email: string | null;
  fullName: string | null;
  role: UserRole | null;
}

function initials(name: string | null, email: string | null): string {
  const source = (name ?? email ?? "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function UserMenu({ email, fullName, role }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Tài khoản">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">{initials(fullName, email)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <UserRound className="size-3.5" />
            {fullName ?? "Người dùng"}
          </span>
          <span className="truncate text-xs font-normal text-muted-foreground">{email}</span>
          {role && <span className="text-xs font-normal text-muted-foreground">Vai trò: {USER_ROLE_LABELS[role]}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <ChangePasswordDialog>
          <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="cursor-pointer">
            <KeyRound className="mr-2 size-4" />
            Đổi mật khẩu
          </DropdownMenuItem>
        </ChangePasswordDialog>

        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full text-destructive focus:text-destructive">
              <LogOut className="size-4" />
              Đăng xuất
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
