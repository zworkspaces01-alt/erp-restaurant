import type { InvoiceParsedData, InvoiceParsedItem } from "@/types/restaurant";

export interface OcrRequestOptions {
  base64Data: string;
  mimeType: string;
  apiKeyOverride?: string;
  isDemo?: boolean;
}

const INVOICE_OCR_PROMPT = `
Bạn là chuyên gia OCR và kế toán nhà hàng tại Việt Nam.
Nhiệm vụ của bạn là đọc hình ảnh hóa đơn / chứng từ mua hàng / phiếu giao hàng của nhà cung cấp và trích xuất thông tin sang định dạng JSON thuần túy.

QUY TẮC ĐẶC BIỆT QUAN TRỌNG: XỬ LÝ NÉT GẠCH TAY / GẠCH BỎ / SỬA TAY (HANDWRITTEN STRIKETHROUGH & CORRECTIONS):
1. DÒNG BỊ GẠCH TAY LÀ BỎ (CANCELLED / STRUCK-THROUGH ITEMS):
   - Khi giao nhận hàng thực tế tại nhà hàng, bên giao hoặc bên nhận dùng bút bi, bút lông, bút mực GẠCH NGANG qua tên mặt hàng, GẠCH CHÉO (X) hoặc GẠCH XÓA cả dòng: ĐÂY LÀ HÀNG HỦY / KHÔNG GIAO / TỪ CHỐI NHẬN.
   - BẮT BUỘC: Bạn PHẢI LOẠI BỎ HOÀN TOÀN các dòng bị gạch tay này! TUYỆT ĐỐI KHÔNG đưa vào mảng "items".
   - Liệt kê tên các mặt hàng bị gạch tay này vào mảng "excluded_items" (ví dụ: ["Cá bớp", "Thịt bò thăn"]).
2. SỐ LƯỢNG HOẶC ĐƠN GIÁ BỊ GẠCH SỬA TAY (HANDWRITTEN OVERRIDES):
   - Nếu dòng mặt hàng KHÔNG bị gạch bỏ cả dòng, nhưng có con số (số lượng, đơn giá) bị gạch ngang và có chữ số viết tay bên cạnh (hoặc trên/dưới):
   - BẮT BUỘC: LẤY THEO CON SỐ VIẾT TAY MỚI (đây là số lượng/giá thực giao thực nhận), BỎ QUA con số in cũ bị gạch.
   - Tính lại "line_total" = quantity (thực nhận) * unit_price.
3. DÒNG MẶT HÀNG VIẾT TAY THÊM (HANDWRITTEN ADDITIONS):
   - Nếu có dòng mặt hàng được viết tay bổ sung vào phiếu và không bị gạch xóa: vẫn quét và đưa vào "items".
4. TỔNG TIỀN (total_amount & subtotal):
   - Chỉ tính tổng tiền của các mặt hàng THỰC NHẬN (chỉ cộng các dòng KHÔNG bị gạch bỏ).
   - Nếu ở cuối phiếu tổng tiền in cũ bị gạch và có tổng tiền viết tay mới, lấy tổng tiền viết tay mới.

Quy tắc trích xuất các trường:
1. "supplier_name": Tên công ty / cửa hàng / đại lý bán hàng / nhà cung cấp.
2. "supplier_tax_code": Mã số thuế nếu có (chuỗi số).
3. "supplier_phone": Số điện thoại liên hệ nếu có.
4. "supplier_address": Địa chỉ nhà cung cấp nếu có.
5. "invoice_number": Số hóa đơn / Số chứng từ / Mã phiếu xuất kho.
6. "order_date": Ngày lập hóa đơn theo định dạng YYYY-MM-DD (nếu không rõ năm, dùng năm hiện tại 2026).
7. "items": Mảng các mặt hàng nguyên liệu / thực phẩm thực nhận (KHÔNG chứa các dòng bị gạch tay):
   - "raw_name": Tên chính xác mặt hàng như ghi trên hóa đơn.
   - "quantity": Số lượng thực nhận (dạng số thập phân hoặc nguyên dương, ưu tiên số viết tay sửa lại nếu có).
   - "unit": Đơn vị tính (kg, g, lít, ml, thùng, hộp, gói, lon, chai, bó, cây, bịch...).
   - "unit_price": Đơn giá trên 1 đơn vị tính (dạng số, bỏ dấu chấm/phẩy ngăn cách hàng nghìn).
   - "line_total": Thành tiền của dòng hàng (quantity * unit_price).
   - "note": Ghi chú hoặc quy cách đóng gói (nếu có).
8. "excluded_items": Mảng các tên mặt hàng bị gạch tay loại bỏ (ví dụ: ["Cá basa", "Hành hoa"]).
9. "subtotal": Tổng tiền hàng trước thuế của các dòng thực nhận.
10. "tax_percent": Tỷ lệ thuế VAT (ví dụ 8 hoặc 10 nếu có, không có thì 0).
11. "tax_amount": Tiền thuế VAT (nếu có).
12. "total_amount": Tổng số tiền thanh toán cuối cùng của hóa đơn (ưu tiên số viết tay sửa lại ở cuối phiếu).

Trả về DUY NHẤT một chuỗi JSON hợp lệ không có markdown backtick, cấu trúc đúng như sau:
{
  "supplier_name": "...",
  "supplier_tax_code": "...",
  "supplier_phone": "...",
  "supplier_address": "...",
  "invoice_number": "...",
  "order_date": "YYYY-MM-DD",
  "items": [
    {
      "raw_name": "...",
      "quantity": 10,
      "unit": "kg",
      "unit_price": 45000,
      "line_total": 450000,
      "note": null
    }
  ],
  "excluded_items": ["Mặt hàng gạch tay 1"],
  "subtotal": 450000,
  "tax_percent": 0,
  "tax_amount": 0,
  "total_amount": 450000
}
`;

function parseJsonSafe(text: string): InvoiceParsedData {
  // Loại bỏ các khối suy nghĩ <think>...</think> của mô hình Qwen reasoning nếu có
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // 1. Thử parse trực tiếp
  try {
    const parsed = JSON.parse(cleaned) as InvoiceParsedData;
    if (parsed && typeof parsed === "object") {
      return {
        supplier_name: parsed.supplier_name || null,
        supplier_tax_code: parsed.supplier_tax_code || null,
        supplier_phone: parsed.supplier_phone || null,
        supplier_address: parsed.supplier_address || null,
        invoice_number: parsed.invoice_number || null,
        order_date: parsed.order_date || null,
        items: Array.isArray(parsed.items) ? parsed.items : [],
        excluded_items: Array.isArray(parsed.excluded_items) ? parsed.excluded_items : [],
        subtotal: Number(parsed.subtotal) || 0,
        tax_percent: Number(parsed.tax_percent) || 0,
        tax_amount: Number(parsed.tax_amount) || 0,
        total_amount: Number(parsed.total_amount) || 0,
      };
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
      const parsed = JSON.parse(candidate) as InvoiceParsedData;
      if (parsed && typeof parsed === "object") {
        return {
          supplier_name: parsed.supplier_name || null,
          supplier_tax_code: parsed.supplier_tax_code || null,
          supplier_phone: parsed.supplier_phone || null,
          supplier_address: parsed.supplier_address || null,
          invoice_number: parsed.invoice_number || null,
          order_date: parsed.order_date || null,
          items: Array.isArray(parsed.items) ? parsed.items : [],
          excluded_items: Array.isArray(parsed.excluded_items) ? parsed.excluded_items : [],
          subtotal: Number(parsed.subtotal) || 0,
          tax_percent: Number(parsed.tax_percent) || 0,
          tax_amount: Number(parsed.tax_amount) || 0,
          total_amount: Number(parsed.total_amount) || 0,
        };
      }
    } catch {
      // 3. Phục hồi nếu bị ngắt đuôi
      const lastItemEnd = candidate.lastIndexOf("}");
      if (lastItemEnd > 0) {
        const truncatedSlice = candidate.slice(0, lastItemEnd + 1);
        const recoveryPatterns = [
          truncatedSlice + "]}",
          truncatedSlice + "}]}",
          truncatedSlice + "}",
        ];
        for (const pattern of recoveryPatterns) {
          try {
            const recovered = JSON.parse(pattern);
            if (recovered && Array.isArray(recovered.items)) {
              return {
                supplier_name: recovered.supplier_name || null,
                supplier_tax_code: recovered.supplier_tax_code || null,
                supplier_phone: recovered.supplier_phone || null,
                supplier_address: recovered.supplier_address || null,
                invoice_number: recovered.invoice_number || null,
                order_date: recovered.order_date || null,
                items: recovered.items,
                excluded_items: Array.isArray(recovered.excluded_items) ? recovered.excluded_items : [],
                subtotal: Number(recovered.subtotal) || 0,
                tax_percent: Number(recovered.tax_percent) || 0,
                tax_amount: Number(recovered.tax_amount) || 0,
                total_amount: Number(recovered.total_amount) || 0,
              };
            }
          } catch {
            // thử tiếp
          }
        }
      }
    }
  }

  // 4. Cứu hộ khẩn cấp bằng Regex nếu JSON bị lỗi cú pháp nhưng có các dòng hàng
  const extractedItems: InvoiceParsedItem[] = [];
  const itemMatches = cleaned.match(/\{[^{}]*"raw_name"[^{}]*\}/g);
  if (itemMatches && itemMatches.length > 0) {
    for (const m of itemMatches) {
      try {
        const it = JSON.parse(m);
        if (it.raw_name) {
          extractedItems.push({
            raw_name: it.raw_name,
            quantity: Number(it.quantity) || 1,
            unit: it.unit || "kg",
            unit_price: Number(it.unit_price) || 0,
            line_total: Number(it.line_total) || 0,
            note: it.note || null,
          });
        }
      } catch {
        // bỏ qua
      }
    }
    if (extractedItems.length > 0) {
      return {
        supplier_name: null,
        supplier_tax_code: null,
        supplier_phone: null,
        supplier_address: null,
        invoice_number: null,
        order_date: null,
        items: extractedItems,
        excluded_items: [],
        subtotal: extractedItems.reduce((acc, curr) => acc + (curr.line_total || 0), 0),
        tax_percent: 0,
        tax_amount: 0,
        total_amount: extractedItems.reduce((acc, curr) => acc + (curr.line_total || 0), 0),
      };
    }
  }

  throw new Error("Không thể chuyển đổi phản hồi từ AI thành JSON hợp lệ. Vui lòng chụp ảnh cận cảnh và rõ nét hơn.");
}

/**
 * Trích xuất hóa đơn bằng Groq Vision với cơ chế dự phòng tự động.
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
            "Bạn là chuyên gia OCR và kế toán kiểm kho nhà hàng tại Việt Nam. BẮT BUỘC: 1) Nhận diện chính xác các dòng bị GẠCH TAY (bút bi, bút mực, gạch chéo X) là dòng ĐÃ BỎ/HỦY -> TUYỆT ĐỐI KHÔNG ĐƯA VÀO items, ghi tên vào excluded_items. 2) Nếu số lượng bị gạch và viết tay số mới -> Lấy số viết tay mới. 3) Quét tuần tự và trích xuất tất cả các mặt hàng hợp lệ trên hóa đơn/bảng biểu. Trả về DUY NHẤT một chuỗi JSON hợp lệ theo đúng cấu trúc yêu cầu.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: INVOICE_OCR_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 14000,
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
    try {
      const response = await sendRequest(model);
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
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`Thử model ${model} trong hóa đơn thất bại:`, lastError.message);
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
