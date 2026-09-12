import type { Metadata } from "next";
import { ChefHat } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

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
          <LoginForm next={next} />
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Tài khoản demo: admin@restaurant.local / Admin@123
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
