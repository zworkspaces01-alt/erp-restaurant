import "server-only";

import {
  getNextAvailableKey,
  recordKeyRateLimit,
  recordKeySuccess,
} from "@/lib/ai/api-key-rotator";
import { normalizeVietnamese } from "@/lib/ai/invoice-matcher";
import { formatNumber, formatVND } from "@/lib/format";
import {
  getAllIngredientDirectory,
  getTopPurchasedIngredients,
  queryIngredientPurchases,
  type IngredientPurchaseSummary,
  type TopPurchasedIngredient,
} from "@/lib/queries/ai-analytics.queries";

export interface AiAssistantMetricCard {
  label: string;
  value: string;
  subtext?: string;
  tone?: "default" | "success" | "warning" | "danger" | "primary";
}

export interface AiAssistantQueryResult {
  answer: string;
  queryType: "ingredient_purchases" | "top_ingredients" | "general_summary";
  parameters: {
    keyword?: string;
    fromDate?: string;
    toDate?: string;
    resolvedPeriodLabel: string;
  };
  metrics: AiAssistantMetricCard[];
  summaries: IngredientPurchaseSummary[];
  topIngredients?: TopPurchasedIngredient[];
  suggestedQuestions: string[];
  providerUsed?: string;
}

interface ParsedIntent {
  queryType: "ingredient_purchases" | "top_ingredients" | "general_summary";
  keyword?: string;
  fromDate?: string;
  toDate?: string;
  periodLabel: string;
}

/**
 * Phân tích câu hỏi tiếng Việt để trích xuất khoảng thời gian và từ khóa nguyên liệu
 */
export async function parseQueryIntent(userQuery: string): Promise<ParsedIntent> {
  const norm = normalizeVietnamese(userQuery);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentDay = now.getDate();

  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDayOfMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

  let fromDate: string | undefined;
  let toDate: string | undefined;
  let periodLabel = "Toàn bộ thời gian";

  // 1. Nhận diện các mốc thời gian phổ biến
  if (norm.includes("thang vua roi") || norm.includes("thang truoc") || norm.includes("thang vua qua")) {
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    fromDate = `${prevYear}-${pad(prevMonth)}-01`;
    toDate = `${prevYear}-${pad(prevMonth)}-${pad(lastDayOfMonth(prevYear, prevMonth))}`;
    periodLabel = `Tháng ${prevMonth}/${prevYear}`;
  } else if (norm.includes("thang nay") || norm.includes("thang hien tai")) {
    fromDate = `${currentYear}-${pad(currentMonth)}-01`;
    toDate = `${currentYear}-${pad(currentMonth)}-${pad(lastDayOfMonth(currentYear, currentMonth))}`;
    periodLabel = `Tháng ${currentMonth}/${currentYear}`;
  } else if (norm.includes("tuan truoc")) {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    const startOfWeek = new Date(d);
    startOfWeek.setDate(d.getDate() - d.getDay() + 1);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    fromDate = `${startOfWeek.getFullYear()}-${pad(startOfWeek.getMonth() + 1)}-${pad(startOfWeek.getDate())}`;
    toDate = `${endOfWeek.getFullYear()}-${pad(endOfWeek.getMonth() + 1)}-${pad(endOfWeek.getDate())}`;
    periodLabel = "Tuần trước";
  } else if (norm.includes("7 ngay qua") || norm.includes("tuan nay")) {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    fromDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    toDate = `${currentYear}-${pad(currentMonth)}-${pad(currentDay)}`;
    periodLabel = "7 ngày gần đây";
  } else if (norm.includes("hom nay")) {
    fromDate = `${currentYear}-${pad(currentMonth)}-${pad(currentDay)}`;
    toDate = fromDate;
    periodLabel = `Hôm nay (${pad(currentDay)}/${pad(currentMonth)})`;
  } else if (norm.includes("hom qua")) {
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    fromDate = `${yest.getFullYear()}-${pad(yest.getMonth() + 1)}-${pad(yest.getDate())}`;
    toDate = fromDate;
    periodLabel = `Hôm qua (${pad(yest.getDate())}/${pad(yest.getMonth() + 1)})`;
  } else {
    // Tìm mẫu: "thang X" hoặc "thang X/YYYY" hoặc "thang X nam YYYY"
    const monthMatch = userQuery.match(/tháng\s+(\d{1,2})(?:\s*[\/\-]\s*(\d{4})|\s+năm\s+(\d{4}))?/i);
    if (monthMatch) {
      const m = parseInt(monthMatch[1], 10);
      const y = monthMatch[2] ? parseInt(monthMatch[2], 10) : monthMatch[3] ? parseInt(monthMatch[3], 10) : currentYear;
      if (m >= 1 && m <= 12) {
        fromDate = `${y}-${pad(m)}-01`;
        toDate = `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}`;
        periodLabel = `Tháng ${m}/${y}`;
      }
    }
  }

  // Nếu người dùng không chỉ định mốc thời gian rõ rệt nhưng nói chung chung, mặc định tháng hiện tại hoặc 30 ngày
  if (!fromDate || !toDate) {
    fromDate = `${currentYear}-${pad(currentMonth)}-01`;
    toDate = `${currentYear}-${pad(currentMonth)}-${pad(lastDayOfMonth(currentYear, currentMonth))}`;
    periodLabel = `Tháng ${currentMonth}/${currentYear}`;
  }

  // 2. Nhận diện loại câu hỏi
  let queryType: "ingredient_purchases" | "top_ingredients" | "general_summary" = "ingredient_purchases";

  if (
    norm.includes("top") ||
    norm.includes("nhieu nhat") ||
    norm.includes("ton tien nhat") ||
    norm.includes("chi phi cao nhat") ||
    norm.includes("cac nguyen lieu nhap")
  ) {
    queryType = "top_ingredients";
  }

  // 3. Trích xuất từ khóa nguyên liệu
  let matchedKeyword: string | undefined;

  // Lấy danh mục nguyên liệu thực tế từ database để so khớp
  const allIngredients = await getAllIngredientDirectory();
  let longestMatchLen = 0;

  for (const ing of allIngredients) {
    const normIng = normalizeVietnamese(ing.name);
    // So khớp nếu câu hỏi chứa tên nguyên liệu hoặc mã nguyên liệu
    if (norm.includes(normIng) && normIng.length > longestMatchLen) {
      matchedKeyword = ing.name;
      longestMatchLen = normIng.length;
    }
  }

  // Nếu không khớp chính xác cả cụm dài, thử tìm từ sau các từ khóa dẫn
  if (!matchedKeyword) {
    const triggerPatterns = [
      /(?:nguyên liệu|mặt hàng|sản phẩm|món|hàng|nhập)\s+([a-zA-Z0-9\s\u00C0-\u1EF9]+?)(?:\s+(?:này|nhập|thế nào|bao nhiêu|giá|ở đâu|từ|trong|tháng|tuần|ngày)|$)/i,
      /(?:giá|số lượng|chi phí)\s+(?:của\s+)?([a-zA-Z0-9\s\u00C0-\u1EF9]+?)(?:\s+(?:thế nào|bao nhiêu|nhập|trong|tháng)|$)/i,
    ];

    for (const pat of triggerPatterns) {
      const match = userQuery.match(pat);
      if (match && match[1]) {
        const candidate = match[1].trim();
        const normCand = normalizeVietnamese(candidate);
        // Bỏ qua các từ stopword thông dụng
        const stopWords = ["nay", "nay", "vua roi", "thang", "tuan", "ngay", "tat ca", "nhieu nhat", "top"];
        if (candidate.length >= 2 && !stopWords.includes(normCand)) {
          matchedKeyword = candidate;
          break;
        }
      }
    }
  }

  return {
    queryType,
    keyword: matchedKeyword,
    fromDate,
    toDate,
    periodLabel,
  };
}

/**
 * Model văn bản của Groq, thử theo thứ tự. Kiểm tra danh sách còn sống bằng:
 *   curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"
 */
const GROQ_TEXT_MODELS = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b"] as const;

/**
 * Gọi mô hình ngôn ngữ thông qua Key Rotator (hỗ trợ Groq / Gemini / OpenAI với tự động failover)
 */
async function callLlmForExplanation(prompt: string, systemPrompt?: string): Promise<{ text: string; provider: string }> {
  const maxRotations = 4;
  let attempt = 0;

  while (attempt < maxRotations) {
    attempt++;
    const keyInfo = await getNextAvailableKey();
    if (!keyInfo) {
      throw new Error("Không tìm thấy API Key nào khả dụng.");
    }

    const { key, provider } = keyInfo;

    try {
      if (provider === "groq") {
        // Thử lần lượt các model: Groq gỡ model cũ khá thường xuyên (llama-3.3-70b-versatile
        // đã bị gỡ và trả 404 model_not_found), nên luôn có model dự phòng.
        // Giữ đồng bộ với GROQ_TEXT_MODELS dùng ở invoice-ocr / ingredient-ocr.
        let groqModelMissing = false;

        for (const model of GROQ_TEXT_MODELS) {
          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key.trim()}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: "system",
                  content:
                    systemPrompt ||
                    "Bạn là trợ lý AI thông minh của hệ thống ERP Nhà hàng. Nhiệm vụ của bạn là giải thích, phân tích dữ liệu nhập hàng và chi phí một cách khách quan, súc tích, chuyên nghiệp bằng tiếng Việt, dựa CHÍNH XÁC trên số liệu được cung cấp, tuyệt đối không bịa thêm con số.",
                },
                { role: "user", content: prompt },
              ],
              temperature: 0.2,
              max_tokens: 800,
            }),
          });

          if (res.status === 200) {
            const json = await res.json();
            const text = json.choices?.[0]?.message?.content || "";
            recordKeySuccess(key);
            return { text, provider: `Groq (${model})` };
          }

          if (res.status === 429) {
            recordKeyRateLimit(key, 60);
            break; // key này hết hạn mức, xoay sang key khác
          }

          if (res.status === 404) {
            groqModelMissing = true;
            continue; // model đã bị gỡ, thử model kế tiếp
          }

          throw new Error(`Groq status ${res.status}`);
        }

        if (groqModelMissing) {
          throw new Error("Groq: không còn model khả dụng trong GROQ_TEXT_MODELS");
        }

        continue;
      }

      if (provider === "gemini") {
        const models = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-2.5-flash"];
        let allRateLimited = true;

        for (const model of models) {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key.trim()}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  {
                    role: "user",
                    parts: [
                      {
                        text: `${systemPrompt ? systemPrompt + "\n\n" : ""}${prompt}`,
                      },
                    ],
                  },
                ],
                generationConfig: {
                  temperature: 0.2,
                  maxOutputTokens: 800,
                },
              }),
            }
          );

          if (res.status === 200) {
            const json = await res.json();
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
            recordKeySuccess(key);
            return { text, provider: `Gemini (${model})` };
          }

          if (res.status === 429) {
            continue; // thử model khác trong key trước khi đánh dấu key bị rate-limit
          }

          allRateLimited = false;
        }

        if (allRateLimited) {
          recordKeyRateLimit(key, 60);
        }
      }

      if (provider === "openai") {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key.trim()}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  systemPrompt ||
                  "Bạn là trợ lý AI thông minh của hệ thống ERP Nhà hàng. Phân tích súc tích, dùng số liệu thực tế.",
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.2,
            max_tokens: 800,
          }),
        });

        if (res.status === 200) {
          const json = await res.json();
          const text = json.choices?.[0]?.message?.content || "";
          recordKeySuccess(key);
          return { text, provider: "OpenAI (GPT-4o mini)" };
        }

        if (res.status === 429) {
          recordKeyRateLimit(key, 60);
          continue;
        }
      }
    } catch (err) {
      console.warn(`[AI Query Engine] Error calling ${provider}:`, err);
    }
  }

  throw new Error("Tất cả các mô hình AI đều đang bận hoặc quá giới hạn.");
}

/**
 * Xử lý câu hỏi tự nhiên từ người dùng và trả về phân tích đầy đủ kèm số liệu thực
 */
export async function executeAiQuery(userMessage: string): Promise<AiAssistantQueryResult> {
  const intent = await parseQueryIntent(userMessage);
  const { keyword, fromDate, toDate, periodLabel, queryType } = intent;

  // =========================================================================
  // Nhánh 1: Hỏi về danh sách Top nguyên liệu nhập nhiều nhất
  // =========================================================================
  if (queryType === "top_ingredients" || (!keyword && userMessage.toLowerCase().includes("top"))) {
    const topIngredients = await getTopPurchasedIngredients({
      fromDate,
      toDate,
      limit: 8,
    });

    if (topIngredients.length === 0) {
      return {
        answer: `Trong **${periodLabel}** (từ ${fromDate} đến ${toDate}), hệ thống chưa ghi nhận phiếu nhập hàng nào.`,
        queryType: "top_ingredients",
        parameters: { keyword, fromDate, toDate, resolvedPeriodLabel: periodLabel },
        metrics: [],
        summaries: [],
        suggestedQuestions: [
          "Tháng này nhập những nguyên liệu nào?",
          "Kiểm tra giá nhập nguyên liệu gần nhất?",
        ],
      };
    }

    const totalSpending = topIngredients.reduce((acc, it) => acc + it.total_amount, 0);

    const metrics: AiAssistantMetricCard[] = [
      {
        label: "Tổng chi phí Top nguyên liệu",
        value: formatVND(totalSpending),
        subtext: `Trong ${periodLabel}`,
        tone: "primary",
      },
      {
        label: "Nguyên liệu chi phí lớn nhất",
        value: topIngredients[0].ingredient_name,
        subtext: `${formatVND(topIngredients[0].total_amount)} (${formatNumber(topIngredients[0].total_quantity)} ${topIngredients[0].base_unit})`,
        tone: "warning",
      },
      {
        label: "Số mặt hàng phân tích",
        value: `${topIngredients.length} món`,
        subtext: `Đã xếp theo chi phí giảm dần`,
        tone: "default",
      },
    ];

    // Tạo prompt cho LLM
    const prompt = `
Dưới đây là danh sách Top nguyên liệu nhập nhiều nhất trong ${periodLabel} (${fromDate} đến ${toDate}):
${topIngredients
  .map(
    (it, idx) =>
      `${idx + 1}. **${it.ingredient_name}**: Tổng lượng = ${it.total_quantity} ${it.base_unit}, Tổng tiền = ${formatVND(
        it.total_amount
      )}, Đơn giá TB = ${formatVND(it.avg_unit_price)}/${it.base_unit}, Số phiếu = ${it.po_count}`
  )
  .join("\n")}

Tổng tiền của nhóm này: ${formatVND(totalSpending)}.
Yêu cầu: Hãy viết bản tóm tắt phân tích ngắn gọn, nêu rõ 2-3 nguyên liệu chiếm tỉ trọng lớn nhất và đưa ra lưu ý quản trị tồn kho cho bếp/quản lý.
`;

    let explanationText = "";
    let providerName = "Hệ thống phân tích tự động";

    try {
      const llmRes = await callLlmForExplanation(prompt);
      explanationText = llmRes.text;
      providerName = llmRes.provider;
    } catch {
      explanationText = `Trong **${periodLabel}**, nguyên liệu chiếm chi phí cao nhất là **${
        topIngredients[0].ingredient_name
      }** với tổng số tiền **${formatVND(topIngredients[0].total_amount)}** (tổng lượng: ${formatNumber(
        topIngredients[0].total_quantity
      )} ${topIngredients[0].base_unit}). Tiếp theo là **${topIngredients[1]?.ingredient_name || "—"}**.`;
    }

    return {
      answer: explanationText,
      queryType: "top_ingredients",
      parameters: { keyword, fromDate, toDate, resolvedPeriodLabel: periodLabel },
      metrics,
      summaries: [],
      topIngredients,
      providerUsed: providerName,
      suggestedQuestions: [
        `Chi tiết các lần nhập của ${topIngredients[0].ingredient_name}?`,
        `Tháng này nguyên liệu ${topIngredients[0].ingredient_name} nhập giá bao nhiêu?`,
        "So sánh chi phí nhập tháng này với tháng trước?",
      ],
    };
  }

  // =========================================================================
  // Nhánh 2: Hỏi về nguyên liệu cụ thể ("nguyên liệu này nhập thế nào...")
  // =========================================================================
  const { summaries } = await queryIngredientPurchases({
    keyword,
    fromDate,
    toDate,
  });

  // Trường hợp 2.1: Không có dữ liệu trong khoảng thời gian đã chọn
  if (summaries.length === 0) {
    // Thử truy vấn mở rộng (không giới hạn ngày) để xem nguyên liệu này đã từng nhập lần nào chưa
    const extended = await queryIngredientPurchases({ keyword });
    let extraAdvice = "";
    if (extended.summaries.length > 0) {
      const lastSummary = extended.summaries[0];
      extraAdvice = `\n\n💡 *Lưu ý*: Nguyên liệu **${lastSummary.ingredient_name}** có lịch sử nhập trước đây với lần nhập gần nhất vào ngày **${lastSummary.last_order_date || "—"}** (đơn giá: **${formatVND(lastSummary.last_unit_price)}/${lastSummary.base_unit}**). Trong kỳ **${periodLabel}** không có phiếu nhập phát sinh.`;
    }

    return {
      answer: `Không tìm thấy phiếu nhập nào cho nguyên liệu **${keyword || "yêu cầu"}** trong **${periodLabel}** (${fromDate} đến ${toDate}).${extraAdvice}`,
      queryType: "ingredient_purchases",
      parameters: { keyword, fromDate, toDate, resolvedPeriodLabel: periodLabel },
      metrics: [
        {
          label: "Số lượng nhập",
          value: "0",
          subtext: `Trong ${periodLabel}`,
          tone: "default",
        },
        {
          label: "Tổng chi phí",
          value: "0 ₫",
          subtext: "Không có phát sinh",
          tone: "default",
        },
      ],
      summaries: [],
      suggestedQuestions: [
        `Xem lịch sử nhập của ${keyword || "nguyên liệu này"} toàn bộ thời gian?`,
        "Top các nguyên liệu nhập nhiều nhất tháng vừa rồi?",
        "Kiểm tra giá nhập gần nhất của tất cả mặt hàng?",
      ],
    };
  }

  // Trường hợp 2.2: Có dữ liệu tổng hợp
  const primary = summaries[0];

  const metrics: AiAssistantMetricCard[] = [
    {
      label: `Tổng lượng nhập (${primary.base_unit})`,
      value: `${formatNumber(primary.total_quantity)} ${primary.base_unit}`,
      subtext: `${primary.po_count} lần nhập trong ${periodLabel}`,
      tone: "success",
    },
    {
      label: "Tổng tiền nhập",
      value: formatVND(primary.total_amount),
      subtext: `Đơn giá TB: ${formatVND(primary.avg_unit_price)}/${primary.base_unit}`,
      tone: "primary",
    },
    {
      label: "Đơn giá gần nhất",
      value: formatVND(primary.last_unit_price),
      subtext: `Ngày nhập: ${primary.last_order_date || "—"}`,
      tone: "default",
    },
    {
      label: "Biên độ giá nhập",
      value: `${formatVND(primary.min_unit_price)} - ${formatVND(primary.max_unit_price)}`,
      subtext: primary.min_unit_price === primary.max_unit_price ? "Giá ổn định" : "Có biến động giá",
      tone: primary.min_unit_price === primary.max_unit_price ? "default" : "warning",
    },
  ];

  // Chuẩn bị dữ liệu cho LLM tóm tắt
  const itemsBreakdown = primary.items
    .slice(0, 8)
    .map(
      (it) =>
        `- Ngày ${it.order_date}, Phiếu ${it.po_number}: ${it.quantity} ${it.unit} x ${formatVND(it.unit_price)} = ${formatVND(
          it.line_total
        )} (NCC: ${it.supplier_name})`
    )
    .join("\n");

  const suppliersBreakdown = primary.suppliers
    .map((s) => `- ${s.supplier_name}: ${s.quantity} ${primary.base_unit} (${formatVND(s.amount)}, ${s.po_count} phiếu)`)
    .join("\n");

  const prompt = `
Dưới đây là dữ liệu nhập hàng thực tế của nguyên liệu: "${primary.ingredient_name}" trong ${periodLabel} (${fromDate} đến ${toDate}):
- Tổng số lượng nhập: ${primary.total_quantity} ${primary.base_unit}
- Tổng tiền nhập: ${formatVND(primary.total_amount)}
- Đơn giá bình quân: ${formatVND(primary.avg_unit_price)} / ${primary.base_unit}
- Đơn giá thấp nhất: ${formatVND(primary.min_unit_price)}, cao nhất: ${formatVND(primary.max_unit_price)}
- Đơn giá gần nhất: ${formatVND(primary.last_unit_price)} (vào ngày ${primary.last_order_date})
- Số lần nhập (phiếu): ${primary.po_count}
- Nhà cung cấp:
${suppliersBreakdown}

Chi tiết các phiếu:
${itemsBreakdown}

Người dùng hỏi: "${userMessage}".
Hãy trả lời câu hỏi trực tiếp, rõ ràng, nêu rõ tổng lượng, tổng tiền, đơn giá trung bình và các nhà cung cấp cung ứng. Nhận xét về độ biến động giá (nếu có). Trình bày mạch lạc bằng Markdown.
`;

  let explanation = "";
  let providerName = "Hệ thống phân tích tự động";

  try {
    const llmRes = await callLlmForExplanation(prompt);
    explanation = llmRes.text;
    providerName = llmRes.provider;
  } catch {
    explanation = `Trong **${periodLabel}**, nguyên liệu **${primary.ingredient_name}** đã được nhập tổng cộng **${formatNumber(
      primary.total_quantity
    )} ${primary.base_unit}** qua **${primary.po_count} lần nhập**, với tổng chi phí **${formatVND(
      primary.total_amount
    )}**.\n\n- **Đơn giá trung bình**: ${formatVND(primary.avg_unit_price)} / ${primary.base_unit}\n- **Đơn giá gần nhất**: ${formatVND(
      primary.last_unit_price
    )} / ${primary.base_unit} (ngày ${primary.last_order_date || "—"})\n- **Nhà cung cấp**: ${primary.suppliers
      .map((s) => s.supplier_name)
      .join(", ")}.`;
  }

  return {
    answer: explanation,
    queryType: "ingredient_purchases",
    parameters: { keyword: primary.ingredient_name, fromDate, toDate, resolvedPeriodLabel: periodLabel },
    metrics,
    summaries,
    providerUsed: providerName,
    suggestedQuestions: [
      `So sánh giá nhập ${primary.ingredient_name} với tháng trước?`,
      `Các nguyên liệu khác nhập cùng nhà cung cấp ${primary.suppliers[0]?.supplier_name || ""}?`,
      "Xem tồn kho hiện tại của nguyên liệu này?",
    ],
  };
}
