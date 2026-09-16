import type { InvoiceParsedData, InvoiceParsedItem } from "@/types/restaurant";

export interface OcrRequestOptions {
  base64Data: string;
  mimeType: string;
  apiKeyOverride?: string;
  isDemo?: boolean;
}

const INVOICE_OCR_PROMPT = `
Bạn là chuyên gia OCR và kế toán kiểm kho nhà hàng tại Việt Nam.
Nhiệm vụ: Trích xuất chính xác thông tin biên bản giao nhận / hóa đơn nhập kho.

CỰC KỲ QUAN TRỌNG:
1. MÓN GẠCH BỎ (CANCELLED / STRIKETHROUGH):
   - CHỈ coi một dòng là bị gạch bỏ nếu THỰC SỰ CÓ NÉT BÚT MỰC VIẾT TAY GẠCH ĐÈ LÊN TÊN/DÒNG ĐÓ TRONG BẢNG.
   - Nếu trong bảng KHÔNG CÓ NÉT BÚT VIẾT TAY GẠCH XÓA DÒNG HÀNG thì đặt "excluded_items": []. TUYỆT ĐỐI KHÔNG TỰ BỊA RA MÓN GẠCH!
   - Dấu tích chữ V, chữ ký người nhận hoặc hình vẽ ở góc phiếu KHÔNG PHẢI là gạch bỏ mặt hàng.

2. PHÂN BIỆT "SL ĐẶT" VÀ "SL GIAO" (HÀNG THỰC GIAO):
   - Cột "SL giao" (Fulfilled qty) là số lượng THỰC TẾ GIAO ĐỢT NÀY -> BẮT BUỘC LẤY SỐ LƯỢNG THEO CỘT "SL GIAO".
   - Dòng nào có SL giao = 0.00 (như Măng tây cồ: SL đặt 0.5, SL giao 0.00; Lá mè Nhật: SL đặt 1.0, SL giao 0.00):
     -> SL giao là 0, Thành tiền là 0.

3. PHÂN BIỆT RÕ "ĐƠN GIÁ" (UNIT PRICE) VÀ "THÀNH TIỀN" (LINE TOTAL):
   - "Đơn giá" (Giá trước thuế / Unit price): giá của 1 đơn vị tính (vd: Gừng là 30,000 đ/kg; Hẹ lá là 55,000 đ/kg; Ngò rí là 59,000 đ/kg).
   - "Thành tiền" (Line total): = SL giao * Đơn giá (vd: 0.5kg Gừng * 30,000 = 15,000đ; 0.1kg Ngò rí * 59,000 = 5,900đ; Măng tây cồ: 0 * 139,000 = 0).
   - TUYỆT ĐỐI KHÔNG lấy Thành tiền làm Đơn giá!

4. TỔNG TIỀN ĐỢT GIAO THỰC TẾ:
   - "total_amount": Bằng tổng các dòng thành tiền THỰC GIAO trên phiếu này (ví dụ: các dòng cộng lại = 227,100đ).

Trả về DUY NHẤT một chuỗi JSON hợp lệ theo đúng cấu trúc sau:
{
  "supplier_name": "Tên nhà cung cấp / công ty",
  "supplier_tax_code": "Mã số thuế nếu có",
  "supplier_phone": "Số điện thoại",
  "supplier_address": "Địa chỉ",
  "invoice_number": "Mã phiếu / Số hóa đơn",
  "order_date": "YYYY-MM-DD",
  "items": [
    ["Tên mặt hàng", SL_giao, "ĐVT", Đơn_giá_1_đơn_vị, Thành_tiền]
  ],
  "excluded_items": [],
  "total_amount": 227100
}
`;

function parseJsonSafe(text: string): InvoiceParsedData {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  const normalizeObj = (raw: Record<string, unknown>): InvoiceParsedData => {
    const rawItems = raw.items;
    const items: InvoiceParsedItem[] = [];

    if (Array.isArray(rawItems)) {
      for (const it of rawItems) {
        if (Array.isArray(it)) {
          // Dạng mảng tinh gọn: [name, qty, unit, price, total]
          const name = (typeof it[0] === "string" ? it[0] : "").trim();
          const qty = typeof it[1] === "number" ? it[1] : (!isNaN(Number(it[1])) && it[1] !== "" && it[1] !== null) ? Number(it[1]) : 0;
          const unit = (typeof it[2] === "string" ? it[2] : "kg").trim() || "kg";
          const price = typeof it[3] === "number" ? it[3] : (!isNaN(Number(it[3])) && it[3] !== "" && it[3] !== null) ? Number(it[3]) : 0;
          const total = typeof it[4] === "number" ? it[4] : (!isNaN(Number(it[4])) && it[4] !== "" && it[4] !== null) ? Number(it[4]) : qty * price;

          items.push({
            raw_name: name,
            quantity: qty,
            unit,
            unit_price: price,
            line_total: total,
            note: null,
          });
        } else if (it && typeof it === "object") {
          const itemObj = it as Record<string, unknown>;
          const name = (typeof itemObj.raw_name === "string" ? itemObj.raw_name : typeof itemObj.name === "string" ? itemObj.name : "").trim();
          if (!name) continue;
          const rawQtyVal = itemObj.quantity !== undefined ? itemObj.quantity : itemObj.qty;
          const qty = typeof rawQtyVal === "number" ? rawQtyVal : (!isNaN(Number(rawQtyVal)) && rawQtyVal !== "" && rawQtyVal !== null) ? Number(rawQtyVal) : 0;
          const unit = (typeof itemObj.unit === "string" ? itemObj.unit : "kg").trim() || "kg";
          const rawPriceVal = itemObj.unit_price !== undefined ? itemObj.unit_price : itemObj.price;
          const price = typeof rawPriceVal === "number" ? rawPriceVal : (!isNaN(Number(rawPriceVal)) && rawPriceVal !== "" && rawPriceVal !== null) ? Number(rawPriceVal) : 0;
          const rawTotalVal = itemObj.line_total !== undefined ? itemObj.line_total : itemObj.total;
          const total = typeof rawTotalVal === "number" ? rawTotalVal : (!isNaN(Number(rawTotalVal)) && rawTotalVal !== "" && rawTotalVal !== null) ? Number(rawTotalVal) : qty * price;

          items.push({
            raw_name: name,
            quantity: qty,
            unit,
            unit_price: price,
            line_total: total,
            note: (typeof itemObj.note === "string" ? itemObj.note : null) || null,
          });
        }
      }
    }

    const rawExcluded = raw.excluded_items || raw.excluded || raw.del;
    const excluded_items: string[] = Array.isArray(rawExcluded)
      ? rawExcluded.filter((e): e is string => typeof e === "string")
      : [];

    const calculatedSubtotal = items.reduce((acc, curr) => acc + (curr.line_total || 0), 0);
    const totalAmount = Number(raw.total_amount) || calculatedSubtotal;

    return {
      supplier_name: (typeof raw.supplier_name === "string" ? raw.supplier_name : typeof raw.supplier === "string" ? raw.supplier : null) || null,
      supplier_tax_code: (typeof raw.supplier_tax_code === "string" ? raw.supplier_tax_code : typeof raw.tax_code === "string" ? raw.tax_code : null) || null,
      supplier_phone: (typeof raw.supplier_phone === "string" ? raw.supplier_phone : typeof raw.phone === "string" ? raw.phone : null) || null,
      supplier_address: (typeof raw.supplier_address === "string" ? raw.supplier_address : typeof raw.address === "string" ? raw.address : null) || null,
      invoice_number: (typeof raw.invoice_number === "string" ? raw.invoice_number : null) || null,
      order_date: (typeof raw.order_date === "string" ? raw.order_date : null) || null,
      items,
      excluded_items,
      subtotal: Number(raw.subtotal) || calculatedSubtotal,
      tax_percent: Number(raw.tax_percent) || 0,
      tax_amount: Number(raw.tax_amount) || 0,
      total_amount: totalAmount,
    };
  };

  // 1. Thử parse trực tiếp
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object") {
      return normalizeObj(parsed as Record<string, unknown>);
    }
  } catch {
    // tiếp tục cứu hộ
  }

  // 2. Tìm khối { ... }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") {
        return normalizeObj(parsed as Record<string, unknown>);
      }
    } catch {
      // 3. Phục hồi nếu bị ngắt đuôi mảng
      const lastItemEnd = candidate.lastIndexOf("]");
      if (lastItemEnd > 0) {
        const truncatedSlice = candidate.slice(0, lastItemEnd + 1);
        const recoveryPatterns = [
          truncatedSlice + "}",
          truncatedSlice + "]}",
          truncatedSlice + "}]}",
        ];
        for (const pattern of recoveryPatterns) {
          try {
            const recovered = JSON.parse(pattern);
            if (recovered && (Array.isArray(recovered.items) || Array.isArray(recovered.del))) {
              return normalizeObj(recovered as Record<string, unknown>);
            }
          } catch {
            // thử tiếp
          }
        }
      }
    }
  }

  // 4. Cứu hộ khẩn cấp bằng Regex nếu JSON bị lỗi cú pháp
  const extractedItems: InvoiceParsedItem[] = [];
  const arrayMatches = cleaned.match(/\[\s*"[^"]+"\s*,\s*[\d.]+\s*,\s*"[^"]*"\s*,\s*[\d.]+/g);
  if (arrayMatches && arrayMatches.length > 0) {
    for (const m of arrayMatches) {
      try {
        const row = JSON.parse(m + "]");
        if (row[0]) {
          const qty = Number(row[1]) || 1;
          const price = Number(row[3]) || 0;
          extractedItems.push({
            raw_name: String(row[0]),
            quantity: qty,
            unit: String(row[2] || "kg"),
            unit_price: price,
            line_total: Number(row[4]) || qty * price,
            note: null,
          });
        }
      } catch {
        // bỏ qua
      }
    }
    if (extractedItems.length > 0) {
      const sub = extractedItems.reduce((acc, curr) => acc + (curr.line_total || 0), 0);
      return {
        supplier_name: null,
        supplier_tax_code: null,
        supplier_phone: null,
        supplier_address: null,
        invoice_number: null,
        order_date: null,
        items: extractedItems,
        excluded_items: [],
        subtotal: sub,
        tax_percent: 0,
        tax_amount: 0,
        total_amount: sub,
      };
    }
  }

  throw new Error("Không thể chuyển đổi phản hồi từ AI thành JSON hợp lệ. Vui lòng chụp ảnh cận cảnh và rõ nét hơn.");
}

/**
 * Trích xuất hóa đơn bằng Groq Vision với cơ chế tự động chờ Retry khi chạm Rate Limit.
 */
async function extractWithGroq(
  base64Data: string,
  mimeType: string,
  apiKey: string
): Promise<InvoiceParsedData> {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const dataUrl = base64Data.startsWith("data:")
    ? base64Data
    : `data:${mimeType || "image/jpeg"};base64,${base64Data}`;

  const sendRequest = async (model: string) => {
    const payload = {
      model,
      messages: [
        {
          role: "system",
          content:
            "Bạn là chuyên gia OCR và kế toán kiểm kho F&B tại Việt Nam. BẮT BUỘC: 1) Không viết lời dẫn hay giải thích. Trả về DUY NHẤT chuỗi JSON bắt đầu bằng { và kết thúc bằng }. 2) CHỈ đưa vào excluded_items nếu THỰC SỰ CÓ NÉT BÚT MỰC GẠCH ĐÈ LÊN DÒNG HÀNG TRONG BẢNG; nếu không có gạch tay thì để mảng rỗng []. 3) Lấy số lượng theo cột SL GIAO (thực giao), lấy đơn giá 1 ĐVT (không nhầm với thành tiền). 4) total_amount là tổng thành tiền thực giao của các dòng trên phiếu.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: INVOICE_OCR_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 800,
    };

    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": "RestaurantERP/1.0",
      },
      body: JSON.stringify(payload),
    });
  };

  const modelsToTry = ["qwen/qwen3.8-27b", "qwen/qwen3.6-27b"];
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await sendRequest(model);

        if (response.status === 429) {
          const errBody = await response.json().catch(() => ({}));
          const errMsg = errBody.error?.message || "";
          const matchWait = errMsg.match(/try again in ([\d.]+)s/);
          const waitSeconds = matchWait ? Math.ceil(parseFloat(matchWait[1])) + 1 : 6;
          console.warn(`Groq 429 Rate Limit trên model ${model}. Tự động chờ ${waitSeconds}s trước lần thử ${attempt + 1}...`);
          await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
          continue;
        }

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Groq API error (${response.status}) on model ${model}: ${errText}`);
        }

        const json = await response.json();
        const text = json.choices?.[0]?.message?.content;
        if (!text) {
          throw new Error(`Mô hình ${model} không nhận được phản hồi.`);
        }

        const parsed = parseJsonSafe(text);
        if (parsed.items && parsed.items.length > 0) {
          return parsed;
        }

        lastError = new Error(`Mô hình ${model} không nhận diện được mặt hàng nào.`);
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`Thử model ${model} trong hóa đơn (lần ${attempt}) thất bại:`, lastError.message);
        if (attempt === 3) break;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("Không thể trích xuất hóa đơn từ ảnh. Hãy chụp lại ảnh rõ nét và ngay ngắn.");
}

/**
 * Trích xuất hóa đơn bằng Google Gemini Vision (2.0 Flash / 1.5 Flash).
 */
async function extractWithGemini(
  base64Data: string,
  mimeType: string,
  apiKey: string
): Promise<InvoiceParsedData> {
  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, "");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        parts: [
          { text: INVOICE_OCR_PROMPT },
          {
            inline_data: {
              mime_type: mimeType || "image/jpeg",
              data: cleanBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: "application/json",
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const json = await response.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Không nhận được nội dung phân tích từ AI.");
  }

  return parseJsonSafe(text);
}

/**
 * Trích xuất hóa đơn bằng OpenAI Vision (gpt-4o-mini).
 */
async function extractWithOpenAI(
  base64Data: string,
  mimeType: string,
  apiKey: string
): Promise<InvoiceParsedData> {
  const url = "https://api.openai.com/v1/chat/completions";
  const dataUrl = base64Data.startsWith("data:")
    ? base64Data
    : `data:${mimeType || "image/jpeg"};base64,${base64Data}`;

  const payload = {
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: INVOICE_OCR_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Trích xuất thông tin hóa đơn trong ảnh đính kèm:" },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    temperature: 0.1,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errText}`);
  }

  const json = await response.json();
  const text = json.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("Không nhận được phản hồi từ OpenAI.");
  }

  return parseJsonSafe(text);
}

/**
 * Hóa đơn mẫu (Demo Invoices) thực tế giúp người dùng kiểm thử ngay lập tức.
 */
export const SAMPLE_DEMO_INVOICES: Array<{
  id: string;
  name: string;
  description: string;
  supplierName: string;
  data: InvoiceParsedData;
}> = [
  {
    id: "rau-cu-qua-da-lat",
    name: "Hóa đơn Nông Sản & Rau Củ Tươi",
    description: "Nhà cung cấp Rau Sạch Đà Lạt Mart (Xà lách, cà chua bi, chanh vàng, dưa chuột...)",
    supplierName: "Công ty TNHH Rau Sạch Đà Lạt Mart",
    data: {
      supplier_name: "Công ty TNHH Rau Sạch Đà Lạt Mart",
      supplier_tax_code: "0314892341",
      supplier_phone: "0908123456",
      supplier_address: "128 Đinh Tiên Hoàng, P.1, TP. Đà Lạt, Lâm Đồng",
      invoice_number: "HD-2026-0892",
      order_date: new Date().toISOString().slice(0, 10),
      items: [
        {
          raw_name: "Xà lách Romaine tươi Đà Lạt",
          quantity: 15,
          unit: "kg",
          unit_price: 32000,
          line_total: 480000,
          note: "Hàng loại 1 chọn lọc",
        },
        {
          raw_name: "Chanh vàng không hạt",
          quantity: 10,
          unit: "kg",
          unit_price: 45000,
          line_total: 450000,
          note: "Tươi mọng nước",
        },
        {
          raw_name: "Cà chua bi Cherry đỏ",
          quantity: 8,
          unit: "kg",
          unit_price: 38000,
          line_total: 304000,
        },
        {
          raw_name: "Dầu Oliu Extra Virgin nguyên chất",
          quantity: 4,
          unit: "chai",
          unit_price: 185000,
          line_total: 740000,
          note: "Chai 1 lít",
        },
      ],
      subtotal: 1974000,
      tax_percent: 0,
      tax_amount: 0,
      total_amount: 1974000,
      confidence_score: 0.98,
    },
  },
  {
    id: "nguyen-lieu-pha-che",
    name: "Hóa đơn Nguyên Liệu Pha Chế & Sữa",
    description: "Công ty Cung ứng Nguyên liệu Tân Nhất Hương (Trà Oolong, Sữa tươi, Kem béo...)",
    supplierName: "Công ty CP Cung Ứng Nguyên Liệu Tân Nhất Hương",
    data: {
      supplier_name: "Công ty CP Cung Ứng Nguyên Liệu Tân Nhất Hương",
      supplier_tax_code: "0102983741",
      supplier_phone: "02838991234",
      supplier_address: "61A Trần Quang Diệu, P.13, Q.3, TP.HCM",
      invoice_number: "TNH-88219",
      order_date: new Date().toISOString().slice(0, 10),
      items: [
        {
          raw_name: "Trà Ô Long Kim Tuyên hảo hạng",
          quantity: 10,
          unit: "gói",
          unit_price: 125000,
          line_total: 1250000,
          note: "Gói 500g",
        },
        {
          raw_name: "Sữa tươi thanh trùng Dalat Milk không đường",
          quantity: 24,
          unit: "hộp",
          unit_price: 34000,
          line_total: 816000,
          note: "Hộp 950ml",
        },
        {
          raw_name: "Kem béo thực vật Rich's Non-Dairy Creamer",
          quantity: 12,
          unit: "hộp",
          unit_price: 28500,
          line_total: 342000,
          note: "Hộp 454g",
        },
        {
          raw_name: "Đường cát trắng Biên Hòa Pure",
          quantity: 20,
          unit: "kg",
          unit_price: 22000,
          line_total: 440000,
        },
      ],
      subtotal: 2848000,
      tax_percent: 8,
      tax_amount: 227840,
      total_amount: 3075840,
      confidence_score: 0.97,
    },
  },
  {
    id: "thit-hai-san",
    name: "Hóa đơn Thực Phẩm Thịt Bò & Hải Sản",
    description: "Đại lý Thực phẩm Sạch Phúc Thịnh (Thịt bò thăn, Ức gà phi lê, Tôm sú...)",
    supplierName: "Đại lý Thực Phẩm Sạch Phúc Thịnh",
    data: {
      supplier_name: "Đại lý Thực Phẩm Sạch Phúc Thịnh",
      supplier_tax_code: "0309981245",
      supplier_phone: "0918889922",
      supplier_address: "Bình Điền, P.7, Q.8, TP.HCM",
      invoice_number: "PT-260901",
      order_date: new Date().toISOString().slice(0, 10),
      items: [
        {
          raw_name: "Thịt bò thăn mềm Úc",
          quantity: 12,
          unit: "kg",
          unit_price: 260000,
          line_total: 3120000,
          note: "Hàng mát bảo quản 2-4 độ C",
        },
        {
          raw_name: "Ức gà phi lê CP tươi",
          quantity: 20,
          unit: "kg",
          unit_price: 75000,
          line_total: 1500000,
        },
        {
          raw_name: "Tôm sú tươi sống size 20-25 con/kg",
          quantity: 5,
          unit: "kg",
          unit_price: 320000,
          line_total: 1600000,
        },
      ],
      subtotal: 6220000,
      tax_percent: 0,
      tax_amount: 0,
      total_amount: 6220000,
      confidence_score: 0.96,
    },
  },
];

/**
 * Trích xuất thông tin hóa đơn tự động:
 * 1. Nếu chỉ định isDemo hoặc chọn mẫu: trả về dữ liệu mẫu tương ứng.
 * 2. ƯU TIÊN HÀNG ĐẦU: Nếu có GROQ_API_KEY (hoặc apiKeyOverride bắt đầu bằng gsk_): gọi Groq Vision (llama-3.2-11b-vision-preview).
 * 3. Nếu có GEMINI_API_KEY: gọi Gemini 2.0 Flash Vision.
 * 4. Nếu có OPENAI_API_KEY: gọi OpenAI Vision gpt-4o-mini.
 * 5. Nếu chưa cấu hình API key: tự động fallback về hóa đơn mẫu demo phù hợp kèm hướng dẫn.
 */
export async function parseInvoiceImage(options: OcrRequestOptions): Promise<{
  data: InvoiceParsedData;
  isMock: boolean;
  modelUsed: string;
}> {
  const overrideKey = options.apiKeyOverride?.trim();
  const groqKey =
    (overrideKey && (overrideKey.startsWith("gsk_") || (!overrideKey.startsWith("AIza") && !overrideKey.startsWith("sk-")))
      ? overrideKey
      : undefined) || process.env.GROQ_API_KEY;
  const geminiKey =
    (overrideKey && overrideKey.startsWith("AIza") ? overrideKey : undefined) || process.env.GEMINI_API_KEY;
  const openaiKey =
    (overrideKey && overrideKey.startsWith("sk-") ? overrideKey : undefined) || process.env.OPENAI_API_KEY;

  if (options.isDemo) {
    const sample = SAMPLE_DEMO_INVOICES[0];
    return {
      data: sample.data,
      isMock: true,
      modelUsed: "Demo Template Mode",
    };
  }

  // 1. Thử gọi Groq API trước tiên
  if (groqKey) {
    try {
      const data = await extractWithGroq(options.base64Data, options.mimeType, groqKey);
      return { data, isMock: false, modelUsed: "Groq Vision AI (LPU)" };
    } catch (err) {
      console.warn("Lỗi trích xuất Groq Vision, kiểm tra fallback...", err);
      // Fallback sang Gemini hoặc OpenAI nếu có
      if (geminiKey) {
        const data = await extractWithGemini(options.base64Data, options.mimeType, geminiKey);
        return { data, isMock: false, modelUsed: "Gemini 2.0 Flash Vision" };
      }
      if (openaiKey) {
        const data = await extractWithOpenAI(options.base64Data, options.mimeType, openaiKey);
        return { data, isMock: false, modelUsed: "OpenAI GPT-4o-mini Vision" };
      }
      throw err;
    }
  }

  // 2. Thử gọi Gemini nếu được cấu hình
  if (geminiKey) {
    try {
      const data = await extractWithGemini(options.base64Data, options.mimeType, geminiKey);
      return { data, isMock: false, modelUsed: "Gemini 2.0 Flash Vision" };
    } catch (err) {
      console.warn("Lỗi trích xuất Gemini, kiểm tra fallback...", err);
      if (openaiKey) {
        const data = await extractWithOpenAI(options.base64Data, options.mimeType, openaiKey);
        return { data, isMock: false, modelUsed: "OpenAI GPT-4o-mini Vision" };
      }
      throw err;
    }
  }

  // 3. Thử gọi OpenAI nếu được cấu hình
  if (openaiKey) {
    const data = await extractWithOpenAI(options.base64Data, options.mimeType, openaiKey);
    return { data, isMock: false, modelUsed: "OpenAI GPT-4o-mini Vision" };
  }

  // 4. Fallback demo: Giúp người dùng trải nghiệm flow hoàn hảo mà chưa cần API key
  const sample = SAMPLE_DEMO_INVOICES[0];
  return {
    data: sample.data,
    isMock: true,
    modelUsed: "Demo Mode (Chưa cấu hình GROQ_API_KEY)",
  };
}

/**
 * Gộp kết quả trích xuất từ nhiều ảnh/nhiều trang hóa đơn thành một đối tượng duy nhất:
 * - Thông tin nhà cung cấp, ngày, số hóa đơn lấy từ trang đầu tiên có dữ liệu.
 * - Danh sách nguyên liệu nối tiếp từ tất cả các trang, tự động khử trùng lặp các dòng giao thoa.
 * - Các mặt hàng gạch bỏ tổng hợp từ tất cả các trang.
 * - Tính lại tổng tiền chuẩn xác từ toàn bộ các dòng hàng thực giao.
 */
export function mergeMultiPageInvoiceData(pages: InvoiceParsedData[]): InvoiceParsedData {
  if (pages.length === 0) {
    throw new Error("Không có dữ liệu hóa đơn nào để gộp.");
  }
  if (pages.length === 1) {
    return pages[0];
  }

  // 1. Tìm thông tin chung (Header info) từ trang đầu tiên có dữ liệu
  const supplierName = pages.find((p) => p.supplier_name?.trim())?.supplier_name || null;
  const supplierTaxCode = pages.find((p) => p.supplier_tax_code?.trim())?.supplier_tax_code || null;
  const supplierPhone = pages.find((p) => p.supplier_phone?.trim())?.supplier_phone || null;
  const supplierAddress = pages.find((p) => p.supplier_address?.trim())?.supplier_address || null;
  const invoiceNumber = pages.find((p) => p.invoice_number?.trim())?.invoice_number || null;
  const orderDate = pages.find((p) => p.order_date?.trim())?.order_date || null;

  // 2. Gộp danh sách hàng hóa (items) tuần tự theo trang và khử trùng lặp dòng overlap
  const allItems: InvoiceParsedItem[] = [];
  for (const page of pages) {
    const pageItems = page.items || [];
    for (const item of pageItems) {
      // Kiểm tra nếu trùng lặp hoàn toàn với dòng cuối cùng đã thêm (trường hợp chụp ảnh 2 trang bị dính lặp dòng cuối trang 1 lên đầu trang 2)
      if (allItems.length > 0) {
        const last = allItems[allItems.length - 1];
        const isDuplicateOverlap =
          last.raw_name.trim().toLowerCase() === item.raw_name.trim().toLowerCase() &&
          last.quantity === item.quantity &&
          last.unit_price === item.unit_price;
        if (isDuplicateOverlap) {
          continue; // Bỏ qua dòng bị trùng giao thoa giữa 2 ảnh
        }
      }
      allItems.push(item);
    }
  }

  // 3. Tổng hợp mặt hàng bị gạch tay trên tất cả các trang
  const excludedSet = new Set<string>();
  for (const page of pages) {
    if (Array.isArray(page.excluded_items)) {
      page.excluded_items.forEach((ex) => {
        if (ex && ex.trim()) excludedSet.add(ex.trim());
      });
    }
  }

  // 4. Tính toán tổng tiền
  const calculatedItemsTotal = allItems.reduce((acc, it) => acc + (it.line_total || 0), 0);
  const lastPageTotal = pages[pages.length - 1]?.total_amount || 0;
  const finalTotal =
    lastPageTotal > 0 && Math.abs(lastPageTotal - calculatedItemsTotal) < 1000
      ? lastPageTotal
      : calculatedItemsTotal;

  return {
    supplier_name: supplierName,
    supplier_tax_code: supplierTaxCode,
    supplier_phone: supplierPhone,
    supplier_address: supplierAddress,
    invoice_number: invoiceNumber,
    order_date: orderDate,
    items: allItems,
    excluded_items: Array.from(excludedSet),
    subtotal: calculatedItemsTotal,
    tax_percent: 0,
    tax_amount: 0,
    total_amount: finalTotal,
  };
}

export interface MultiInvoiceOcrRequestOptions {
  images: Array<{
    base64Data: string;
    mimeType: string;
  }>;
  apiKeyOverride?: string;
  isDemo?: boolean;
}

/**
 * Trích xuất hóa đơn từ một hoặc nhiều ảnh (hóa đơn nhiều trang)
 */
export async function parseMultipleInvoiceImages(
  options: MultiInvoiceOcrRequestOptions
): Promise<{
  data: InvoiceParsedData;
  isMock: boolean;
  modelUsed: string;
}> {
  if (!options.images || options.images.length === 0) {
    throw new Error("Không có ảnh nào để quét.");
  }

  if (options.images.length === 1) {
    return parseInvoiceImage({
      base64Data: options.images[0].base64Data,
      mimeType: options.images[0].mimeType,
      apiKeyOverride: options.apiKeyOverride,
      isDemo: options.isDemo,
    });
  }

  // Quét từng ảnh theo thứ tự trang
  const pageResults: InvoiceParsedData[] = [];
  let lastModelUsed = "Groq Vision AI";
  let isMock = false;

  for (let i = 0; i < options.images.length; i++) {
    const img = options.images[i];
    const res = await parseInvoiceImage({
      base64Data: img.base64Data,
      mimeType: img.mimeType,
      apiKeyOverride: options.apiKeyOverride,
      isDemo: options.isDemo,
    });
    pageResults.push(res.data);
    lastModelUsed = res.modelUsed;
    if (res.isMock) isMock = true;
  }

  const merged = mergeMultiPageInvoiceData(pageResults);
  return {
    data: merged,
    isMock,
    modelUsed: `${lastModelUsed} (${options.images.length} trang)`,
  };
}

