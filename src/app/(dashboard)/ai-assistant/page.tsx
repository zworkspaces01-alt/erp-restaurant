import { Suspense } from "react";
import { Forbidden } from "@/components/shared";
import { AiAssistantView } from "@/components/ai/ai-assistant-view";
import { requireAuth } from "@/lib/auth";

export const metadata = {
  title: "Trợ lý AI Truy Vấn Dữ Liệu | Restaurant ERP",
  description: "Trợ lý thông minh phân tích số lượng nhập, giá cả và nhà cung cấp nguyên liệu",
};

interface AiAssistantPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function AiAssistantPage({ searchParams }: AiAssistantPageProps) {
  const { role, authorized } = await requireAuth(["owner", "manager", "staff"]);
  if (!authorized) {
    return <Forbidden requiredRoles={["owner", "manager", "staff"]} currentRole={role} />;
  }

  const resolvedParams = await searchParams;
  const initialQuery = resolvedParams.q || "";

  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Đang tải Trợ lý AI...</div>}>
      <AiAssistantView initialQuery={initialQuery} />
    </Suspense>
  );
}
