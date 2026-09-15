import type { IngredientInput } from "@/types/restaurant";

export type IngredientParsedItem = IngredientInput;

export interface SupplierParsedInfo {
  name?: string | null;
  tax_code?: string | null;
  phone?: string | null;
  address?: string | null;
  contact_name?: string | null;
}

export interface IngredientOcrResult {
  source_title?: string | null;
  supplier?: SupplierParsedInfo | null;
  supplier_id?: string | null;
  matched_supplier_name?: string | null;
  items: IngredientParsedItem[];
  model_used: string;
  is_mock: boolean;
  image_url?: string | null;
}

export interface IngredientOcrRequestOptions {
  base64Data: string;
  mimeType: string;
  apiKeyOverride?: string;
  isDemo?: boolean;
}

const INGREDIENT_OCR_PROMPT = `
Bạn là chuyên gia OCR và quản lý kho nguyên vật liệu nhà hàng F&B tại Việt Nam.
Nhiệm vụ của bạn là phân tích hình ảnh (bảng báo giá nguyên liệu, phiếu giao hàng, hóa đơn nhập hàng, danh mục sản phẩm, danh sách viết tay hoặc bảng in) và trích xuất TOÀN BỘ các nguyên liệu cùng thông tin Nhà cung cấp vào định dạng JSON.

QUY TẮC BẮT BUỘC VỀ ĐỘ ĐẦY ĐỦ (QUÉT 100% NGUYÊN LIỆU, KHÔNG BỎ SÓT):
1. QUÉT HẾT TẤT CẢ MẶT HÀNG TRÊN ẢNH:
   - Ảnh có thể chứa danh sách rất dài (10, 20, 50, 100 dòng nguyên liệu trở lên).
   - Bạn PHẢI quét và trích xuất TOÀN BỘ từ dòng đầu tiên đến dòng cuối cùng của bảng/ảnh.
   - TUYỆT ĐỐI KHÔNG bỏ qua bất kỳ dòng nào, TUYỆT ĐỐI KHÔNG tóm tắt hay dùng dấu ba chấm (...), TUYỆT ĐỐI KHÔNG dừng lại giữa chừng.
2. BẢNG NHIỀU CỘT HOẶC NHIỀU NHÓM DANH MỤC:
   - Nếu ảnh có bảng chia thành 2 hoặc nhiều cột song song, hoặc chia theo nhóm/tiêu đề danh mục (Thịt, Hải sản, Rau củ quả, Gia vị, Đồ khô, Bơ sữa trứng, Đồ uống, Bao bì, v.v.):
   - Bạn phải đọc tuần tự từng cột, từng nhóm và đưa TẤT CẢ từng mặt hàng vào mảng "items".
3. THÔNG TIN NHÀ CUNG CẤP ("supplier"):
   - Tìm thông tin công ty, cửa hàng, đại lý xuất bảng giá/hóa đơn ở đầu hoặc cuối ảnh:
     "name": Tên nhà cung cấp / đại lý / cửa hàng.
     "tax_code": Mã số thuế (nếu có).
     "phone": Số điện thoại liên hệ / hotline (nếu có).
     "address": Địa chỉ nhà cung cấp (nếu có).
     "contact_name": Người liên hệ / đại diện bán hàng (nếu có).
   - Nếu không có thông tin nhà cung cấp trên ảnh, đặt "supplier": null.
4. CHI TIẾT TỪNG NGUYÊN LIỆU TRONG MẢNG "items":
   - "name": Tên nguyên liệu chuẩn tiếng Việt (vd: "Thịt bò thăn", "Bột mì đa dụng Meizan", "Hành tây Đà Lạt", "Dầu hào Maggi").
   - "code": Mã nguyên liệu viết hoa không dấu bắt đầu bằng NL- (vd: "NL-THITBO", "NL-BOTMI", "NL-HANHTAY").
   - "category": Nhóm danh mục F&B phù hợp (vd: "Thịt - Hải sản", "Rau - Củ - Quả", "Gia vị - Nước sốt", "Đồ uống - Pha chế", "Bột - Ngũ cốc", "Bơ - Sữa - Trứng", "Bao bì - Đồ dùng").
   - "base_unit": Đơn vị cơ sở dùng để định lượng và xuất kho (bắt buộc, vd: "kg", "g", "lít", "ml", "quả", "hộp", "lon", "chai", "gói", "cái", "củ", "bó").
   - "import_unit": Đơn vị mua/nhập từ NCC (vd: "thùng", "bao", "kg", "két", "hộp", "lốc", "bịch", "túi", "chai").
   - "conversion_factor": Hệ số quy đổi (1 Đơn vị nhập = bao nhiêu Đơn vị cơ sở, số thực >= 1).
     Ví dụ:
     - Mua thùng 24 lon: import_unit="thùng", base_unit="lon", conversion_factor=24.
     - Mua bao 25 kg: import_unit="bao", base_unit="kg", conversion_factor=25.
     - Mua theo kg dùng theo kg: import_unit="kg", base_unit="kg", conversion_factor=1.
     - Mua chai 1 lít dùng theo ml: import_unit="chai", base_unit="ml", conversion_factor=1000.
   - "default_price": Đơn giá nhập dự kiến cho 1 đơn vị nhập (số nguyên VNĐ). Nếu không có giá ghi 0.
   - "min_alert_stock": Cảnh báo tồn tối thiểu đề xuất (số, mặc định 0).
   - "note": Quy cách hoặc ghi chú thêm nếu có.

Cấu trúc JSON đầu ra:
{
  "source_title": "Bảng báo giá tháng 09/2026",
  "supplier": {
    "name": "Công ty TNHH Thực Phẩm Sạch GreenFarm",
    "tax_code": "0312345678",
    "phone": "0901234567",
    "address": "123 Nguyễn Văn Cừ, Quận 5, TP.HCM",
    "contact_name": "Nguyễn Văn A"
  },
  "items": [
    {
      "name": "Bột mì đa dụng Meizan",
      "code": "NL-BOTMI-MEIZAN",
      "category": "Bột - Ngũ cốc",
      "base_unit": "kg",
      "import_unit": "bao",
      "conversion_factor": 25,
      "default_price": 450000,
      "min_alert_stock": 2,
      "is_active": true,
      "note": "Bao 25kg"
    }
  ]
}
`;

function parseJsonSafe(text: string): {
  source_title?: string;
  supplier?: SupplierParsedInfo | null;
  items: IngredientParsedItem[];
} {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const candidate = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        // Cố gắng phục hồi nếu JSON bị cắt ngắn đuôi do vượt giới hạn token
        const lastItemEnd = candidate.lastIndexOf("}");
        if (lastItemEnd !== -1) {
          const repaired = candidate.slice(0, lastItemEnd + 1) + "]}";
          try {
            return JSON.parse(repaired);
          } catch {
            // bỏ qua
          }
        }
      }
    }
    throw new Error("Không thể chuyển đổi dữ liệu AI thành danh sách nguyên liệu JSON hợp lệ.");
  }
}

/**
 * Trích xuất danh sách nguyên liệu từ ảnh bằng Groq Vision API.
 */
async function extractWithGroq(
  base64Data: string,
  mimeType: string,
  apiKey: string
): Promise<{
  source_title?: string;
  supplier?: SupplierParsedInfo | null;
  items: IngredientParsedItem[];
}> {
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
            "Bạn là chuyên gia OCR và kho nguyên liệu nhà hàng tại Việt Nam. BẮT BUỘC phân tích và trích xuất TOÀN BỘ 100% tất cả các nguyên liệu trên ảnh vào JSON, không được bỏ sót bất kỳ dòng nào. Trả về DUY NHẤT một chuỗi JSON hợp lệ.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: INGREDIENT_OCR_PROMPT },
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

  let response = await sendRequest("qwen/qwen3.8-27b");

  if (!response.ok) {
    const errStatus = response.status;
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
    throw new Error("Không nhận được nội dung phản hồi từ Groq Vision.");
  }

  return parseJsonSafe(text);
}

/**
 * Trích xuất danh sách nguyên liệu từ ảnh.
 */
export async function parseIngredientsFromImage(
  options: IngredientOcrRequestOptions
): Promise<IngredientOcrResult> {
  const apiKey =
    options.apiKeyOverride ||
    process.env.GROQ_API_KEY ||
    process.env.NEXT_PUBLIC_GROQ_API_KEY ||
    "";

  if (options.isDemo) {
    return getMockIngredientResult();
  }

  if (!apiKey) {
    throw new Error("Chưa cấu hình GROQ_API_KEY để sử dụng tính năng quét AI.");
  }

  try {
    const rawResult = await extractWithGroq(
      options.base64Data,
      options.mimeType,
      apiKey
    );

    const items: IngredientParsedItem[] = (rawResult.items || []).map((it, idx) => ({
      code: it.code || `NL-${String(idx + 1).padStart(3, "0")}`,
      name: it.name || `Nguyên liệu ${idx + 1}`,
      category: it.category || "Gia vị",
      base_unit: it.base_unit || "kg",
      import_unit: it.import_unit || it.base_unit || "kg",
      conversion_factor: Math.max(0.001, Number(it.conversion_factor) || 1),
      min_alert_stock: Math.max(0, Number(it.min_alert_stock) || 0),
      default_price: Math.max(0, Number(it.default_price) || 0),
      default_supplier_id: null,
      is_active: true,
      note: it.note || null,
    }));

    return {
      source_title: rawResult.source_title || "Bảng danh mục nguyên liệu",
      supplier: rawResult.supplier || null,
      items,
      model_used: "Groq (qwen/qwen3.8-27b)",
      is_mock: false,
      image_url: options.base64Data.startsWith("data:")
        ? options.base64Data
        : `data:${options.mimeType || "image/jpeg"};base64,${options.base64Data}`,
    };
  } catch (error) {
    console.error("Lỗi trích xuất nguyên liệu bằng Groq:", error);
    throw error;
  }
}

/**
 * Dữ liệu mẫu nguyên liệu cho chế độ Demo / Kiểm thử.
 */
export function getMockIngredientResult(): IngredientOcrResult {
  return {
    source_title: "Bảng báo giá Đại lý Gia vị & Thực phẩm Khô Toàn Thắng",
    supplier: {
      name: "Đại lý Gia vị & Thực phẩm Khô Toàn Thắng",
      tax_code: "0314892110",
      phone: "0908 123 456",
      address: "Số 45 Đường số 7, Phường Linh Trung, TP. Thủ Đức, TP.HCM",
      contact_name: "Anh Thắng (Chủ đại lý)",
    },
    items: [
      {
        code: "NL-BOTMI-MEIZAN",
        name: "Bột mì đa dụng Meizan",
        category: "Bột - Ngũ cốc",
        base_unit: "kg",
        import_unit: "bao",
        conversion_factor: 25,
        default_price: 450000,
        min_alert_stock: 2,
        default_supplier_id: null,
        is_active: true,
        note: "Bao 25kg nguyên đai",
      },
      {
        code: "NL-DAUAN-SIMPLY",
        name: "Dầu đậu nành Simply 5L",
        category: "Gia vị - Nước sốt",
        base_unit: "chai",
        import_unit: "thùng",
        conversion_factor: 4,
        default_price: 680000,
        min_alert_stock: 3,
        default_supplier_id: null,
        is_active: true,
        note: "Thùng 4 can x 5 lít",
      },
      {
        code: "NL-NUOCMAM-NAMNGU",
        name: "Nước mắm Nam Ngư Đệ Nhị 900ml",
        category: "Gia vị - Nước sốt",
        base_unit: "chai",
        import_unit: "thùng",
        conversion_factor: 15,
        default_price: 360000,
        min_alert_stock: 2,
        default_supplier_id: null,
        is_active: true,
        note: "Thùng 15 chai",
      },
      {
        code: "NL-DUONG-BIENHOA",
        name: "Đường tinh luyện Biên Hòa Pure 1kg",
        category: "Gia vị - Nước sốt",
        base_unit: "kg",
        import_unit: "bao",
        conversion_factor: 50,
        default_price: 1100000,
        min_alert_stock: 1,
        default_supplier_id: null,
        is_active: true,
        note: "Bao 50kg (50 gói x 1kg)",
      },
      {
        code: "NL-SUATUOI-VINAMILK",
        name: "Sữa tươi tiệt trùng Vinamilk không đường 1L",
        category: "Bơ - Sữa - Trứng",
        base_unit: "hộp",
        import_unit: "thùng",
        conversion_factor: 12,
        default_price: 408000,
        min_alert_stock: 4,
        default_supplier_id: null,
        is_active: true,
        note: "Thùng 12 hộp 1L",
      },
      {
        code: "NL-SOT-DAUHAO-LKK",
        name: "Dầu hào Maggi / Lee Kum Kee 510g",
        category: "Gia vị - Nước sốt",
        base_unit: "chai",
        import_unit: "thùng",
        conversion_factor: 24,
        default_price: 720000,
        min_alert_stock: 2,
        default_supplier_id: null,
        is_active: true,
        note: "Thùng 24 chai",
      },
    ],
    model_used: "Mẫu Demo (Mock AI)",
    is_mock: true,
    image_url: "/sample-ingredient-list.png",
  };
}
