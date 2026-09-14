import type { Metadata } from "next";
import { ChefHat } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeNextPath } from "@/types/restaurant";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Chặn open redirect: chỉ nhận đường dẫn nội bộ `/...` (không nhận `//evil.example`).
  const safeNext = safeNextPath(next);

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ChefHat className="size-5" />
          </span>
          <CardTitle>Restaurant ERP</CardTitle>
          <CardDescription>Đăng nhập để quản trị nhà hàng</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={safeNext} />
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Tài khoản SuperAdmin: superadmin@restaurant.com / SuperAdmin@2026!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
