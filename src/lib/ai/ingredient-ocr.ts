import type { IngredientInput } from "@/types/restaurant";
import { normalizeVietnamese } from "@/lib/ai/invoice-matcher";

export type IngredientParsedItem = IngredientInput;

export interface SupplierParsedInfo {
  id?: string | null;
  code?: string | null;
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
  duplicates_removed?: string[];
  excluded_items?: string[];
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

QUY TẮC ĐẶC BIỆT CHO HÌNH ẢNH PHỨC TẠP & BẢNG BIỂU DÀY ĐẶC (COMPLEX / DENSE TABLES):
1. QUÉT HẾT TẤT CẢ CÁC DÒNG - TUYỆT ĐỐI KHÔNG BỎ CUỘC:
   - Dù bảng có 30, 40 hay 60+ dòng mặt hàng, bạn BẮT BUỘC phải duyệt qua từng dòng từ trên xuống dưới.
   - TUYỆT ĐỐI KHÔNG dừng lại giữa chừng, không tóm tắt, không dùng dấu ba chấm (...).
2. BẢNG NHIỀU CỘT HOẶC NHIỀU NHÓM DANH MỤC:
   - Nếu ảnh có bảng chia thành 2 hoặc nhiều cột song song, hoặc chia theo nhóm danh mục (Thịt, Hải sản, Rau củ quả, Gia vị...):
   - Hãy đọc tuần tự cột bên trái từ trên xuống dưới, sau đó đọc tiếp cột bên phải từ trên xuống dưới.
3. HÌNH ẢNH CHỤP NGHIÊNG, MỜ, CHỮ IN KIM (DOT MATRIX) HOẶC HÓA ĐƠN NHIỆT:
   - Chú ý quan sát kỹ các ký tự mờ, ngắt quãng. Phân biệt cẩn thận các con số dễ nhầm lẫn (0, 6, 8, 9; 1 và 7; 3 và 8).
4. QUY TẮC XỬ LÝ NÉT GẠCH TAY / GẠCH BỎ / SỬA TAY:
   - DÒNG BỊ GẠCH TAY (bút bi, bút mực gạch ngang hoặc dấu X qua tên/dòng) = ĐÃ HỦY / HẾT HÀNG -> BẮT BUỘC BỎ QUA KHỎI "items", đưa tên vào "excluded_items".
   - CON SỐ BỊ GẠCH SỬA TAY (số lượng/đơn giá cũ bị gạch và viết con số mới) -> LẤY CON SỐ VIẾT TAY MỚI.
   - DÒNG VIẾT TAY THÊM VÀO (bổ sung hàng) và không bị gạch -> Vẫn quét và đưa vào "items".
5. TỪ VIẾT TẮT NGUYÊN LIỆU F&B:
   - Chuẩn hóa tên nguyên liệu theo thực tế nhà hàng Việt Nam (vd: "th bò" -> "Thịt bò", "cá basa" -> "Cá ba sa", "ba rọi" -> "Thịt ba chỉ", "h.tây" -> "Hành tây", "x.lách" -> "Xà lách", "d.hào" -> "Dầu hào").

CHI TIẾT TRƯỜNG DỮ LIỆU:
- "source_title": Tiêu đề chứng từ (vd: "Phiếu giao hàng", "Bảng báo giá", "Hóa đơn bán hàng").
- "supplier": Thông tin Nhà cung cấp gồm "name", "tax_code", "phone", "address", "contact_name". Nếu không có trên ảnh đặt null.
- "items": Danh sách từng nguyên liệu hợp lệ:
  * "name": Tên nguyên liệu chuẩn tiếng Việt.
  * "code": Mã gợi ý viết hoa không dấu tiền tố NL- (vd: "NL-THITBO", "NL-BOTMI").
  * "category": Nhóm danh mục ("Thịt - Hải sản", "Rau - Củ - Quả", "Gia vị - Nước sốt", "Đồ uống - Pha chế", "Bột - Ngũ cốc", "Bơ - Sữa - Trứng", "Bao bì - Đồ dùng").
  * "base_unit": Đơn vị cơ sở dùng xuất kho (kg, g, lít, ml, quả, hộp, lon, chai, gói, cái, củ, bó).
  * "import_unit": Đơn vị mua/nhập (thùng, bao, kg, két, hộp, lốc, bịch, túi, chai).
  * "conversion_factor": Hệ số quy đổi (số thực >= 1).
  * "default_price": Đơn giá nhập dự kiến cho 1 đơn vị nhập (số nguyên VNĐ).
  * "min_alert_stock": Tồn kho tối thiểu đề xuất (số, mặc định 0).
  * "note": Quy cách hoặc ghi chú.
- "excluded_items": Mảng tên các mặt hàng bị gạch tay loại bỏ.

Cấu trúc JSON bắt buộc:
{
  "source_title": "Phiếu giao hàng",
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
  ],
  "excluded_items": ["Mặt hàng bị gạch tay 1"]
}
`;

function parseJsonSafe(text: string): {
  source_title?: string;
  supplier?: SupplierParsedInfo | null;
  items: IngredientParsedItem[];
  excluded_items?: string[];
} {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // 1. Thử parse trực tiếp
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object") {
      return {
        source_title: parsed.source_title,
        supplier: parsed.supplier || null,
        items: Array.isArray(parsed.items) ? parsed.items : [],
        excluded_items: Array.isArray(parsed.excluded_items) ? parsed.excluded_items : [],
      };
    }
  } catch {
    // bỏ qua, tiếp tục cứu hộ bên dưới
  }

  // 2. Tìm khối JSON { ... }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") {
        return {
          source_title: parsed.source_title,
          supplier: parsed.supplier || null,
          items: Array.isArray(parsed.items) ? parsed.items : [],
          excluded_items: Array.isArray(parsed.excluded_items) ? parsed.excluded_items : [],
        };
      }
    } catch {
      // 3. Phục hồi JSON bị cắt ngắn đuôi do vượt giới hạn token
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
                source_title: recovered.source_title,
                supplier: recovered.supplier || null,
                items: recovered.items,
                excluded_items: Array.isArray(recovered.excluded_items) ? recovered.excluded_items : [],
              };
            }
          } catch {
            // thử tiếp mẫu tiếp theo
          }
        }
      }
    }
  }

  // 4. Cứu hộ khẩn cấp bằng Regex: trích xuất từng object mặt hàng nếu cấu trúc JSON tổng thể bị hỏng
  const extractedItems: IngredientParsedItem[] = [];
  const itemMatches = cleaned.match(/\{[^{}]*"name"[^{}]*\}/g);
  if (itemMatches && itemMatches.length > 0) {
    for (const m of itemMatches) {
      try {
        const itemObj = JSON.parse(m);
        if (itemObj.name && typeof itemObj.name === "string") {
          extractedItems.push({
            name: itemObj.name,
            code: itemObj.code || null,
            category: itemObj.category || null,
            base_unit: itemObj.base_unit || "kg",
            import_unit: itemObj.import_unit || itemObj.base_unit || "kg",
            conversion_factor: Number(itemObj.conversion_factor) || 1,
            default_price: Number(itemObj.default_price) || 0,
            min_alert_stock: Number(itemObj.min_alert_stock) || 0,
            default_supplier_id: null,
            is_active: true,
            note: itemObj.note || null,
          });
        }
      } catch {
        // bỏ qua dòng lỗi cục bộ
      }
    }
    if (extractedItems.length > 0) {
      return {
        source_title: "Phiếu đã phục hồi một phần",
        supplier: null,
        items: extractedItems,
        excluded_items: [],
      };
    }
  }

  throw new Error("Không thể chuyển đổi dữ liệu AI thành danh sách nguyên liệu JSON hợp lệ. Hãy thử chụp ảnh rõ nét và đủ sáng hơn.");
}

/**
 * Trích xuất danh sách nguyên liệu từ ảnh bằng Groq Vision API với cơ chế dự phòng đa mô hình.
 */
async function extractWithGroq(
  base64Data: string,
  mimeType: string,
  apiKey: string
): Promise<{
  source_title?: string;
  supplier?: SupplierParsedInfo | null;
  items: IngredientParsedItem[];
  excluded_items?: string[];
  model_used: string;
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
            "Bạn là chuyên gia OCR và kiểm kho nguyên vật liệu nhà hàng tại Việt Nam. BẮT BUỘC: 1) Nhận diện chính xác các dòng bị GẠCH TAY (bút bi, bút mực, gạch chéo X) là dòng ĐÃ BỎ/HỦY -> TUYỆT ĐỐI KHÔNG ĐƯA VÀO items, ghi tên vào excluded_items. 2) Nếu số lượng bị gạch và viết tay số mới -> Lấy số viết tay mới. 3) Đối với bảng biểu nhiều dòng hoặc nhiều cột, quét đầy đủ tất cả các mặt hàng hợp lệ. Trả về DUY NHẤT chuỗi JSON hợp lệ.",
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
        throw new Error(`Mô hình ${model} không trả về nội dung.`);
      }

      const parsed = parseJsonSafe(text);
      if (parsed.items && parsed.items.length > 0) {
        return {
          ...parsed,
          model_used: model,
        };
      }

      // Nếu model không trích xuất được mặt hàng nào, ghi nhớ lỗi và thử model tiếp theo
      lastError = new Error(`Mô hình ${model} không nhận diện được mặt hàng nào.`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`Thử model OCR ${model} thất bại:`, lastError.message);
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("Không thể nhận diện dữ liệu từ ảnh. Vui lòng kiểm tra lại độ rõ nét của ảnh.");
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

    const uniqueItems: IngredientParsedItem[] = [];
    const seenNames = new Set<string>();
    const seenCodes = new Set<string>();
    const duplicatesRemoved: string[] = [];

    for (const it of rawResult.items || []) {
      const rawName = (it.name || "").trim();
      if (!rawName) continue;

      const normName = normalizeVietnamese(rawName);
      const code = (it.code || "").trim().toUpperCase();

      // Nếu tên hoặc mã đã xuất hiện trước đó trên ảnh -> tự động loại bỏ bản ghi xuất hiện sau
      if (seenNames.has(normName) || (code && seenCodes.has(code))) {
        duplicatesRemoved.push(rawName);
        continue;
      }

      seenNames.add(normName);
      if (code) seenCodes.add(code);

      uniqueItems.push({
        code: code || `NL-${String(uniqueItems.length + 1).padStart(3, "0")}`,
        name: rawName,
        category: it.category || "Gia vị",
        base_unit: it.base_unit || "kg",
        import_unit: it.import_unit || it.base_unit || "kg",
        conversion_factor: Math.max(0.001, Number(it.conversion_factor) || 1),
        min_alert_stock: Math.max(0, Number(it.min_alert_stock) || 0),
        default_price: Math.max(0, Number(it.default_price) || 0),
        default_supplier_id: null,
        is_active: true,
        note: it.note || null,
      });
    }

    return {
      source_title: rawResult.source_title || "Bảng danh mục nguyên liệu",
      supplier: rawResult.supplier || null,
      items: uniqueItems,
      duplicates_removed: duplicatesRemoved,
      excluded_items: rawResult.excluded_items || [],
      model_used: rawResult.model_used ? `Groq (${rawResult.model_used})` : "Groq (qwen/qwen3.8-27b)",
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
