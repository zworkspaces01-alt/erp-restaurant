import "server-only";

import {
  getNextAvailableKey,
  recordKeyRateLimit,
  recordKeySuccess,
} from "@/lib/ai/api-key-rotator";
import { computeSimilarity, normalizeVietnamese } from "@/lib/ai/invoice-matcher";
import { formatNumber, formatVND } from "@/lib/format";
import {
  getAllIngredientDirectory,
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
  /** exact = người dùng gõ đúng tên; fuzzy = hệ thống tự suy ra; ambiguous = nhiều khả năng ngang nhau. */
  matchConfidence: "exact" | "fuzzy" | "ambiguous" | "none";
  /** Các nguyên liệu gần đúng khác, để gợi ý hoặc hỏi lại người dùng. */
  candidates: string[];
}

/**
 * Chuẩn hóa nhưng GIỮ NGUYÊN DẤU tiếng Việt. Dấu chính là thứ phân biệt
 * "tỏi" với "tôi", "nấm" với "năm", "cá" với "cả" — bỏ dấu đi là mất luôn
 * khả năng phân biệt và sinh ra khớp nhầm.
 */
function normalizeKeepTones(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Từ để hỏi, bản CÓ DẤU — dùng khi dò theo dạng còn dấu. */
const QUESTION_WORDS_TONED = new Set([
  "nhập", "mua", "bán", "giá", "tiền", "tổng", "chi", "phí", "bao", "nhiêu", "mấy", "lần",
  "thế", "nào", "là", "có", "không", "của", "cho", "tôi", "xem", "biết", "hỏi", "với", "và",
  "trong", "từ", "đến", "đâu", "còn", "lại", "hiện", "tại", "bây", "giờ", "đã", "đang",
  "tháng", "tuần", "ngày", "hôm", "nay", "qua", "trước", "vừa", "rồi", "năm", "kỳ", "số",
  "nguyên", "liệu", "mặt", "hàng", "sản", "phẩm", "món", "top", "tất", "cả", "những", "các",
  "tăng", "giảm", "biến", "động", "so", "sánh", "tình", "hình", "thống", "kê", "nhất", "gì",
]);

/**
 * Từ CHỈ dùng để hỏi hoặc chỉ thời gian. Một mình chúng không bao giờ là tên nguyên liệu.
 * Chỉ dùng để loại các cụm neo vô nghĩa, KHÔNG dùng để xoá chữ khỏi câu hỏi —
 * xoá thẳng tay sẽ mất luôn thứ người dùng đang hỏi ("tất cả" nuốt mất "cá").
 */
const QUESTION_WORDS = new Set([
  "nhap", "mua", "ban", "gia", "tien", "tong", "chi", "phi", "bao", "nhieu", "may", "lan",
  "the", "nao", "la", "co", "khong", "cua", "cho", "toi", "xem", "biet", "hoi", "voi", "va",
  "trong", "tu", "den", "dau", "con", "lai", "hien", "tai", "bay", "gio", "da", "dang",
  "thang", "tuan", "ngay", "hom", "nay", "qua", "truoc", "vua", "roi", "nam", "ky", "so",
  "nguyen", "lieu", "mat", "hang", "san", "pham", "mon", "top", "tat", "ca", "nhung", "cac",
  "tang", "giam", "bien", "dong", "sanh", "tinh", "hinh", "thong", "ke", "nhat", "gi",
]);

/** Cụm neo: dãy từ liền nhau lấy từ câu hỏi, dùng để dò trong tên nguyên liệu. */
interface Anchor {
  text: string;
  /** Số ký tự — cụm dài hơn thì đáng tin hơn. */
  weight: number;
}

/**
 * Sinh mọi cụm từ liền nhau (1..4 từ) của câu hỏi, sắp theo độ dài giảm dần.
 * Loại các cụm chỉ gồm từ để hỏi, và cụm một từ quá ngắn (dưới 3 ký tự)
 * để "ca" trong "tất cả" không bị hiểu thành "cá".
 */
function buildAnchors(normQuery: string, questionWords: Set<string>): Anchor[] {
  const tokens = normQuery.split(" ").filter((t) => t.length >= 2 && !/^\d+$/.test(t));
  const anchors: Anchor[] = [];

  for (let size = Math.min(4, tokens.length); size >= 1; size--) {
    for (let i = 0; i + size <= tokens.length; i++) {
      const slice = tokens.slice(i, i + size);
      // cụm toàn từ để hỏi thì bỏ
      if (slice.every((t) => questionWords.has(t))) continue;
      // cụm một từ: phải đủ dài và không phải từ để hỏi
      if (size === 1 && (slice[0].length < 3 || questionWords.has(slice[0]))) continue;
      const text = slice.join(" ");
      anchors.push({ text, weight: text.length });
    }
  }

  return anchors.sort((a, b) => b.weight - a.weight);
}

/** Ngưỡng điểm khớp mờ: trên mức này thì tự suy ra, dưới thì chỉ gợi ý. */
const ACCEPT_SCORE = 0.55;
/** Hai ứng viên chênh nhau ít hơn mức này coi như ngang điểm, phải hỏi lại. */
const TIE_GAP = 0.08;

/** Khoảng cách Levenshtein — để chịu được lỗi gõ sai vài ký tự ("wasabj" -> "wasabi"). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Điểm giống nhau giữa cụm người dùng gõ và tên nguyên liệu, 0..1.
 * Kết hợp computeSimilarity (chứa nhau / trùng từ) với so khớp từng từ có chịu lỗi gõ sai.
 */
function fuzzyIngredientScore(phrase: string, ingredientName: string): number {
  const base = computeSimilarity(phrase, ingredientName);

  const queryTokens = phrase.split(" ").filter((t) => t.length >= 2);
  const nameTokens = normalizeVietnamese(ingredientName).split(" ").filter((t) => t.length >= 2);
  if (queryTokens.length === 0 || nameTokens.length === 0) return base;

  let hitScore = 0;
  for (const qt of queryTokens) {
    let best = 0;
    for (const nt of nameTokens) {
      if (qt === nt) {
        best = 1;
        break;
      }
      const sim = 1 - levenshtein(qt, nt) / Math.max(qt.length, nt.length);
      if (sim > best) best = sim;
    }
    // chỉ tính là trúng khi đủ giống, tránh cộng điểm rác
    if (best >= 0.75) hitScore += best;
  }

  return Math.max(base, hitScore / queryTokens.length);
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

  // So khớp theo RANH GIỚI TỪ. Dùng substring thô sẽ khớp nhầm: nguyên liệu "Đá"
  // (chuẩn hóa thành "da") nằm trong chữ "dang" của câu "nguyên liệu nào đang tăng giá".
  // Chuỗi đã chuẩn hóa chỉ còn [a-z0-9 ] nên bọc hai đầu bằng dấu cách là đủ.
  const paddedQuery = ` ${norm} `;

  for (const ing of allIngredients) {
    const normIng = normalizeVietnamese(ing.name);
    if (!normIng) continue;

    const hitName = paddedQuery.includes(` ${normIng} `);
    const normCode = normalizeVietnamese(ing.code || "");
    const hitCode = normCode.length >= 3 && paddedQuery.includes(` ${normCode} `);

    if ((hitName || hitCode) && normIng.length > longestMatchLen) {
      matchedKeyword = ing.name;
      longestMatchLen = normIng.length;
    }
  }

  let matchConfidence: ParsedIntent["matchConfidence"] = matchedKeyword ? "exact" : "none";
  let candidates: string[] = [];

  // Gõ tắt, gõ thiếu hoặc gõ sai => tự suy ra.
  // Cách làm: lấy cụm từ liền nhau DÀI NHẤT của câu hỏi mà nằm trọn trong tên một
  // nguyên liệu. Bám vào cụm dài nhất đáng tin hơn nhiều so với đếm từ trùng rời rạc,
  // vốn khiến "tổng chi phí" khớp nhầm "Phí Dịch Vụ".
  if (!matchedKeyword) {
    // Lượt 1 dò theo dạng CÒN DẤU (phân biệt được tỏi/tôi, nấm/năm).
    // Lượt 2 mới bỏ dấu, dành cho người gõ không dấu.
    const passes = [
      {
        query: normalizeKeepTones(userQuery),
        stop: QUESTION_WORDS_TONED,
        nameOf: (n: string) => normalizeKeepTones(n),
      },
      {
        query: norm,
        stop: QUESTION_WORDS,
        nameOf: (n: string) => normalizeVietnamese(n),
      },
    ];

    // Gộp cụm neo của cả hai lượt rồi xét theo ĐỘ DÀI giảm dần. Nếu xét xong hẳn
    // lượt có dấu mới sang lượt bỏ dấu, một cụm ngắn còn dấu sẽ thắng oan một cụm
    // dài không dấu: gõ "ca ngu" sẽ ra "Nam Ngư" thay vì "Cá ngừ".
    const allAnchors = passes
      .flatMap((pass, passIndex) =>
        buildAnchors(pass.query, pass.stop).map((anchor) => ({ ...anchor, passIndex }))
      )
      .sort((a, b) => b.weight - a.weight || a.passIndex - b.passIndex);

    for (const anchor of allAnchors) {
      const nameOf = passes[anchor.passIndex].nameOf;
      const padded = ` ${anchor.text} `;
      const hits = allIngredients.filter((ing) => ` ${nameOf(ing.name)} `.includes(padded));
      if (hits.length === 0) continue;

      // tên ngắn hơn thì cụ thể hơn, ưu tiên trước
      hits.sort((a, b) => a.name.length - b.name.length);
      matchedKeyword = hits[0].name;
      candidates = hits.slice(0, 5).map((h) => h.name);
      matchConfidence = hits.length > 1 ? "ambiguous" : "fuzzy";
      break;
    }

    // Vẫn chưa ra => có thể do gõ sai chính tả. Dò từng từ bằng khoảng cách Levenshtein.
    if (!matchedKeyword) {
      const typoTokens = norm
        .split(" ")
        .filter((t) => t.length >= 4 && !QUESTION_WORDS.has(t) && !/^\d+$/.test(t));

      let best: { name: string; score: number } | null = null;
      let runnerUpScore = 0;

      for (const token of typoTokens) {
        for (const ing of allIngredients) {
          const score = fuzzyIngredientScore(token, ing.name);
          if (!best || score > best.score) {
            if (best) runnerUpScore = best.score;
            best = { name: ing.name, score };
          } else if (score > runnerUpScore) {
            runnerUpScore = score;
          }
        }
      }

      if (best && best.score >= ACCEPT_SCORE) {
        matchedKeyword = best.name;
        matchConfidence = best.score - runnerUpScore < TIE_GAP ? "ambiguous" : "fuzzy";
        candidates = [best.name];
      }
    }
  }

  // Không nhận ra nguyên liệu cụ thể nào => câu hỏi mang tính tổng quan
  // ("tháng này nhập những gì", "tổng chi phí nhập bao nhiêu"). Trước đây vẫn đi
  // nhánh ingredient_purchases rồi lấy summaries[0] (nguyên liệu đắt nhất) và trả
  // lời như thể người dùng hỏi riêng về nó — sai hoàn toàn.
  if (!matchedKeyword && matchConfidence !== "ambiguous") {
    queryType = "top_ingredients";
  }

  return {
    queryType,
    keyword: matchedKeyword,
    fromDate,
    toDate,
    periodLabel,
    matchConfidence,
    candidates,
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
  const { keyword, fromDate, toDate, periodLabel, queryType, matchConfidence, candidates } = intent;

  // Nhiều nguyên liệu gần đúng ngang nhau => HỎI LẠI, không tự chọn bừa.
  // Chọn đại một cái rồi trả lời tự tin là kiểu sai khó phát hiện nhất.
  // Chỉ hỏi lại khi người dùng thực sự đang hỏi về MỘT nguyên liệu. Câu tổng quan
  // ("top nguyên liệu nhiều nhất") không được biến thành câu hỏi ngược.
  if (queryType === "ingredient_purchases" && matchConfidence === "ambiguous" && candidates.length > 0) {
    return {
      answer:
        `Mình chưa chắc bạn đang hỏi nguyên liệu nào. Có ${candidates.length} nguyên liệu gần giống với những gì bạn gõ:\n\n` +
        candidates.map((c) => `- **${c}**`).join("\n") +
        `\n\nBạn bấm vào một gợi ý bên dưới, hoặc gõ lại tên đầy đủ hơn nhé.`,
      queryType: "ingredient_purchases",
      parameters: { keyword, fromDate, toDate, resolvedPeriodLabel: periodLabel },
      metrics: [],
      summaries: [],
      suggestedQuestions: candidates.map((c) => `${c} nhập thế nào trong ${periodLabel}?`),
    };
  }

  // Suy ra được nhưng người dùng không gõ đúng tên => phải nói rõ là đã tự suy.
  const inferenceNote =
    matchConfidence === "fuzzy" && keyword
      ? `> Hiểu là bạn đang hỏi về **${keyword}**. Nếu không đúng, gõ lại tên đầy đủ giúp mình.\n\n`
      : "";

  // =========================================================================
  // Nhánh 1: Hỏi về danh sách Top nguyên liệu nhập nhiều nhất
  // =========================================================================
  if (queryType === "top_ingredients" || (!keyword && userMessage.toLowerCase().includes("top"))) {
    // Lấy TOÀN BỘ để có tổng chi phí thật của kỳ, rồi mới cắt top 8 để hiển thị.
    // getTopPurchasedIngredients chỉ trả 8 dòng nên cộng lại sẽ ra con số thiếu.
    const { summaries: allSummaries } = await queryIngredientPurchases({ fromDate, toDate });
    const periodTotalSpending = allSummaries.reduce((acc, it) => acc + it.total_amount, 0);
    const periodIngredientCount = allSummaries.length;
    const topIngredients: TopPurchasedIngredient[] = allSummaries.slice(0, 8).map((sm) => ({
      ingredient_id: sm.ingredient_id,
      ingredient_name: sm.ingredient_name,
      ingredient_code: sm.ingredient_code,
      base_unit: sm.base_unit,
      total_quantity: sm.total_quantity,
      total_amount: sm.total_amount,
      avg_unit_price: sm.avg_unit_price,
      po_count: sm.po_count,
    }));

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

    const totalSpending = periodTotalSpending;

    const metrics: AiAssistantMetricCard[] = [
      {
        label: "Tổng chi phí nhập hàng",
        value: formatVND(totalSpending),
        subtext: `Toàn bộ ${periodIngredientCount} nguyên liệu trong ${periodLabel}`,
        tone: "primary",
      },
      {
        label: "Nguyên liệu chi phí lớn nhất",
        value: topIngredients[0].ingredient_name,
        subtext: `${formatVND(topIngredients[0].total_amount)} (${formatNumber(topIngredients[0].total_quantity)} ${topIngredients[0].base_unit})`,
        tone: "warning",
      },
      {
        label: "Số mặt hàng đã nhập",
        value: `${periodIngredientCount} nguyên liệu`,
        subtext: `Đang hiển thị ${topIngredients.length} mặt hàng tốn kém nhất`,
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

Tổng chi phí nhập hàng của TOÀN KỲ (tất cả ${periodIngredientCount} nguyên liệu): ${formatVND(totalSpending)}.
Danh sách trên chỉ là ${topIngredients.length} mặt hàng tốn kém nhất, không phải toàn bộ.
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
      answer: `${inferenceNote}Không tìm thấy phiếu nhập nào cho nguyên liệu **${keyword || "yêu cầu"}** trong **${periodLabel}** (${fromDate} đến ${toDate}).${extraAdvice}`,
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
    answer: inferenceNote + explanation,
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
