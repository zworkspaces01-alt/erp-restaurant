import { Forbidden, PageHeader } from "@/components/shared";
import { AiSettingsManager } from "@/components/settings/ai/ai-settings-manager";
import { getAiSettingsAction } from "@/server-actions/ai-settings.actions";
import { requireAuth } from "@/lib/auth";

export const metadata = {
  title: "Cài đặt AI & Đảo API Keys | Restaurant ERP",
};

export default async function AiSettingsPage() {
  const { role, authorized } = await requireAuth(["owner", "manager"]);
  if (!authorized) {
    return <Forbidden requiredRoles={["owner", "manager"]} currentRole={role} />;
  }

  const result = await getAiSettingsAction();
  const initialConfig = result.success
    ? result.data
    : {
        keys: [],
        rotationStrategy: "round_robin" as const,
        autoRotateOnRateLimit: true,
        primaryProvider: "auto" as const,
      };

  const canEdit = role === "owner";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cài đặt AI & Đảo API Keys"
        description="Quản lý danh sách API Key (Groq, Google Gemini), thiết lập cơ chế tự động xoay vòng và cân bằng tải khi quét hóa đơn."
        breadcrumbs={[
          { label: "Hệ thống", href: "/settings/users" },
          { label: "Cài đặt AI & API Keys" },
        ]}
      />

      <AiSettingsManager initialConfig={initialConfig} canEdit={canEdit} />
    </div>
  );
}
