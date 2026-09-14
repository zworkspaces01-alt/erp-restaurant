"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/types/actions";
import { safeNextPath } from "@/types/restaurant";

const loginSchema = z.object({
  email: z.string().trim().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"),
  next: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export async function signIn(input: LoginInput): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return fail(
      error.message === "Invalid login credentials"
        ? "Email hoặc mật khẩu không đúng"
        : error.message
    );
  }

  revalidatePath("/", "layout");
  // Chờ ngắn để clock giữa GoTrue và PostgREST đồng bộ, tránh lỗi JWT issued at future
  await new Promise((resolve) => setTimeout(resolve, 500));
  // safeNextPath chặn URL tuyệt đối và protocol-relative (`//evil.example`).
  const next = safeNextPath(parsed.data.next);
  return ok({ redirectTo: next });
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
