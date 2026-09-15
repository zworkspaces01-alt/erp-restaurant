"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { assertRole } from "@/lib/auth";
import { fail, ok, type ActionResult } from "@/types/actions";
import type { UserRole } from "@/types/restaurant";

interface DynamicRpcClient {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
}

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

    const supabase = await createClient();
    const dynamicClient = supabase as unknown as DynamicRpcClient;

    // 1. Thử gọi RPC admin_list_users trước
    const { data: rpcUsers, error: rpcError } = await dynamicClient.rpc("admin_list_users");
    if (!rpcError && Array.isArray(rpcUsers)) {
      return ok(
        rpcUsers.map((u: Record<string, unknown>) => ({
          id: String(u.id),
          email: String(u.email || "—"),
          full_name: String(u.full_name || "Người dùng"),
          role: (u.role as UserRole) || "staff",
          created_at: String(u.created_at),
          last_sign_in_at: u.last_sign_in_at ? String(u.last_sign_in_at) : null,
        }))
      );
    }

    // 2. Fallback sang Supabase Service Role Admin Client nếu có key
    try {
      const adminClient = createAdminClient();
      const [{ data: authData, error: authError }, { data: profiles, error: profileError }] =
        await Promise.all([
          adminClient.auth.admin.listUsers(),
          adminClient.from("profiles").select("id, full_name, role"),
        ]);

      if (!authError && !profileError) {
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
      }
    } catch {
      // Bỏ qua nếu service_role key chưa được cấu hình
    }

    // 3. Fallback tối thiểu: lấy từ profiles đã có
    const { data: fallbackProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, role, updated_at");

    if (fallbackProfiles) {
      return ok(
        fallbackProfiles.map((p) => ({
          id: p.id,
          email: "—",
          full_name: p.full_name ?? "Người dùng",
          role: p.role as UserRole,
          created_at: p.updated_at,
          last_sign_in_at: null,
        }))
      );
    }

    return fail("Không thể lấy danh sách người dùng.");
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

    const supabase = await createClient();
    const dynamicClient = supabase as unknown as DynamicRpcClient;

    // 1. Ưu tiên gọi database RPC admin_create_user (chạy qua session owner)
    const { data: rpcId, error: rpcError } = await dynamicClient.rpc("admin_create_user", {
      p_email: parsed.data.email,
      p_password: parsed.data.password,
      p_full_name: parsed.data.fullName,
      p_role: parsed.data.role,
    });

    if (!rpcError && rpcId) {
      revalidatePath("/settings/users");
      return ok({ id: String(rpcId) });
    }

    // Nếu lỗi là do email đã tồn tại, trả lỗi ngay
    if (rpcError && rpcError.message.includes("EMAIL_EXISTS")) {
      return fail("Email này đã được sử dụng trong hệ thống.");
    }

    // 2. Thử fallback sang Supabase Admin Client nếu có SUPABASE_SERVICE_ROLE_KEY
    try {
      const adminClient = createAdminClient();
      const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
        email: parsed.data.email,
        password: parsed.data.password,
        email_confirm: true,
        user_metadata: { full_name: parsed.data.fullName },
      });

      if (!createError && userData.user) {
        await adminClient.from("profiles").upsert({
          id: userData.user.id,
          full_name: parsed.data.fullName,
          role: parsed.data.role,
          updated_at: new Date().toISOString(),
        });

        revalidatePath("/settings/users");
        return ok({ id: userData.user.id });
      }

      if (createError && !createError.message.includes("Invalid API key")) {
        return fail(`Không thể tạo tài khoản: ${createError.message}`);
      }
    } catch {
      // service role key không hợp lệ hoặc chưa cấu hình
    }

    // 3. Hướng dẫn người dùng khi cả RPC và Admin API đều chưa được cấu hình
    return fail(
      "Chưa cấu hình SUPABASE_SERVICE_ROLE_KEY hoặc chưa chạy SQL RPC quản trị. Vui lòng chạy phần 20 trong file cloud_schema_full.sql trên Supabase SQL Editor, hoặc thêm SUPABASE_SERVICE_ROLE_KEY vào file .env.local."
    );
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

    // Thử cập nhật qua Admin Client nếu có key
    try {
      const adminClient = createAdminClient();
      const { error } = await adminClient
        .from("profiles")
        .update({ role: parsed.data.newRole, updated_at: new Date().toISOString() })
        .eq("id", parsed.data.userId);

      if (!error) {
        revalidatePath("/settings/users");
        revalidatePath("/", "layout");
        return ok(null);
      }
    } catch {
      // Thử cập nhật trực tiếp qua session
    }

    const supabase = await createClient();
    const { error } = await supabase
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

    const supabase = await createClient();
    const dynamicClient = supabase as unknown as DynamicRpcClient;

    // 1. Thử gọi RPC admin_reset_user_password trước
    const { error: rpcError } = await dynamicClient.rpc("admin_reset_user_password", {
      p_user_id: parsed.data.userId,
      p_new_password: parsed.data.newPassword,
    });

    if (!rpcError) {
      return ok(null);
    }

    // 2. Thử qua Admin Client
    try {
      const adminClient = createAdminClient();
      const { error } = await adminClient.auth.admin.updateUserById(parsed.data.userId, {
        password: parsed.data.newPassword,
      });

      if (!error) {
        return ok(null);
      }
    } catch {
      // bỏ qua
    }

    return fail("Không thể đặt lại mật khẩu. Vui lòng kiểm tra quyền hoặc chạy SQL RPC.");
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

    const supabase = await createClient();
    const dynamicClient = supabase as unknown as DynamicRpcClient;

    // 1. Thử gọi RPC admin_delete_user
    const { error: rpcError } = await dynamicClient.rpc("admin_delete_user", {
      p_user_id: parsed.data.userId,
    });

    if (!rpcError) {
      revalidatePath("/settings/users");
      return ok(null);
    }

    // 2. Thử qua Admin Client
    try {
      const adminClient = createAdminClient();
      const { error } = await adminClient.auth.admin.deleteUser(parsed.data.userId);

      if (!error) {
        revalidatePath("/settings/users");
        return ok(null);
      }
    } catch {
      // bỏ qua
    }

    return fail("Không thể xóa tài khoản. Vui lòng kiểm tra quyền hoặc chạy SQL RPC.");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định";
    return fail(message);
  }
}
