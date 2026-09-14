import type { IngredientInput } from "@/types/restaurant";

export type IngredientParsedItem = IngredientInput;

export interface IngredientOcrResult {
  source_title?: string | null;
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
Bạn là chuyên gia quản lý kho và danh mục nguyên vật liệu nhà hàng tại Việt Nam.
Nhiệm vụ của bạn là phân tích hình ảnh (bảng báo giá nguyên liệu, phiếu giao hàng, hóa đơn, bảng kê danh mục sản phẩm, hoặc nhãn bao bì sản phẩm) và trích xuất danh sách các NGUYÊN LIỆU vào định dạng JSON thuần túy.

Quy tắc trích xuất cho từng nguyên liệu:
1. "name": Tên nguyên liệu chuẩn tiếng Việt (vd: "Thịt bò thăn", "Bột mì đa dụng Meizan", "Sữa tươi Vinamilk không đường", "Dầu hào Lee Kum Kee").
2. "code": Mã nguyên liệu gợi ý (viết hoa không dấu, bắt đầu bằng NL-, vd: "NL-THITBO", "NL-BOTMI", "NL-SUATUOI").
3. "category": Danh mục gợi ý chuẩn F&B (vd: "Thịt - Hải sản", "Rau - Củ - Quả", "Gia vị - Nước sốt", "Đồ uống - Pha chế", "Bột - Ngũ cốc", "Bơ - Sữa - Trứng", "Bao bì - Đồ dùng").
4. "base_unit": Đơn vị cơ sở dùng để định lượng và xuất kho (bắt buộc, vd: "kg", "g", "lít", "ml", "quả", "hộp", "lon", "chai", "gói", "cái").
5. "import_unit": Đơn vị mua/nhập từ nhà cung cấp (bắt buộc, vd: "thùng", "bao", "kg", "két", "hộp", "lốc", "bịch").
6. "conversion_factor": Hệ số quy đổi (1 Đơn vị nhập = bao nhiêu Đơn vị cơ sở, số thực >= 1).
   Ví dụ:
   - Mua thùng 24 lon: import_unit = "thùng", base_unit = "lon", conversion_factor = 24.
   - Mua bao 25 kg: import_unit = "bao", base_unit = "kg", conversion_factor = 25.
   - Mua theo kg dùng theo kg: import_unit = "kg", base_unit = "kg", conversion_factor = 1.
   - Mua chai 1 lít dùng theo ml: import_unit = "chai", base_unit = "ml", conversion_factor = 1000.
7. "default_price": Đơn giá nhập ngầm định (cho 1 đơn vị nhập, dạng số nguyên VNĐ, bỏ dấu phẩy/chấm). Nếu không có giá trên ảnh, điền 0.
8. "min_alert_stock": Mức cảnh báo tồn tối thiểu đề xuất (dạng số, vd: 5 hoặc 10, mặc định 0).
9. "note": Ghi chú quy cách hoặc xuất xứ nếu có (vd: "Thùng 24 lon x 330ml", "Quy cách bao 25kg").

Trả về DUY NHẤT một chuỗi JSON hợp lệ không có markdown backtick:
{
  "source_title": "Tên bảng giá hoặc nhà cung cấp nếu có",
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

function parseJsonSafe(text: string): { source_title?: string; items: IngredientParsedItem[] } {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error("Không thể chuyển đổi phản hồi từ AI thành JSON danh sách nguyên liệu hợp lệ.");
  }
}

/**
 * Trích xuất danh sách nguyên liệu từ ảnh bằng Groq Vision API.
 */
async function extractWithGroq(
  base64Data: string,
  mimeType: string,
  apiKey: string
): Promise<{ source_title?: string; items: IngredientParsedItem[] }> {
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
            "Bạn là chuyên gia OCR và kho nguyên liệu nhà hàng tại Việt Nam. BẮT BUỘC trả về duy nhất chuỗi JSON hợp lệ theo đúng cấu trúc yêu cầu. Không thêm bất kỳ văn bản chào hỏi hay giải thích nào.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: INGREDIENT_OCR_PROMPT },
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

  if (!apiKey || options.isDemo) {
    return getMockIngredientResult();
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
      items,
      model_used: "Groq (qwen/qwen3.8-27b)",
      is_mock: false,
      image_url: options.base64Data.startsWith("data:")
        ? options.base64Data
        : `data:${options.mimeType || "image/jpeg"};base64,${options.base64Data}`,
    };
  } catch (error) {
    // Nếu lỗi Groq API mà đang thử nghiệm thì fallback mock data
    console.warn("Groq Ingredient OCR thất bại, sử dụng dữ liệu mẫu:", error);
    return getMockIngredientResult();
  }
}

/**
 * Dữ liệu mẫu nguyên liệu cho chế độ Demo / Kiểm thử.
 */
export function getMockIngredientResult(): IngredientOcrResult {
  return {
    source_title: "Bảng báo giá Đại lý Gia vị & Thực phẩm Khô Toàn Thắng",
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
