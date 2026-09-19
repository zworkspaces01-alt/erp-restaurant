"use client";

import { useState, useTransition } from "react";
import {
  Bot,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  saveAiSettingsAction,
  testAiKeyAction,
} from "@/server-actions/ai-settings.actions";
import type {
  AiKeyItem,
  AiProvider,
  AiSettingsConfig,
  KeyTestResult,
} from "@/types/ai-settings";
import { maskApiKey } from "@/types/ai-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface AiSettingsManagerProps {
  initialConfig: AiSettingsConfig;
  canEdit: boolean;
}

export function AiSettingsManager({
  initialConfig,
  canEdit,
}: AiSettingsManagerProps) {
  const [config, setConfig] = useState<AiSettingsConfig>(initialConfig);
  const [isPending, startTransition] = useTransition();
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, KeyTestResult>>({});
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});

  // Form thêm API key mới
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newProvider, setNewProvider] = useState<AiProvider>("groq");
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [isTestingNew, setIsTestingNew] = useState(false);

  // Thống kê
  const activeKeys = config.keys.filter((k) => k.status === "active");
  const groqCount = config.keys.filter((k) => k.provider === "groq" && k.status === "active").length;
  const geminiCount = config.keys.filter((k) => k.provider === "gemini" && k.status === "active").length;

  const handleToggleKey = (id: string) => {
    if (!canEdit) return;
    setConfig((prev) => ({
      ...prev,
      keys: prev.keys.map((k) =>
        k.id === id
          ? { ...k, status: k.status === "active" ? "paused" : "active" }
          : k
      ),
    }));
  };

  const handleDeleteKey = (id: string) => {
    if (!canEdit) return;
    setConfig((prev) => ({
      ...prev,
      keys: prev.keys.filter((k) => k.id !== id),
    }));
    toast.info("Đã xóa key khỏi danh sách. Hãy bấm 'Lưu thay đổi' để hoàn tất.");
  };

  const handleTestKey = async (item: AiKeyItem) => {
    setTestingKeyId(item.id);
    try {
      const res = await testAiKeyAction(item.provider, item.key);
      if (res.success) {
        setTestResults((prev) => ({ ...prev, [item.id]: res.data }));
        if (res.data.success) {
          toast.success(`[${item.name}] ${res.data.message}`);
        } else {
          toast.error(`[${item.name}] ${res.data.message}`);
        }
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("Không thể gửi yêu cầu kiểm tra API key.");
    } finally {
      setTestingKeyId(null);
    }
  };

  const handleAddKey = async () => {
    if (!newKey.trim()) {
      toast.error("Vui lòng nhập API Key.");
      return;
    }

    const trimmedKey = newKey.trim();
    const label =
      newName.trim() ||
      `${newProvider.toUpperCase()} Key #${config.keys.filter((k) => k.provider === newProvider).length + 1}`;

    const newId = `key-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Tự động test trước khi thêm
    setIsTestingNew(true);
    try {
      const res = await testAiKeyAction(newProvider, trimmedKey);
      if (res.success && res.data.success) {
        toast.success(`Xác thực thành công! ${res.data.message}`);
      } else {
        toast.warning(
          `Cảnh báo: ${res.success ? res.data.message : res.error}. Vẫn thêm vào danh sách.`
        );
      }
    } catch {
      // Bỏ qua lỗi test mạng
    } finally {
      setIsTestingNew(false);
    }

    const newItem: AiKeyItem = {
      id: newId,
      provider: newProvider,
      name: label,
      key: trimmedKey,
      status: "active",
      isEnvKey: false,
    };

    setConfig((prev) => ({
      ...prev,
      keys: [...prev.keys, newItem],
    }));

    setNewKey("");
    setNewName("");
    setIsAddOpen(false);
    toast.success(`Đã thêm "${label}". Hãy bấm "Lưu thay đổi" để áp dụng cho toàn hệ thống.`);
  };

  const handleSave = () => {
    startTransition(async () => {
      const res = await saveAiSettingsAction(config);
      if (res.success) {
        toast.success("Đã lưu cấu hình AI & Danh sách API Keys thành công!");
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Save Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-4 rounded-xl border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
            <RefreshCw className="size-6 animate-spin-slow text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Cơ chế tự động đảo API Key liên tục</h2>
            <p className="text-xs text-muted-foreground">
              Hệ thống tự động xoay vòng giữa các API Key (Groq / Gemini) khi quét hóa đơn &amp; nguyên liệu để không bao giờ bị gián đoạn do hết quota.
            </p>
          </div>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSave}
              disabled={isPending}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Lưu thay đổi
            </Button>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Tổng Key đang kích hoạt
            </CardTitle>
            <KeyRound className="size-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {activeKeys.length} <span className="text-xs text-muted-foreground font-normal">/ {config.keys.length} key</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Sẵn sàng luân phiên phục vụ</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Groq Vision (Siêu Tốc)
            </CardTitle>
            <Zap className="size-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {groqCount} <span className="text-xs text-muted-foreground font-normal">key hoạt động</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Model qwen3.8-27b (200k tokens/key/ngày)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Google Gemini (Dung Lượng Lớn)
            </CardTitle>
            <Sparkles className="size-4 text-sky-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-sky-600 dark:text-sky-400">
              {geminiCount} <span className="text-xs text-muted-foreground font-normal">key hoạt động</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Miễn phí 1.500 lượt quét/key/ngày</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Chế độ xoay vòng
            </CardTitle>
            <Bot className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-base font-bold text-primary flex items-center gap-1.5 mt-0.5">
              <CheckCircle2 className="size-4 text-emerald-500" />
              {config.rotationStrategy === "round_robin" ? "Round-Robin Đều" : "Ưu Tiên Failover"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {config.autoRotateOnRateLimit ? "Tự động đổi key khi 429" : "Không tự động đảo"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Rotation Settings & Options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="size-5 text-primary" /> Cấu hình luân phiên &amp; Đảo API Key
          </CardTitle>
          <CardDescription>
            Thiết lập cách hệ thống phân bổ lượt quét hóa đơn giữa các tài khoản AI khác nhau.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex items-center justify-between space-x-3 p-3.5 rounded-lg border bg-muted/30">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Tự động đảo Key khi chạm Rate Limit (429)</Label>
                <p className="text-xs text-muted-foreground">
                  Khi 1 key chạm trần ngày (TPD), ngay lập tức chuyển sang key tiếp theo mà không làm gián đoạn người dùng.
                </p>
              </div>
              <Switch
                checked={config.autoRotateOnRateLimit}
                disabled={!canEdit}
                onCheckedChange={(checked: boolean) =>
                  setConfig((prev) => ({ ...prev, autoRotateOnRateLimit: checked }))
                }
              />
            </div>

            <div className="flex items-center justify-between space-x-3 p-3.5 rounded-lg border bg-muted/30">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Cân bằng tải Round-Robin (Luân phiên đều)</Label>
                <p className="text-xs text-muted-foreground">
                  Mỗi lần bấm quét sẽ dùng lần lượt từng key, giúp chia đều số token và tránh bị dồn hết quota vào 1 key duy nhất.
                </p>
              </div>
              <Switch
                checked={config.rotationStrategy === "round_robin"}
                disabled={!canEdit}
                onCheckedChange={(checked: boolean) =>
                  setConfig((prev) => ({
                    ...prev,
                    rotationStrategy: checked ? "round_robin" : "failover",
                  }))
                }
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2 border-t">
            <div>
              <Label className="text-sm font-medium">Nhà cung cấp ưu tiên mặc định</Label>
              <p className="text-xs text-muted-foreground">
                Hệ thống sẽ gọi nhà cung cấp này trước, nếu tất cả key của nhà cung cấp này hết lượt mới chuyển sang hãng khác.
              </p>
            </div>
            <Select
              value={config.primaryProvider}
              disabled={!canEdit}
              onValueChange={(val: AiProvider | "auto") =>
                setConfig((prev) => ({ ...prev, primaryProvider: val }))
              }
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Chọn nhà cung cấp" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Tự động thông minh</SelectItem>
                <SelectItem value="groq">Groq (Siêu Tốc)</SelectItem>
                <SelectItem value="gemini">Google Gemini (Dung lượng lớn)</SelectItem>
                <SelectItem value="openai">OpenAI (GPT-4o-mini)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Keys List */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="size-5 text-primary" /> Danh sách API Key ({config.keys.length})
            </CardTitle>
            <CardDescription>
              Bạn có thể thêm không giới hạn các API Key từ nhiều tài khoản Groq và Google Gemini khác nhau.
            </CardDescription>
          </div>

          {canEdit && (
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button className="gap-1.5 shadow-sm">
                  <Plus className="size-4" /> Thêm API Key mới
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle>Thêm API Key vào Pool</DialogTitle>
                  <DialogDescription>
                    Điền API Key mới. Hệ thống sẽ tự động xác thực kết nối trước khi lưu.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Nhà cung cấp AI</Label>
                    <Select
                      value={newProvider}
                      onValueChange={(val: AiProvider) => setNewProvider(val)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="groq">Groq Cloud (gsk_...)</SelectItem>
                        <SelectItem value="gemini">Google Gemini / AI Studio (AIza...)</SelectItem>
                        <SelectItem value="openai">OpenAI (sk-...)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Tên gợi nhớ</Label>
                    <Input
                      placeholder="Ví dụ: Groq Tài khoản 2, Gemini AI Studio..."
                      value={newName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <Input
                      type="password"
                      placeholder={
                        newProvider === "groq"
                          ? "gsk_..."
                          : newProvider === "gemini"
                          ? "AIzaSy..."
                          : "sk-..."
                      }
                      value={newKey}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewKey(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsAddOpen(false)}
                    disabled={isTestingNew}
                  >
                    Hủy
                  </Button>
                  <Button onClick={handleAddKey} disabled={isTestingNew} className="gap-2">
                    {isTestingNew && <Loader2 className="size-4 animate-spin" />}
                    Kiểm tra &amp; Thêm vào Pool
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>

        <CardContent>
          {config.keys.length === 0 ? (
            <div className="text-center py-10 border border-dashed rounded-xl bg-muted/10">
              <KeyRound className="size-10 mx-auto text-muted-foreground/50 mb-3" />
              <h3 className="font-medium text-sm">Chưa có API Key nào được cấu hình</h3>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Thêm ít nhất 1 API Key Groq hoặc Gemini để kích hoạt tính năng quét AI hóa đơn.
              </p>
              {canEdit && (
                <Button onClick={() => setIsAddOpen(true)} className="gap-1.5 text-xs">
                  <Plus className="size-3.5" /> Thêm Key đầu tiên
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {config.keys.map((item, index) => {
                const isRevealed = Boolean(revealedKeys[item.id]);
                const isTesting = testingKeyId === item.id;
                const testRes = testResults[item.id];
                const isRateLimited = item.status === "rate_limited";
                const isPaused = item.status === "paused";

                return (
                  <div
                    key={item.id || index}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                      isRateLimited
                        ? "border-amber-500/40 bg-amber-500/[0.03]"
                        : isPaused
                        ? "opacity-60 bg-muted/20 border-dashed"
                        : "bg-card hover:border-primary/40 shadow-sm"
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div className="p-2 rounded-lg shrink-0 mt-0.5 sm:mt-0 bg-muted">
                        {item.provider === "groq" && (
                          <Zap className="size-5 text-amber-500" />
                        )}
                        {item.provider === "gemini" && (
                          <Sparkles className="size-5 text-sky-500" />
                        )}
                        {item.provider === "openai" && (
                          <Bot className="size-5 text-emerald-500" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate">{item.name}</span>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] uppercase font-bold ${
                              item.provider === "groq"
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                : item.provider === "gemini"
                                ? "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30"
                                : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                            }`}
                          >
                            {item.provider}
                          </Badge>

                          {item.isEnvKey && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              .env
                            </Badge>
                          )}

                          {isRateLimited && (
                            <Badge variant="destructive" className="text-[10px] gap-1">
                              <ShieldAlert className="size-3" /> Đang Cooldown 429
                            </Badge>
                          )}

                          {isPaused && (
                            <Badge variant="secondary" className="text-[10px]">
                              Tạm dừng
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-xs font-mono text-muted-foreground">
                            {isRevealed ? item.key : maskApiKey(item.key)}
                          </code>
                          <button
                            type="button"
                            onClick={() =>
                              setRevealedKeys((prev) => ({
                                ...prev,
                                [item.id]: !prev[item.id],
                              }))
                            }
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title={isRevealed ? "Ẩn key" : "Hiện key"}
                          >
                            {isRevealed ? (
                              <EyeOff className="size-3.5" />
                            ) : (
                              <Eye className="size-3.5" />
                            )}
                          </button>
                        </div>

                        {testRes && (
                          <div
                            className={`text-xs mt-1.5 flex items-center gap-1 font-medium ${
                              testRes.success ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            {testRes.success ? (
                              <CheckCircle2 className="size-3.5 shrink-0" />
                            ) : (
                              <ShieldAlert className="size-3.5 shrink-0" />
                            )}
                            <span>{testRes.message}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 w-full sm:w-auto justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isTesting}
                        onClick={() => handleTestKey(item)}
                        className="h-8 text-xs gap-1.5"
                      >
                        {isTesting ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="size-3.5" />
                        )}
                        Kiểm tra
                      </Button>

                      {canEdit && (
                        <>
                          <Button
                            size="sm"
                            variant={isPaused ? "secondary" : "ghost"}
                            onClick={() => handleToggleKey(item.id)}
                            className="h-8 text-xs"
                          >
                            {isPaused ? "Kích hoạt" : "Tạm dừng"}
                          </Button>

                          {!item.isEnvKey && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteKey(item.id)}
                              className="h-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 px-2"
                              title="Xóa key này"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Guide: Where to get Free Keys */}
      <Card className="border-dashed bg-muted/20">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ExternalLink className="size-4 text-primary" /> Hướng dẫn lấy API Key Miễn Phí (Khuyên dùng)
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2.5">
          <div className="flex items-start gap-2">
            <Zap className="size-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <strong className="text-foreground">Groq Cloud (Siêu Tốc):</strong> Truy cập{" "}
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline font-medium inline-flex items-center gap-0.5"
              >
                console.groq.com/keys <ExternalLink className="size-3" />
              </a>
              , đăng nhập và tạo API Key miễn phí (bắt đầu bằng <code className="font-mono text-foreground">gsk_...</code>). Bạn có thể đăng ký nhiều tài khoản Gmail để lấy nhiều key add vào pool.
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Sparkles className="size-4 text-sky-500 shrink-0 mt-0.5" />
            <div>
              <strong className="text-foreground">Google Gemini (Dung Lượng Cực Lớn):</strong> Truy cập{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline font-medium inline-flex items-center gap-0.5"
              >
                aistudio.google.com/apikey <ExternalLink className="size-3" />
              </a>
              , bấm &quot;Create API Key&quot; (bắt đầu bằng <code className="font-mono text-foreground">AIzaSy...</code>). Hạn mức miễn phí lên tới <strong>1.500 lượt quét/ngày</strong> mỗi tài khoản.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
