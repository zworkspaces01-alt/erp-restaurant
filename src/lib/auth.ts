import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/restaurant";
import type { User } from "@supabase/supabase-js";

export interface UserProfile {
  id: string;
  full_name: string | null;
  role: UserRole;
}

export interface CurrentUserSession {
  user: User;
  profile: UserProfile;
  role: UserRole;
}

/**
 * Lấy user hiện tại cùng profile và role từ Supabase session.
 * Trả về null nếu chưa đăng nhập.
 */
export async function getCurrentUserWithRole(): Promise<CurrentUserSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  const meta = user.user_metadata as { full_name?: string } | null;
  const resolvedRole: UserRole = (profile?.role as UserRole) || "staff";

  return {
    user,
    profile: {
      id: user.id,
      full_name: profile?.full_name ?? meta?.full_name ?? null,
      role: resolvedRole,
    },
    role: resolvedRole,
  };
}

/**
 * Guard kiểm tra quyền cho Server Components (Page).
 * Chuyển hướng về `/login` nếu chưa đăng nhập.
 * Trả về thông tin session kèm cờ `authorized` đối chiếu với danh sách `allowedRoles`.
 */
export async function requireAuth(allowedRoles?: UserRole[]) {
  const session = await getCurrentUserWithRole();

  if (!session) {
    redirect("/login");
  }

  const isAuthorized = !allowedRoles || allowedRoles.includes(session.role);

  return {
    ...session,
    authorized: isAuthorized,
  };
}

/**
 * Guard kiểm tra quyền cho Server Actions.
 * Trả về session nếu hợp lệ; ném lỗi nếu chưa đăng nhập hoặc không đủ quyền.
 */
export async function assertRole(allowedRoles: UserRole[]): Promise<CurrentUserSession> {
  const session = await getCurrentUserWithRole();

  if (!session) {
    throw new Error("UNAUTHENTICATED: Vui lòng đăng nhập để tiếp tục.");
  }

  if (!allowedRoles.includes(session.role)) {
    throw new Error("PERMISSION_DENIED: Bạn không có quyền thực hiện thao tác này.");
  }

  return session;
}
