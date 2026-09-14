"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Send,
  Bot,
  Settings2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getTelegramConfigAction,
  saveTelegramConfigAction,
  sendDailyReportToTelegramAction,
  testTelegramAction,
} from "@/server-actions/telegram.actions";
import { formatDate } from "@/lib/format";
import type { DailyReportSummary, DailyIngredientUsageRow } from "@/lib/queries/reports.queries";
import { formatDailyTelegramReport } from "@/lib/telegram";

interface TelegramReportDialogProps {
  date: string;
  summary: DailyReportSummary;
  ingredients: DailyIngredientUsageRow[];
}

export function TelegramReportDialog({
  date,
  summary,
  ingredients,
}: TelegramReportDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("send");

  // Config states
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);

  // Action states
  const [isPending, startTransition] = useTransition();
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Tải cấu hình khi mở dialog
  useEffect(() => {
    if (open) {
      setIsLoadingConfig(true);
      getTelegramConfigAction()
        .then((res) => {
          if (res.success) {
            setBotToken(res.data.botToken || "");
            setChatId(res.data.chatId || "");
            setEnabled(res.data.enabled);
            setIsConfigured(res.data.isConfigured);
            // Nếu chưa cấu hình thì tự chuyển sang tab Cài đặt
            if (!res.data.isConfigured) {
              setActiveTab("settings");
            }
          }
        })
        .catch(() => {
          toast.error("Không thể tải cấu hình Telegram");
        })
        .finally(() => {
          setIsLoadingConfig(false);
        });
    }
  }, [open]);

  // Tạo nội dung preview
  const previewHtml = formatDailyTelegramReport(
    {
      date,
      summary,
      ingredients,
      trend: [],
    },
    "Nhà hàng"
  );

  // Xử lý gửi báo cáo
  const handleSendReport = () => {
    if (!botToken || !chatId) {
      toast.error("Chưa cấu hình Telegram Bot Token hoặc Chat ID");
      setActiveTab("settings");
      return;
    }

    startTransition(async () => {
      const res = await sendDailyReportToTelegramAction(date, {
        botToken,
        chatId,
      });

      if (res.success) {
        toast.success(`Đã gửi báo cáo ngày ${formatDate(date)} tới Telegram thành công!`, {
          icon: <CheckCircle2 className="size-4 text-emerald-600" />,
        });
        setOpen(false);
      } else {
        toast.error(res.error || "Gửi báo cáo qua Telegram thất bại");
      }
    });
  };

  // Kiểm tra kết nối thử
  const handleTestConnection = async () => {
    if (!botToken.trim()) {
      toast.error("Vui lòng nhập Bot Token trước");
      return;
    }
    if (!chatId.trim()) {
      toast.error("Vui lòng nhập Chat ID trước");
      return;
    }

    setIsTesting(true);
    try {
      const res = await testTelegramAction(botToken, chatId);
      if (res.success) {
        toast.success("Kết nối thành công! Tin nhắn test đã được gửi tới Telegram.");
      } else {
        toast.error(res.error || "Kiểm tra kết nối thất bại.");
      }
    } catch {
      toast.error("Lỗi khi kiểm tra kết nối Telegram");
    } finally {
      setIsTesting(false);
    }
  };

  // Lưu cấu hình
  const handleSaveConfig = async () => {
    if (!botToken.trim() || !chatId.trim()) {
      toast.error("Vui lòng nhập đầy đủ Bot Token và Chat ID");
      return;
    }

    setIsSaving(true);
    try {
      const res = await saveTelegramConfigAction({
        botToken,
        chatId,
        enabled,
      });

      if (res.success) {
        setIsConfigured(true);
        toast.success("Đã lưu cấu hình Telegram thành công!");
        setActiveTab("send");
      } else {
        toast.error(res.error || "Không thể lưu cấu hình");
      }
    } catch {
      toast.error("Lỗi khi lưu cấu hình Telegram");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          className="gap-1.5 text-xs h-8 bg-sky-600 hover:bg-sky-700 text-white shadow-sm"
        >
          <Send className="size-3.5" />
          <span>Gửi Telegram</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Send className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Báo Cáo Hàng Ngày Qua Telegram
              </DialogTitle>
              <DialogDescription className="text-xs">
                Gửi thông tin doanh thu, chi phí COGS, % food cost và nguyên liệu tiêu hao trực tiếp vào điện thoại.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-9">
            <TabsTrigger value="send" className="text-xs gap-1.5">
              <MessageSquare className="size-3.5" />
              <span>Gửi Báo Cáo ({formatDate(date)})</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs gap-1.5">
              <Settings2 className="size-3.5" />
              <span>
                Cài Đặt Bot {isConfigured ? "✓" : "(!)"}
              </span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: GỬI BÁO CÁO */}
          <TabsContent value="send" className="space-y-4 pt-3">
            {!isConfigured && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertCircle className="size-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-semibold">Chưa thiết lập Bot Token hoặc Chat ID</p>
                  <p className="mt-0.5 text-muted-foreground">
                    Vui lòng bấm sang tab <b>Cài Đặt Bot</b> để cấu hình Bot Token và Chat ID trước khi gửi.
                  </p>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-sky-500" />
                  Xem trước bản tin sẽ gửi vào Telegram:
                </span>
                <span className="text-[11px] text-muted-foreground">Định dạng HTML Telegram</span>
              </div>

              {/* Chat bubble preview */}
              <div className="rounded-xl border bg-slate-900 text-slate-100 p-4 font-mono text-xs leading-relaxed max-h-72 overflow-y-auto shadow-inner select-text">
                <div
                  dangerouslySetInnerHTML={{
                    __html: previewHtml
                      .replace(/</g, "&lt;")
                      .replace(/>/g, "&gt;")
                      .replace(/&lt;b&gt;/g, "<strong class='text-white font-bold'>")
                      .replace(/&lt;\/b&gt;/g, "</strong>")
                      .replace(/&lt;i&gt;/g, "<em class='text-slate-400'>")
                      .replace(/&lt;\/i&gt;/g, "</em>")
                      .replace(/&lt;code&gt;/g, "<code class='bg-slate-800 px-1 py-0.5 rounded text-amber-300'>")
                      .replace(/&lt;\/code&gt;/g, "</code>")
                      .replace(/\n/g, "<br/>"),
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                className="text-xs"
              >
                Đóng
              </Button>

              <Button
                type="button"
                size="sm"
                disabled={isPending || isLoadingConfig || !isConfigured}
                onClick={handleSendReport}
                className="bg-sky-600 hover:bg-sky-700 text-white text-xs gap-1.5 min-w-32"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Đang gửi...</span>
                  </>
                ) : (
                  <>
                    <Send className="size-3.5" />
                    <span>Gửi Qua Telegram Ngay</span>
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          {/* TAB 2: CÀI ĐẶT BOT */}
          <TabsContent value="settings" className="space-y-4 pt-3">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="botToken" className="text-xs font-semibold">
                  Telegram Bot Token <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="botToken"
                  type="password"
                  placeholder="VD: 1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  className="font-mono text-xs h-9"
                />
                <p className="text-[11px] text-muted-foreground">
                  Token nhận được khi tạo bot qua{" "}
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-600 dark:text-sky-400 underline inline-flex items-center gap-0.5"
                  >
                    @BotFather <ExternalLink className="size-2.5" />
                  </a>
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="chatId" className="text-xs font-semibold">
                  Telegram Chat ID / Group ID <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="chatId"
                  placeholder="VD: 987654321 hoặc -1001234567890 (nhóm)"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  className="font-mono text-xs h-9"
                />
                <p className="text-[11px] text-muted-foreground">
                  Chat ID cá nhân hoặc nhóm. Tra cứu ID nhanh qua bot{" "}
                  <a
                    href="https://t.me/userinfobot"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-600 dark:text-sky-400 underline inline-flex items-center gap-0.5"
                  >
                    @userinfobot <ExternalLink className="size-2.5" />
                  </a>
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                <div className="space-y-0.5">
                  <Label htmlFor="enableTelegram" className="text-xs font-semibold cursor-pointer">
                    Bật thông báo Telegram
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Cho phép hệ thống gửi báo cáo tự động
                  </p>
                </div>
                <Switch
                  id="enableTelegram"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
              </div>

              {/* Hướng dẫn ngắn */}
              <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-2">
                <p className="font-semibold flex items-center gap-1.5 text-foreground">
                  <Bot className="size-3.5 text-sky-600" />
                  Hướng dẫn cài đặt nhanh trong 1 phút:
                </p>
                <ol className="list-decimal pl-4 space-y-1 text-muted-foreground text-[11px]">
                  <li>
                    Mở Telegram, chat với <b>@BotFather</b>, gõ <code>/newbot</code> và đặt tên bot để lấy <b>Token</b>.
                  </li>
                  <li>
                    Tìm tên bot bạn vừa tạo trên Telegram và bấm <b>Start</b> (để mở quyền nhận tin).
                  </li>
                  <li>
                    Chat với <b>@userinfobot</b> để xem <b>Id</b> của bạn và dán vào ô Chat ID ở trên.
                  </li>
                  <li>
                    Bấm <b>Kiểm tra kết nối</b> để thử nghiệm nhận tin nhắn ngay lập tức.
                  </li>
                  <li>
                    <b>Lập lịch tự động:</b> Có thể gọi endpoint <code>/api/telegram/daily-report</code> lúc 23:00 mỗi ngày để tự động gửi.
                  </li>
                </ol>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isTesting || !botToken || !chatId}
                onClick={handleTestConnection}
                className="text-xs gap-1.5"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Đang kiểm tra...</span>
                  </>
                ) : (
                  <>
                    <Bot className="size-3.5 text-sky-600" />
                    <span>Kiểm tra kết nối</span>
                  </>
                )}
              </Button>

              <Button
                type="button"
                size="sm"
                disabled={isSaving || !botToken || !chatId}
                onClick={handleSaveConfig}
                className="bg-primary text-primary-foreground text-xs gap-1.5"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-3.5" />
                    <span>Lưu Cấu Hình</span>
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
