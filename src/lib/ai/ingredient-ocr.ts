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
Bạn là chuyên gia OCR và kế toán quản lý kho F&B tại Việt Nam.
Nhiệm vụ: Trích xuất thông tin Nhà cung cấp và TOÀN BỘ các mặt hàng nguyên liệu trên phiếu giao hàng / hóa đơn / bảng giá.

QUY TẮC CỰC KỲ QUAN TRỌNG:
1. MÓN GẠCH BỎ (CANCELLED / STRIKETHROUGH):
   - CHỈ coi một dòng là bị gạch bỏ nếu THỰC SỰ CÓ NÉT BÚT MỰC VIẾT TAY GẠCH ĐÈ LÊN TÊN MẶT HÀNG TRONG BẢNG.
   - Nếu trong bảng KHÔNG CÓ NÉT BÚT VIẾT TAY GẠCH XÓA DÒNG HÀNG thì đặt "excluded": []. TUYỆT ĐỐI KHÔNG TỰ BỊA RA MÓN GẠCH!
   - Dấu tích chữ V, chữ ký người nhận hoặc hình vẽ ở góc phiếu KHÔNG PHẢI là gạch bỏ mặt hàng.

2. ĐƠN GIÁ NGUYÊN LIỆU (BẮT BUỘC LÀ ĐƠN GIÁ 1 ĐƠN VỊ TÍNH, KHÔNG PHẢI THÀNH TIỀN):
   - BẮT BUỘC lấy "Đơn giá" (Giá trước thuế / Unit price) cho 1 ĐVT của mặt hàng.
   - TUYỆT ĐỐI KHÔNG LẤY CỘT "Thành tiền" (Total)!
   - Ví dụ: Gừng mua 0.5kg, đơn giá 30,000 đ/kg, thành tiền 15,000đ -> Giá nguyên liệu BẮT BUỘC là 30000 (đơn giá 1kg), KHÔNG ĐƯỢC lấy 15000.
   - Ví dụ: Ngò rí mua 0.1kg, đơn giá 59,000 đ/kg, thành tiền 5,900đ -> Giá nguyên liệu BẮT BUỘC là 59000, KHÔNG ĐƯỢC lấy 5900.
   - Dòng nào có SL giao = 0 (như Măng tây cồ, Lá mè Nhật) nhưng có in đơn giá thì VẪN LẤY ĐƠN GIÁ (vd Măng tây cồ: 139000, Lá mè: 75000) vì đây là giá nhập của nguyên liệu.

3. ĐỂ TỐI ƯU TỐC ĐỘ VÀ TRÁNH QUÁ TẢI TOKEN, BẮT BUỘC TRẢ VỀ DUY NHẤT MỘT CHUỖI JSON THEO CẤU TRÚC:
{
  "supplier": "Tên đầy đủ nhà cung cấp",
  "phone": "Số điện thoại",
  "address": "Địa chỉ",
  "tax_code": "Mã số thuế nếu có",
  "items": [
    ["Tên nguyên liệu", "ĐVT", Đơn_giá_1_đơn_vị, "Mã_SKU"]
  ],
  "excluded": []
}
`;

function inferCategory(name: string): string {
  const n = name.toLowerCase();
  if (
    n.includes("thịt") ||
    n.includes("bò") ||
    n.includes("heo") ||
    n.includes("gà") ||
    n.includes("cá") ||
    n.includes("tôm") ||
    n.includes("mực") ||
    n.includes("hải sản") ||
    n.includes("tobiko") ||
    n.includes("trứng cá") ||
    n.includes("wasabi") ||
    n.includes("vây cá")
  ) {
    return "Thịt - Hải sản";
  }
  if (n.includes("trứng")) return "Bơ - Sữa - Trứng";
  if (
    n.includes("rau") ||
    n.includes("củ") ||
    n.includes("quả") ||
    n.includes("hành") ||
    n.includes("tỏi") ||
    n.includes("nấm") ||
    n.includes("gừng") ||
    n.includes("đậu") ||
    n.includes("edamame") ||
    n.includes("rong biển") ||
    n.includes("cà chua") ||
    n.includes("hẹ") ||
    n.includes("măng") ||
    n.includes("giá đỗ") ||
    n.includes("lá mè") ||
    n.includes("ngò")
  ) {
    return "Rau - Củ - Quả";
  }
  if (n.includes("mì") || n.includes("gạo") || n.includes("bột") || n.includes("bánh")) {
    return "Bột - Ngũ cốc";
  }
  if (
    n.includes("tương") ||
    n.includes("sốt") ||
    n.includes("xốt") ||
    n.includes("dầu") ||
    n.includes("mắm") ||
    n.includes("muối") ||
    n.includes("đường") ||
    n.includes("tiêu") ||
    n.includes("gia vị") ||
    n.includes("shoyu") ||
    n.includes("sauce")
  ) {
    return "Gia vị - Nước sốt";
  }
  if (n.includes("bia") || n.includes("rượu") || n.includes("nước") || n.includes("trà") || n.includes("cà phê") || n.includes("dừa")) {
    return "Đồ uống - Pha chế";
  }
  if (n.includes("hộp") || n.includes("túi") || n.includes("ly") || n.includes("màng") || n.includes("khay") || n.includes("hoa")) {
    return "Bao bì - Đồ dùng";
  }
  return "Gia vị - Thực phẩm khác";
}

function normalizeParsedData(rawObj: Record<string, unknown>): {
  source_title?: string;
  supplier?: SupplierParsedInfo | null;
  items: IngredientParsedItem[];
  excluded_items?: string[];
} {
  // 1. Chuẩn hóa Nhà cung cấp
  let supplier: SupplierParsedInfo | null = null;
  const rawSup = rawObj.supplier || rawObj.sup || rawObj.supplier_name || rawObj.company_name;
  if (typeof rawSup === "string" && rawSup.trim()) {
    supplier = {
      name: rawSup.trim(),
      phone: (typeof rawObj.phone === "string" ? rawObj.phone : null) || null,
      address: (typeof rawObj.address === "string" ? rawObj.address : null) || null,
      tax_code: (typeof rawObj.tax_code === "string" ? rawObj.tax_code : null) || null,
    };
  } else if (rawSup && typeof rawSup === "object") {
    const sObj = rawSup as Record<string, unknown>;
    supplier = {
      name: (typeof sObj.name === "string" ? sObj.name : null) || null,
      tax_code: (typeof sObj.tax_code === "string" ? sObj.tax_code : null) || null,
      phone: (typeof sObj.phone === "string" ? sObj.phone : null) || null,
      address: (typeof sObj.address === "string" ? sObj.address : null) || null,
      contact_name: (typeof sObj.contact_name === "string" ? sObj.contact_name : null) || null,
    };
  }

  // 2. Chuẩn hóa danh sách mặt hàng bị gạch tay
  const rawExcluded = rawObj.excluded || rawObj.excluded_items || rawObj.del;
  const excluded_items: string[] = Array.isArray(rawExcluded)
    ? rawExcluded.filter((e): e is string => typeof e === "string" && e.trim().length > 0)
    : [];

  // 3. Chuẩn hóa items (hỗ trợ cả dạng mảng con lẫn dạng object)
  const items: IngredientParsedItem[] = [];
  const rawItems = rawObj.items;

  if (Array.isArray(rawItems)) {
    for (const item of rawItems) {
      if (Array.isArray(item)) {
        // Hỗ trợ [name, unit, price, code] HOẶC [name, unit, qty, price, code] HOẶC [name, qty, unit, price, total, code]
        const name = (typeof item[0] === "string" ? item[0] : "").trim();
        if (!name) continue;

        let unit = "kg";
        let price = 0;
        let code: string | null = null;

        if (typeof item[1] === "string" && isNaN(Number(item[1]))) {
          unit = item[1].trim() || "kg";
          if (typeof item[2] === "number" && (item.length === 3 || typeof item[3] === "string")) {
            price = Number(item[2]) || 0;
            code = (typeof item[3] === "string" ? item[3] : "").trim() || null;
          } else {
            // [name, unit, qty, price, code]
            price = Number(item[3]) || Number(item[2]) || 0;
            code = (typeof item[4] === "string" ? item[4] : typeof item[3] === "string" ? item[3] : "").trim() || null;
          }
        } else if (typeof item[2] === "string") {
          // [name, qty, unit, price, total, code]
          unit = item[2].trim() || "kg";
          price = Number(item[3]) || 0;
          code = (typeof item[5] === "string" ? item[5] : typeof item[1] === "string" ? item[1] : "").trim() || null;
        }

        items.push({
          name,
          code,
          category: inferCategory(name),
          base_unit: unit,
          import_unit: unit,
          conversion_factor: 1,
          default_price: price,
          min_alert_stock: 0,
          default_supplier_id: null,
          is_active: true,
          note: null,
        });
      } else if (item && typeof item === "object") {
        // Dạng object truyền thống
        const it = item as Record<string, unknown>;
        const name = (typeof it.name === "string" ? it.name : "").trim();
        if (!name) continue;
        const unit = (typeof it.base_unit === "string" ? it.base_unit : typeof it.unit === "string" ? it.unit : "kg").trim() || "kg";
        const price = Number(it.default_price || it.unit_price || it.price) || 0;
        const code = (typeof it.code === "string" ? it.code : "").trim() || null;

        items.push({
          name,
          code,
          category: (typeof it.category === "string" ? it.category : null) || inferCategory(name),
          base_unit: unit,
          import_unit: (typeof it.import_unit === "string" ? it.import_unit : unit) || unit,
          conversion_factor: Number(it.conversion_factor) || 1,
          default_price: price,
          min_alert_stock: Number(it.min_alert_stock) || 0,
          default_supplier_id: null,
          is_active: true,
          note: (typeof it.note === "string" ? it.note : null) || null,
        });
      }
    }
  }

  return {
    source_title: typeof rawObj.source_title === "string" ? rawObj.source_title : "Phiếu giao hàng / Bảng giá",
    supplier,
    items,
    excluded_items,
  };
}

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
      return normalizeParsedData(parsed as Record<string, unknown>);
    }
  } catch {
    // tiếp tục cứu hộ bên dưới
  }

  // 2. Tìm khối JSON { ... }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") {
        return normalizeParsedData(parsed as Record<string, unknown>);
      }
    } catch {
      // 3. Phục hồi JSON bị cắt ngắn đuôi
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
              return normalizeParsedData(recovered as Record<string, unknown>);
            }
          } catch {
            // thử tiếp mẫu tiếp theo
          }
        }
      }
    }
  }

  // 4. Cứu hộ khẩn cấp bằng Regex nếu mảng items bị cắt
  const extractedItems: IngredientParsedItem[] = [];
  // Tìm mảng con ["...", "...", number, ...]
  const arrayMatches = cleaned.match(/\[\s*"[^"]+"\s*,\s*"[^"]*"\s*,\s*[\d.]+\s*,\s*[\d.]+/g);
  if (arrayMatches && arrayMatches.length > 0) {
    for (const m of arrayMatches) {
      try {
        const row = JSON.parse(m + "]");
        if (row[0]) {
          extractedItems.push({
            name: String(row[0]),
            code: row[4] ? String(row[4]) : null,
            category: inferCategory(String(row[0])),
            base_unit: String(row[1] || "kg"),
            import_unit: String(row[1] || "kg"),
            conversion_factor: 1,
            default_price: Number(row[3]) || 0,
            min_alert_stock: 0,
            default_supplier_id: null,
            is_active: true,
            note: null,
          });
        }
      } catch {
        // bỏ qua dòng lỗi
      }
    }
  }

  // Cứu hộ supplier từ văn bản
  let rescuedSupplier: SupplierParsedInfo | null = null;
  const supMatch = cleaned.match(/"(?:supplier|sup|supplier_name)"\s*:\s*(?:\{[^}]*"name"\s*:\s*"([^"]+)"|"([^"]+)")/);
  if (supMatch) {
    const sName = (supMatch[1] || supMatch[2] || "").trim();
    if (sName) {
      rescuedSupplier = { name: sName };
    }
  }

  // Cứu hộ excluded_items từ văn bản
  const rescuedExcluded: string[] = [];
  const delBlockMatch = cleaned.match(/"(?:del|excluded|excluded_items)"\s*:\s*\[([\s\S]*?)(\]|$)/);
  if (delBlockMatch && delBlockMatch[1]) {
    const names = delBlockMatch[1].match(/"([^"]+)"/g);
    if (names) {
      names.forEach((n) => {
        const val = n.replace(/"/g, "").trim();
        if (val && !rescuedExcluded.includes(val)) rescuedExcluded.push(val);
      });
    }
  }

  if (extractedItems.length > 0) {
    return {
      source_title: "Phiếu giao hàng / Bảng giá",
      supplier: rescuedSupplier,
      items: extractedItems,
      excluded_items: rescuedExcluded,
    };
  }

  throw new Error("Không thể chuyển đổi dữ liệu AI thành danh sách nguyên liệu JSON hợp lệ. Hãy thử chụp ảnh rõ nét và đủ sáng hơn.");
}

/**
 * Trích xuất danh sách nguyên liệu từ ảnh bằng Groq Vision API với cơ chế tự động chờ Retry khi chạm Rate Limit.
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
            "Bạn là chuyên gia OCR và kiểm kho F&B tại Việt Nam. BẮT BUỘC: 1) Không viết lời dẫn hay giải thích. Trả về DUY NHẤT chuỗi JSON bắt đầu bằng { và kết thúc bằng }. 2) CHỈ đưa vào excluded nếu THỰC SỰ CÓ NÉT BÚT MỰC GẠCH ĐÈ LÊN DÒNG HÀNG TRONG BẢNG; nếu không có gạch tay thì để mảng rỗng []. 3) Giá nguyên liệu BẮT BUỘC là ĐƠN GIÁ 1 ĐƠN VỊ TÍNH (Giá trước thuế / Unit price), TUYỆT ĐỐI KHÔNG LẤY THÀNH TIỀN.",
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
      max_tokens: 950, // Tối ưu 950 token để đọc trọn vẹn hóa đơn dài dưới trần 1000 OTPM
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
    // Tự động thử lại tối đa 3 lần nếu gặp lỗi Rate Limit (429)
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
          throw new Error(`Mô hình ${model} không trả về nội dung.`);
        }

        const parsed = parseJsonSafe(text);
        if (parsed.items && parsed.items.length > 0) {
          return {
            ...parsed,
            model_used: model,
          };
        }

        lastError = new Error(`Mô hình ${model} không nhận diện được mặt hàng nào.`);
        break; // Nếu parse được nhưng không có item, chuyển sang model tiếp theo
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`Thử model OCR ${model} (lần ${attempt}) thất bại:`, lastError.message);
        if (attempt === 3) break;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
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
