"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertRole } from "@/lib/auth";
import { fail, ok, type ActionResult } from "@/types/actions";
import type { UserRole } from "@/types/restaurant";

export interface UserAccountItem {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
  last_sign_in_at: string | null;
}

/** Lấy danh sách tài khoản người dùng và vai trò (chỉ owner) */
export async function getUsersList(): Promise<ActionResult<UserAccountItem[]>> {
  try {
    await assertRole(["owner"]);

    const adminClient = createAdminClient();
    const [{ data: authData, error: authError }, { data: profiles, error: profileError }] =
      await Promise.all([
        adminClient.auth.admin.listUsers(),
        adminClient.from("profiles").select("id, full_name, role"),
      ]);

    if (authError) {
      return fail(`Lỗi lấy danh sách tài khoản: ${authError.message}`);
    }

    if (profileError) {
      return fail(`Lỗi lấy danh sách hồ sơ: ${profileError.message}`);
    }

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    const users: UserAccountItem[] = (authData.users ?? []).map((u) => {
      const p = profileMap.get(u.id);
      const metaName = (u.user_metadata as { full_name?: string } | null)?.full_name;
      return {
        id: u.id,
        email: u.email ?? "—",
        full_name: p?.full_name ?? metaName ?? "Người dùng",
        role: (p?.role as UserRole) ?? "staff",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      };
    });

    return ok(users);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi hệ thống";
    return fail(message);
  }
}

const createUserSchema = z.object({
  email: z.string().trim().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"),
  fullName: z.string().trim().min(1, "Vui lòng nhập họ tên"),
  role: z.enum(["owner", "manager", "staff"]),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Tạo tài khoản mới và gán vai trò (chỉ owner) */
export async function createUserAction(input: CreateUserInput): Promise<ActionResult<{ id: string }>> {
  try {
    await assertRole(["owner"]);

    const parsed = createUserSchema.safeParse(input);
    if (!parsed.success) {
      return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
    }

    const adminClient = createAdminClient();
    const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.fullName },
    });

    if (createError) {
      return fail(`Không thể tạo tài khoản: ${createError.message}`);
    }

    if (!userData.user) {
      return fail("Không tạo được người dùng");
    }

    // Cập nhật hoặc chèn hồ sơ profile với role chỉ định
    const { error: profileError } = await adminClient.from("profiles").upsert({
      id: userData.user.id,
      full_name: parsed.data.fullName,
      role: parsed.data.role,
      updated_at: new Date().toISOString(),
    });

    if (profileError) {
      return fail(`Tạo tài khoản thành công nhưng gán vai trò thất bại: ${profileError.message}`);
    }

    revalidatePath("/settings/users");
    return ok({ id: userData.user.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định";
    return fail(message);
  }
}

const updateRoleSchema = z.object({
  userId: z.string().uuid("ID người dùng không hợp lệ"),
  newRole: z.enum(["owner", "manager", "staff"]),
});

/** Đổi vai trò tài khoản (chỉ owner) */
export async function updateUserRoleAction(input: z.infer<typeof updateRoleSchema>): Promise<ActionResult<null>> {
  try {
    const session = await assertRole(["owner"]);

    const parsed = updateRoleSchema.safeParse(input);
    if (!parsed.success) {
      return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
    }

    if (parsed.data.userId === session.user.id && parsed.data.newRole !== "owner") {
      return fail("Bạn không thể tự hạ quyền vai trò Owner của chính mình.");
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("profiles")
      .update({ role: parsed.data.newRole, updated_at: new Date().toISOString() })
      .eq("id", parsed.data.userId);

    if (error) {
      return fail(`Lỗi cập nhật vai trò: ${error.message}`);
    }

    revalidatePath("/settings/users");
    revalidatePath("/", "layout");
    return ok(null);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định";
    return fail(message);
  }
}

const resetPasswordSchema = z.object({
  userId: z.string().uuid("ID người dùng không hợp lệ"),
  newPassword: z.string().min(6, "Mật khẩu mới tối thiểu 6 ký tự"),
});

/** Đặt lại mật khẩu tài khoản nhân viên (chỉ owner) */
export async function resetUserPasswordAction(
  input: z.infer<typeof resetPasswordSchema>
): Promise<ActionResult<null>> {
  try {
    await assertRole(["owner"]);

    const parsed = resetPasswordSchema.safeParse(input);
    if (!parsed.success) {
      return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient.auth.admin.updateUserById(parsed.data.userId, {
      password: parsed.data.newPassword,
    });

    if (error) {
      return fail(`Lỗi đặt lại mật khẩu: ${error.message}`);
    }

    return ok(null);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định";
    return fail(message);
  }
}

const deleteUserSchema = z.object({
  userId: z.string().uuid("ID người dùng không hợp lệ"),
});

/** Xóa tài khoản (chỉ owner) */
export async function deleteUserAction(input: z.infer<typeof deleteUserSchema>): Promise<ActionResult<null>> {
  try {
    const session = await assertRole(["owner"]);

    const parsed = deleteUserSchema.safeParse(input);
    if (!parsed.success) {
      return fail("Dữ liệu không hợp lệ");
    }

    if (parsed.data.userId === session.user.id) {
      return fail("Bạn không thể xóa tài khoản của chính mình.");
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient.auth.admin.deleteUser(parsed.data.userId);

    if (error) {
      return fail(`Lỗi xóa người dùng: ${error.message}`);
    }

    revalidatePath("/settings/users");
    return ok(null);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định";
    return fail(message);
  }
}
