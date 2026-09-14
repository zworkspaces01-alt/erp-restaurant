import type { InvoiceParsedData } from "@/types/restaurant";

export interface OcrRequestOptions {
  base64Data: string;
  mimeType: string;
  apiKeyOverride?: string;
  isDemo?: boolean;
}

const INVOICE_OCR_PROMPT = `
Bạn là chuyên gia OCR và kế toán nhà hàng tại Việt Nam.
Nhiệm vụ của bạn là đọc hình ảnh hóa đơn / chứng từ mua hàng / phiếu giao hàng của nhà cung cấp và trích xuất thông tin sang định dạng JSON thuần túy.

Quy tắc trích xuất:
1. "supplier_name": Tên công ty / cửa hàng / đại lý bán hàng / nhà cung cấp.
2. "supplier_tax_code": Mã số thuế nếu có (chuỗi số).
3. "supplier_phone": Số điện thoại liên hệ nếu có.
4. "supplier_address": Địa chỉ nhà cung cấp nếu có.
5. "invoice_number": Số hóa đơn / Số chứng từ / Mã phiếu xuất kho.
6. "order_date": Ngày lập hóa đơn theo định dạng YYYY-MM-DD (nếu không rõ năm, dùng năm hiện tại 2026).
7. "items": Mảng các mặt hàng nguyên liệu / thực phẩm được mua:
   - "raw_name": Tên chính xác mặt hàng như ghi trên hóa đơn.
   - "quantity": Số lượng (dạng số thập phân hoặc nguyên dương).
   - "unit": Đơn vị tính (kg, g, lít, ml, thùng, hộp, gói, lon, chai, bó, cây, bịch...).
   - "unit_price": Đơn giá trên 1 đơn vị tính (dạng số, bỏ dấu chấm/phẩy ngăn cách hàng nghìn).
   - "line_total": Thành tiền của dòng hàng (quantity * unit_price).
   - "note": Ghi chú hoặc quy cách đóng gói (nếu có).
8. "subtotal": Tổng tiền hàng trước thuế.
9. "tax_percent": Tỷ lệ thuế VAT (ví dụ 8 hoặc 10 nếu có, không có thì 0).
10. "tax_amount": Tiền thuế VAT (nếu có).
11. "total_amount": Tổng số tiền thanh toán cuối cùng của hóa đơn.

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
  "subtotal": 450000,
  "tax_percent": 0,
  "tax_amount": 0,
  "total_amount": 450000
}
`;

function parseJsonSafe(text: string): InvoiceParsedData {
  // Loại bỏ các khối suy nghĩ <think>...</think> của mô hình Qwen reasoning nếu có
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  try {
    return JSON.parse(cleaned) as InvoiceParsedData;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]) as InvoiceParsedData;
    }
    throw new Error("Không thể chuyển đổi phản hồi từ AI thành JSON hợp lệ.");
  }
}

/**
 * Trích xuất hóa đơn bằng Groq Vision (qwen/qwen3.8-27b & qwen/qwen3.6-27b).
 * Groq cung cấp tốc độ phản hồi cực nhanh trên phần cứng LPU.
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
            "Bạn là chuyên gia OCR và kế toán nhà hàng tại Việt Nam. BẮT BUỘC trả về duy nhất chuỗi JSON hợp lệ theo đúng cấu trúc yêu cầu. Không thêm bất kỳ văn bản chào hỏi, giải thích hay thẻ markdown nào.",
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
      max_tokens: 3500,
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

  let response = await sendRequest("qwen/qwen3.8-27b");

  if (!response.ok) {
    const errStatus = response.status;
    // Thử model qwen3.6-27b nếu 3.8 bận hoặc gặp giới hạn
    if (errStatus === 429 || errStatus === 400 || errStatus === 503) {
      try {
        const fallbackRes = await sendRequest("qwen/qwen3.6-27b");
        if (fallbackRes.ok) {
          response = fallbackRes;
        }
      } catch {
        // giữ nguyên phản hồi ban đầu
      }
    }
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errText}`);
  }

  const json = await response.json();
  const text = json.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("Không nhận được nội dung trích xuất từ Groq.");
  }

  return parseJsonSafe(text);
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
