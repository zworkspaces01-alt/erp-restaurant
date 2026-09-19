"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Bot,
  Send,
  Sparkles,
  Trash2,
  Calendar,
  Receipt,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatVND } from "@/lib/format";
import { askAiAssistantAction } from "@/server-actions/ai-assistant.actions";
import type { AiAssistantQueryResult } from "@/lib/ai/ai-query-engine";

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  createdAt: string;
  resultData?: AiAssistantQueryResult;
  error?: boolean;
}

const SAMPLE_QUESTIONS = [
  "Tháng vừa rồi nguyên liệu Trứng gà tươi nhập số lượng thế nào?",
  "Tháng vừa qua nguyên liệu nào nhập tốn tiền nhất (Top chi phí)?",
  "Tháng này đã nhập bao nhiêu Nước soda SINGHA?",
  "Giá nhập gần nhất của Kem Cam YUZU là bao nhiêu?",
  "Đậu nành Edamame nhập từ những nhà cung cấp nào?",
];

function formatMarkdownText(text: string) {
  // Simple clean markdown renderer for paragraphs, bold, lists
  const lines = text.split("\n");
  return lines.map((line, idx) => {
    let content = line;
    const isBullet = line.trim().startsWith("- ") || line.trim().startsWith("* ");
    if (isBullet) {
      content = line.trim().replace(/^[-*]\s+/, "");
    }

    // Process bold **text**
    const parts = content.split(/(\*\*.*?\*\*)/g);

    const renderedParts = parts.map((part, pIdx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={pIdx} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });

    if (isBullet) {
      return (
        <li key={idx} className="ml-4 list-disc text-sm text-muted-foreground my-1 leading-relaxed">
          {renderedParts}
        </li>
      );
    }

    if (!line.trim()) {
      return <div key={idx} className="h-2" />;
    }

    return (
      <p key={idx} className="text-sm text-foreground/90 my-1.5 leading-relaxed">
        {renderedParts}
      </p>
    );
  });
}

export function AiAssistantView({ initialQuery }: { initialQuery?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState(initialQuery || "");
  const [isPending, setIsPending] = useState(false);
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isPending]);

  const handleSendMessage = useCallback(async (textToSend?: string) => {
    const query = (textToSend || inputValue).trim();
    if (!query || isPending) return;

    const userMsgId = `user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: "user",
      text: query,
      createdAt: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputValue("");
    setIsPending(true);

    try {
      const res = await askAiAssistantAction(query);

      if (!res.success) {
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            sender: "ai",
            text: res.error || "Không thể xử lý câu hỏi vào lúc này.",
            createdAt: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
            error: true,
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: "ai",
          text: res.data.answer,
          createdAt: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
          resultData: res.data,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: "ai",
          text: err instanceof Error ? err.message : "Đã có lỗi xảy ra.",
          createdAt: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
          error: true,
        },
      ]);
    } finally {
      setIsPending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [inputValue, isPending]);

  // Nếu có initialQuery từ query parameter (?q=...), tự động gửi câu hỏi
  useEffect(() => {
    if (initialQuery) {
      handleSendMessage(initialQuery);
    }
  }, [initialQuery, handleSendMessage]);

  const toggleTable = (msgId: string) => {
    setExpandedTables((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const clearChat = () => {
    setMessages([]);
    setInputValue("");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] max-w-5xl mx-auto px-2 sm:px-4 pb-2">
      {/* Header bar */}
      <div className="flex items-center justify-between py-3 border-b mb-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Sparkles className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight">Trợ lý AI Truy Vấn Dữ Liệu</h1>
              <Badge variant="outline" className="text-[11px] bg-primary/5 text-primary border-primary/20 font-medium">
                Data Analytics
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Tra cứu số lượng nhập, đơn giá, nhà cung cấp & chi phí theo mốc thời gian tự nhiên
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={clearChat} disabled={messages.length === 0} className="text-xs h-8">
            <Trash2 className="size-3.5 mr-1 text-muted-foreground" />
            Làm mới hội thoại
          </Button>
          <Link href="/settings/ai">
            <Button variant="ghost" size="sm" className="text-xs h-8 text-muted-foreground hover:text-foreground">
              Cấu hình API Key
            </Button>
          </Link>
        </div>
      </div>

      {/* Main chat messages container */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-6">
            <div className="size-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
              <Bot className="size-8" />
            </div>
            <div className="max-w-md space-y-2">
              <h2 className="text-base font-semibold">Chào bạn! Tôi có thể giúp gì về dữ liệu nhập hàng?</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Hệ thống AI kết nối trực tiếp với cơ sở dữ liệu phiếu nhập, tự động tính toán tổng số lượng, đơn giá bình quân và nhà cung ứng theo thời gian thực.
              </p>
            </div>

            {/* Quick Suggestions */}
            <div className="w-full max-w-xl text-left space-y-2">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 px-1">
                <Sparkles className="size-3.5 text-primary" />
                <span>Gợi ý câu hỏi nhanh:</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SAMPLE_QUESTIONS.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(q)}
                    className="text-left text-xs p-3 rounded-lg border border-border/80 bg-card hover:bg-muted/60 hover:border-primary/40 transition-all flex items-start gap-2 group"
                  >
                    <ArrowRight className="size-3.5 text-muted-foreground group-hover:text-primary mt-0.5 shrink-0 transition-colors" />
                    <span className="text-foreground/90 group-hover:text-foreground">{q}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="space-y-2">
              {msg.sender === "user" ? (
                /* User Message */
                <div className="flex justify-end">
                  <div className="max-w-[85%] sm:max-w-lg rounded-2xl rounded-tr-xs bg-primary text-primary-foreground px-4 py-2.5 shadow-sm">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    <span className="text-[10px] text-primary-foreground/70 block text-right mt-1">
                      {msg.createdAt}
                    </span>
                  </div>
                </div>
              ) : (
                /* AI Message */
                <div className="flex gap-3 max-w-full">
                  <div className="size-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-sm">
                    <Sparkles className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="rounded-2xl rounded-tl-xs border bg-card/80 backdrop-blur-xs p-4 shadow-sm space-y-3">
                      {/* Meta header */}
                      <div className="flex items-center justify-between border-b pb-2 text-[11px] text-muted-foreground">
                        <span className="font-medium flex items-center gap-1.5 text-foreground">
                          Trợ lý ERP
                          {msg.resultData?.parameters.resolvedPeriodLabel && (
                            <Badge variant="secondary" className="text-[10px] font-normal py-0 h-4">
                              <Calendar className="size-2.5 mr-1" />
                              {msg.resultData.parameters.resolvedPeriodLabel}
                            </Badge>
                          )}
                        </span>
                        {msg.resultData?.providerUsed && (
                          <span className="text-[10px] opacity-75">{msg.resultData.providerUsed}</span>
                        )}
                      </div>

                      {/* Explanation Markdown text */}
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        {formatMarkdownText(msg.text)}
                      </div>

                      {/* Metric Cards if present */}
                      {msg.resultData?.metrics && msg.resultData.metrics.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                          {msg.resultData.metrics.map((m, mIdx) => (
                            <div
                              key={mIdx}
                              className="p-2.5 rounded-lg border bg-muted/40 flex flex-col justify-between space-y-1"
                            >
                              <span className="text-[11px] text-muted-foreground truncate">{m.label}</span>
                              <span className="text-sm sm:text-base font-bold text-foreground truncate">
                                {m.value}
                              </span>
                              {m.subtext && (
                                <span className="text-[10px] text-muted-foreground/80 truncate">
                                  {m.subtext}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Data Table Breakdown (Collapsible) */}
                      {msg.resultData?.summaries && msg.resultData.summaries.length > 0 && (
                        <div className="pt-2 border-t space-y-2">
                          <button
                            type="button"
                            onClick={() => toggleTable(msg.id)}
                            className="w-full flex items-center justify-between text-xs font-medium text-primary hover:underline py-1"
                          >
                            <span className="flex items-center gap-1.5">
                              <Receipt className="size-3.5" />
                              Xem bảng chi tiết các lần nhập thực tế (
                              {msg.resultData.summaries[0].items.length} phiếu)
                            </span>
                            {expandedTables[msg.id] ? (
                              <ChevronUp className="size-4" />
                            ) : (
                              <ChevronDown className="size-4" />
                            )}
                          </button>

                          {expandedTables[msg.id] && (
                            <div className="rounded-lg border overflow-hidden text-xs">
                              <div className="overflow-x-auto max-h-64">
                                <table className="w-full text-left border-collapse">
                                  <thead className="bg-muted text-muted-foreground font-medium sticky top-0">
                                    <tr>
                                      <th className="p-2">Ngày nhập</th>
                                      <th className="p-2">Số phiếu</th>
                                      <th className="p-2">Nhà cung cấp</th>
                                      <th className="p-2 text-right">SL</th>
                                      <th className="p-2">ĐVT</th>
                                      <th className="p-2 text-right">Đơn giá</th>
                                      <th className="p-2 text-right">Thành tiền</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border">
                                    {msg.resultData.summaries[0].items.map((it) => (
                                      <tr key={it.id} className="hover:bg-muted/40">
                                        <td className="p-2 whitespace-nowrap text-muted-foreground">
                                          {formatDate(it.order_date)}
                                        </td>
                                        <td className="p-2 whitespace-nowrap font-mono font-medium text-primary">
                                          <Link
                                            href={`/purchases/${it.po_id}`}
                                            className="hover:underline flex items-center gap-1"
                                            target="_blank"
                                          >
                                            {it.po_number}
                                            <ExternalLink className="size-2.5 opacity-60" />
                                          </Link>
                                        </td>
                                        <td className="p-2 max-w-[160px] truncate" title={it.supplier_name}>
                                          {it.supplier_name}
                                        </td>
                                        <td className="p-2 text-right font-medium">{it.quantity}</td>
                                        <td className="p-2 text-muted-foreground">{it.unit}</td>
                                        <td className="p-2 text-right text-muted-foreground">
                                          {formatVND(it.unit_price)}
                                        </td>
                                        <td className="p-2 text-right font-semibold">
                                          {formatVND(it.line_total)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Top Ingredients Table if present */}
                      {msg.resultData?.topIngredients && msg.resultData.topIngredients.length > 0 && (
                        <div className="pt-2 border-t">
                          <div className="rounded-lg border overflow-hidden text-xs">
                            <table className="w-full text-left border-collapse">
                              <thead className="bg-muted text-muted-foreground font-medium">
                                <tr>
                                  <th className="p-2">#</th>
                                  <th className="p-2">Tên nguyên liệu</th>
                                  <th className="p-2 text-right">Tổng lượng</th>
                                  <th className="p-2 text-right">Đơn giá TB</th>
                                  <th className="p-2 text-right">Tổng tiền</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {msg.resultData.topIngredients.map((ing, idx) => (
                                  <tr key={ing.ingredient_id} className="hover:bg-muted/40">
                                    <td className="p-2 text-muted-foreground font-mono">{idx + 1}</td>
                                    <td className="p-2 font-medium">{ing.ingredient_name}</td>
                                    <td className="p-2 text-right">
                                      {ing.total_quantity} {ing.base_unit}
                                    </td>
                                    <td className="p-2 text-right text-muted-foreground">
                                      {formatVND(ing.avg_unit_price)}
                                    </td>
                                    <td className="p-2 text-right font-semibold text-primary">
                                      {formatVND(ing.total_amount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Follow-up question pills */}
                    {msg.resultData?.suggestedQuestions && msg.resultData.suggestedQuestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {msg.resultData.suggestedQuestions.map((sq, sqIdx) => (
                          <button
                            key={sqIdx}
                            type="button"
                            onClick={() => handleSendMessage(sq)}
                            className="text-[11px] px-2.5 py-1 rounded-full border border-border/80 bg-background hover:bg-muted hover:border-primary/40 text-muted-foreground hover:text-foreground transition-all flex items-center gap-1"
                          >
                            <Sparkles className="size-3 text-primary" />
                            <span>{sq}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        {/* Typing indicator */}
        {isPending && (
          <div className="flex gap-3 max-w-full">
            <div className="size-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shrink-0 mt-0.5 animate-pulse">
              <Sparkles className="size-4" />
            </div>
            <div className="rounded-2xl rounded-tl-xs border bg-card/80 p-3.5 shadow-sm flex items-center gap-2">
              <div className="flex gap-1">
                <span className="size-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                <span className="size-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                <span className="size-2 rounded-full bg-primary animate-bounce" />
              </div>
              <span className="text-xs text-muted-foreground ml-1">
                Đang đối chiếu cơ sở dữ liệu và tổng hợp số liệu...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input query area */}
      <div className="pt-3 border-t">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="relative flex items-center gap-2"
        >
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Hỏi về số lượng nhập, giá cả nguyên liệu... (Ví dụ: Tháng vừa rồi nguyên liệu này nhập thế nào?)"
            className="pr-12 h-11 text-xs sm:text-sm rounded-xl shadow-xs"
            disabled={isPending}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!inputValue.trim() || isPending}
            className="absolute right-1.5 size-8 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 shadow-xs"
          >
            <Send className="size-4" />
          </Button>
        </form>
        <p className="text-[10px] text-muted-foreground text-center mt-1.5">
          AI tự động chuyển đổi các mốc thời gian (&quot;tháng vừa rồi&quot;, &quot;tháng trước&quot;, &quot;tuần trước&quot;) và đối chiếu số liệu thực từ phiếu nhập hàng.
        </p>
      </div>
    </div>
  );
}
