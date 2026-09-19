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
1. BẢO ĐẢM ĐỌC ĐỦ TOÀN BỘ CÁC DÒNG (KHÔNG BỎ SÓT BẤT KỲ DÒNG NÀO):
   - Đọc tuần tự theo cột Số TT từ dòng 001 đến dòng cuối cùng của bảng hóa đơn (ví dụ 019 hoặc nhiều hơn).
   - TUYỆT ĐỐI KHÔNG dừng lại giữa chừng! Kể cả những dòng có nét bút bi gạch đè (như Hạt bạch quả, Vỏ tắc...) VẪN PHẢI ĐỌC ĐẦY ĐỦ VÀO "items" (đồng thời ghi tên các món bị gạch đó vào "excluded_items").
   - Người dùng sẽ xem và tự xóa thủ công nếu cần.

2. MÓN GẠCH BỎ TRÊN HÓA ĐƠN:
   - VẪN ĐỌC ĐẦY ĐỦ TẤT CẢ CÁC MẶT HÀNG TRÊN HÓA ĐƠN VÀO "items".
   - Nếu dòng nào có nét bút bi viết tay gạch đè xóa dòng, hãy ghi vào "excluded_items" tên các món đó để hệ thống hiển thị cảnh báo cho người dùng dễ nhìn thấy để xóa thủ công.
   - "total_amount": Đọc đúng ô tổng thanh toán in trên hóa đơn.

3. PHÂN BIỆT "SL ĐẶT" VÀ "SL GIAO" (HÀNG THỰC GIAO):
   - Cột "SL giao" (Fulfilled qty) là số lượng THỰC TẾ GIAO ĐỢT NÀY -> BẮT BUỘC LẤY SỐ LƯỢNG THEO CỘT "SL GIAO".
   - Dòng nào có SL giao = 0.00 (như Măng tây cồ: SL đặt 0.5, SL giao 0.00; Lá mè Nhật: SL đặt 1.0, SL giao 0.00):
     -> SL giao là 0, Thành tiền là 0.

4. PHÂN BIỆT RÕ "ĐƠN GIÁ" (UNIT PRICE) VÀ "THÀNH TIỀN" (LINE TOTAL):
   - "Đơn giá" (Giá trước thuế / Unit price): giá của 1 đơn vị tính (vd: Gừng là 30,000 đ/kg; Hẹ lá là 55,000 đ/kg; Ngò rí là 59,000 đ/kg).
   - "Thành tiền" (Line total): = SL giao * Đơn giá.
   - TUYỆT ĐỐI KHÔNG lấy Thành tiền làm Đơn giá!

5. MẶT HÀNG CHỊU THUẾ VÀ KHÔNG CHỊU THUẾ (VAT THEO TỪNG MẶT HÀNG):
   - Nông sản tươi sống, rau củ quả thô, thịt cá tươi sống chưa qua chế biến: Thuế suất là 0.
   - Hàng chế biến, đóng hộp, bơ sữa, dầu ăn, gia vị công nghiệp, bao bì...: Thuế suất là 5, 8 hoặc 10.
   - Trích xuất trường Thuế_suất_% cho từng dòng (0 nếu không chịu thuế, hoặc 5, 8, 10 nếu chịu thuế).

6. HÓA ĐƠN CÓ 2 HỆ THỐNG CỘT GIÁ (TRƯỚC THUẾ VÀ SAU THUẾ - VÍ DỤ SIM BA, METRO...):
   - Một số hóa đơn in cùng lúc: "Đơn giá (- VAT)", "Thành tiền (- VAT)", "VAT %" và "Đơn giá (+ VAT)", "Thành tiền (+ VAT)".
   - QUY TẮC: Lấy "Đơn giá (- VAT)" làm Đơn_giá_1_đơn_vị và đọc đúng cột "VAT %" của từng dòng.
   - KIỂM TRA SỐ HỌC BẮT BUỘC: Nếu trên phiếu có nét bút mực xanh quẹt đè lên số in sẵn (ví dụ máy in 4,00 nhưng bị quẹt bút bi trông giống số 1 thành 14, máy in 2,00 trông giống 12):
     -> BẮT BUỘC lấy Thành tiền / Đơn giá (138.000 / 34.500 = 4; 600.000 / 300.000 = 2) để lấy đúng số lượng in máy, TUYỆT ĐỐI KHÔNG đọc nhầm nét quẹt bút thành 14 hay 12!

Trả về DUY NHẤT một chuỗi JSON hợp lệ theo đúng cấu trúc sau:
{
  "supplier_name": "Tên nhà cung cấp / công ty",
  "supplier_tax_code": "Mã số thuế nếu có",
  "supplier_phone": "Số điện thoại",
  "supplier_address": "Địa chỉ",
  "invoice_number": "Mã phiếu / Số hóa đơn",
  "order_date": "YYYY-MM-DD",
  "items": [
    ["Tên mặt hàng", SL_giao, "ĐVT", Đơn_giá_1_đơn_vị, Thuế_suất_%]
  ],
  "excluded_items": ["Tên món bị gạch bỏ nếu có"],
  "subtotal": 4730000,
  "tax_percent": 0,
  "tax_amount": 310240,
  "total_amount": 5040240
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
          // Dạng mảng tinh gọn: [name, qty, unit, price, vat] hoặc [name, qty, unit, price, total, vat]
          const name = (typeof it[0] === "string" ? it[0] : "").trim();
          let qty = typeof it[1] === "number" ? it[1] : (!isNaN(Number(it[1])) && it[1] !== "" && it[1] !== null) ? Number(it[1]) : 0;
          const unit = (typeof it[2] === "string" ? it[2] : "kg").trim() || "kg";
          const price = typeof it[3] === "number" ? it[3] : (!isNaN(Number(it[3])) && it[3] !== "" && it[3] !== null) ? Number(it[3]) : 0;

          let total = 0;
          let taxRate = 0;

          if (it.length >= 6) {
            total = typeof it[4] === "number" ? it[4] : (!isNaN(Number(it[4])) && it[4] !== "" && it[4] !== null) ? Number(it[4]) : qty * price;
            const rawTaxRate = it[5];
            taxRate = typeof rawTaxRate === "number" ? rawTaxRate : (!isNaN(Number(rawTaxRate)) && rawTaxRate !== "" && rawTaxRate !== null) ? Number(rawTaxRate) : 0;
          } else if (it.length === 5) {
            const val4 = typeof it[4] === "number" ? it[4] : (!isNaN(Number(it[4])) && it[4] !== "" && it[4] !== null) ? Number(it[4]) : 0;
            if (price > 500 && (val4 === 0 || val4 === 5 || val4 === 8 || val4 === 10) && Math.abs(val4 - qty * price) > 500) {
              taxRate = val4;
              total = qty * price;
            } else if (Math.abs(val4 - qty * price) < 500) {
              total = val4;
              taxRate = 0;
            } else if (val4 <= 100 && price > 500) {
              taxRate = val4;
              total = qty * price;
            } else {
              total = val4;
              taxRate = 0;
            }
          } else {
            total = qty * price;
            taxRate = 0;
          }

          // Kiểm tra và sửa sai số học nếu nét bút bi quẹt đè lên số lượng (ví dụ in 4 nhưng trông như 14, in 2 trông như 12)
          if (price > 0 && total > 0 && Math.abs(qty * price - total) > 500) {
            const expectedQty = Math.round((total / price) * 1000) / 1000;
            if (expectedQty > 0) {
              qty = expectedQty;
            }
          }

          items.push({
            raw_name: name,
            quantity: qty,
            unit,
            unit_price: price,
            line_total: total,
            note: null,
            tax_rate: Math.max(0, taxRate),
            is_taxable: taxRate > 0,
          });
        } else if (it && typeof it === "object") {
          const itemObj = it as Record<string, unknown>;
          const name = (typeof itemObj.raw_name === "string" ? itemObj.raw_name : typeof itemObj.name === "string" ? itemObj.name : "").trim();
          if (!name) continue;
          const rawQtyVal = itemObj.quantity !== undefined ? itemObj.quantity : itemObj.qty;
          let qty = typeof rawQtyVal === "number" ? rawQtyVal : (!isNaN(Number(rawQtyVal)) && rawQtyVal !== "" && rawQtyVal !== null) ? Number(rawQtyVal) : 0;
          const unit = (typeof itemObj.unit === "string" ? itemObj.unit : "kg").trim() || "kg";
          const rawPriceVal = itemObj.unit_price !== undefined ? itemObj.unit_price : itemObj.price;
          const price = typeof rawPriceVal === "number" ? rawPriceVal : (!isNaN(Number(rawPriceVal)) && rawPriceVal !== "" && rawPriceVal !== null) ? Number(rawPriceVal) : 0;
          const rawTotalVal = itemObj.line_total !== undefined ? itemObj.line_total : itemObj.total;
          const total = typeof rawTotalVal === "number" ? rawTotalVal : (!isNaN(Number(rawTotalVal)) && rawTotalVal !== "" && rawTotalVal !== null) ? Number(rawTotalVal) : qty * price;

          // Kiểm tra và sửa sai số học nếu nét bút bi quẹt đè lên số lượng
          if (price > 0 && total > 0 && Math.abs(qty * price - total) > 500) {
            const expectedQty = Math.round((total / price) * 1000) / 1000;
            if (expectedQty > 0) {
              qty = expectedQty;
            }
          }

          const rawTaxVal =
            itemObj.tax_rate !== undefined
              ? itemObj.tax_rate
              : itemObj.tax_percent !== undefined
              ? itemObj.tax_percent
              : itemObj.vat !== undefined
              ? itemObj.vat
              : itemObj.tax;
          const taxRate = typeof rawTaxVal === "number" ? rawTaxVal : (!isNaN(Number(rawTaxVal)) && rawTaxVal !== "" && rawTaxVal !== null) ? Number(rawTaxVal) : 0;
          const isTaxable = itemObj.is_taxable !== undefined && itemObj.is_taxable !== null ? Boolean(itemObj.is_taxable) : taxRate > 0;

          items.push({
            raw_name: name,
            quantity: qty,
            unit,
            unit_price: price,
            line_total: total,
            note: (typeof itemObj.note === "string" ? itemObj.note : null) || null,
            tax_rate: Math.max(0, taxRate),
            is_taxable: isTaxable,
          });
        }
      }
    }

    const rawExcluded = raw.excluded_items || raw.excluded || raw.del;
    const excluded_items: string[] = Array.isArray(rawExcluded)
      ? rawExcluded.filter((e): e is string => typeof e === "string")
      : [];

    const calculatedSubtotal = items.reduce((acc, curr) => acc + (curr.line_total || 0), 0);
    const subtotal = Number(raw.subtotal) || calculatedSubtotal;
    let taxAmount = Number(raw.tax_amount) || 0;
    let taxPercent = Number(raw.tax_percent) || 0;
    const rawTotalAmount = Number(raw.total_amount) || 0;

    // Tính tổng tiền thuế từ các dòng mặt hàng có thuế
    const itemTaxSum = items.reduce((sum, it) => {
      const r = it.tax_rate || 0;
      return r > 0 ? sum + Math.round((it.line_total || 0) * (r / 100)) : sum;
    }, 0);
    if (taxAmount <= 0 && itemTaxSum > 0) {
      taxAmount = itemTaxSum;
    }

    const totalAmount = rawTotalAmount > 0 ? rawTotalAmount : subtotal + taxAmount;

    if (taxAmount <= 0 && totalAmount > subtotal) {
      taxAmount = totalAmount - subtotal;
    }

    if (taxPercent <= 0 && subtotal > 0 && taxAmount > 0) {
      taxPercent = Math.round((taxAmount / subtotal) * 100);
    }

    return {
      supplier_name: (typeof raw.supplier_name === "string" ? raw.supplier_name : typeof raw.supplier === "string" ? raw.supplier : null) || null,
      supplier_tax_code: (typeof raw.supplier_tax_code === "string" ? raw.supplier_tax_code : typeof raw.tax_code === "string" ? raw.tax_code : null) || null,
      supplier_phone: (typeof raw.supplier_phone === "string" ? raw.supplier_phone : typeof raw.phone === "string" ? raw.phone : null) || null,
      supplier_address: (typeof raw.supplier_address === "string" ? raw.supplier_address : typeof raw.address === "string" ? raw.address : null) || null,
      invoice_number: (typeof raw.invoice_number === "string" ? raw.invoice_number : null) || null,
      order_date: (typeof raw.order_date === "string" ? raw.order_date : null) || null,
      items,
      excluded_items,
      subtotal,
      tax_percent: taxPercent,
      tax_amount: taxAmount,
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

  // 2. Tìm khối { ... } hoặc cứu hộ chuỗi JSON bị đứt đoạn do hết token
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace !== -1) {
    const lastBrace = cleaned.lastIndexOf("}");
    if (lastBrace > firstBrace) {
      const candidate = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === "object") {
          return normalizeObj(parsed as Record<string, unknown>);
        }
      } catch {
        // thử tiếp bên dưới
      }
    }

    // 3. Phục hồi nếu bị ngắt đuôi mảng (kể cả khi không có dấu đóng ngoặc nhọn })
    const lastItemEnd = cleaned.lastIndexOf("]");
    if (lastItemEnd > firstBrace) {
      const truncatedSlice = cleaned.slice(firstBrace, lastItemEnd + 1);
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
            "Bạn là chuyên gia OCR và kế toán kiểm kho F&B tại Việt Nam. BẮT BUỘC: 1) Không viết lời dẫn hay giải thích. Trả về DUY NHẤT chuỗi JSON bắt đầu bằng { và kết thúc bằng }. 2) ĐỌC ĐẦY ĐỦ TẤT CẢ CÁC DÒNG HÀNG TRÊN HÓA ĐƠN VÀO items (từ STT 001 đến hết bảng, kể cả dòng có gạch mực). 3) Ghi tên món bị gạch vào excluded_items. 4) Lấy số lượng theo cột SL GIAO (thực giao), lấy đơn giá 1 ĐVT (- VAT). 5) Trích xuất thuế suất VAT % từng dòng (0 nếu không thuế, hoặc 5, 8, 10). 6) total_amount là tổng thanh toán thực tế.",
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
      max_tokens: 950,
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

  const modelsToTry = ["qwen/qwen3.8-27b"];
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await sendRequest(model);

        if (response.status === 429) {
          const errBody = await response.json().catch(() => ({}));
          const errMsg = errBody.error?.message || "";
          const isDailyLimit =
            errMsg.includes("tokens per day") ||
            errMsg.includes("TPD") ||
            errMsg.includes("RPD") ||
            errMsg.includes("requests per day");

          const matchMinSec = errMsg.match(/try again in (?:(\d+)m\s*)?([\d.]+)s/);
          let waitSeconds = 6;
          if (matchMinSec) {
            const mins = matchMinSec[1] ? parseInt(matchMinSec[1], 10) : 0;
            const secs = matchMinSec[2] ? parseFloat(matchMinSec[2]) : 0;
            waitSeconds = mins * 60 + Math.ceil(secs);
          }

          if (isDailyLimit || waitSeconds > 25) {
            const resetStr = waitSeconds >= 60 ? `${Math.ceil(waitSeconds / 60)} phút` : `${waitSeconds} giây`;
            throw new Error(
              `Groq API đạt giới hạn hạn mức trong ngày (TPD Limit 200,000 tokens/ngày). Vui lòng thử lại sau khoảng ${resetStr} hoặc cấu hình GEMINI_API_KEY để tiếp tục sử dụng miễn phí.`
            );
          }

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
    name: "Hóa đơn Nông Sản & Rau Củ Tươi (Có & Không Thuế)",
    description: "Nhà cung cấp Rau Sạch Đà Lạt Mart (Rau củ tươi không thuế, dầu Oliu chịu thuế 8%)",
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
          tax_rate: 0,
          is_taxable: false,
        },
        {
          raw_name: "Chanh vàng không hạt",
          quantity: 10,
          unit: "kg",
          unit_price: 45000,
          line_total: 450000,
          note: "Tươi mọng nước",
          tax_rate: 0,
          is_taxable: false,
        },
        {
          raw_name: "Cà chua bi Cherry đỏ",
          quantity: 8,
          unit: "kg",
          unit_price: 38000,
          line_total: 304000,
          tax_rate: 0,
          is_taxable: false,
        },
        {
          raw_name: "Dầu Oliu Extra Virgin nguyên chất",
          quantity: 4,
          unit: "chai",
          unit_price: 185000,
          line_total: 740000,
          note: "Chai 1 lít",
          tax_rate: 8,
          is_taxable: true,
        },
      ],
      subtotal: 1974000,
      tax_percent: 0,
      tax_amount: 59200, // 740,000 * 8%
      total_amount: 2033200,
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
          tax_rate: 0,
          is_taxable: false,
        },
        {
          raw_name: "Sữa tươi thanh trùng Dalat Milk không đường",
          quantity: 24,
          unit: "hộp",
          unit_price: 34000,
          line_total: 816000,
          note: "Hộp 950ml",
          tax_rate: 8,
          is_taxable: true,
        },
        {
          raw_name: "Kem béo thực vật Rich's Non-Dairy Creamer",
          quantity: 12,
          unit: "hộp",
          unit_price: 28500,
          line_total: 342000,
          note: "Hộp 454g",
          tax_rate: 8,
          is_taxable: true,
        },
        {
          raw_name: "Đường cát trắng Biên Hòa Pure",
          quantity: 20,
          unit: "kg",
          unit_price: 22000,
          line_total: 440000,
          tax_rate: 8,
          is_taxable: true,
        },
      ],
      subtotal: 2848000,
      tax_percent: 0,
      tax_amount: 127840, // (816000+342000+440000)*8% = 1598000*8% = 127840
      total_amount: 2975840,
      confidence_score: 0.97,
    },
  },
  {
    id: "thit-hai-san",
    name: "Hóa đơn Thực Phẩm Thịt Bò & Hải Sản Tươi Sống",
    description: "Đại lý Thực phẩm Sạch Phúc Thịnh (Thịt bò thăn, Ức gà phi lê, Tôm sú - KCT)",
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
          tax_rate: 0,
          is_taxable: false,
        },
        {
          raw_name: "Ức gà phi lê CP tươi",
          quantity: 20,
          unit: "kg",
          unit_price: 75000,
          line_total: 1500000,
          tax_rate: 0,
          is_taxable: false,
        },
        {
          raw_name: "Tôm sú tươi sống size 20-25 con/kg",
          quantity: 5,
          unit: "kg",
          unit_price: 320000,
          line_total: 1600000,
          tax_rate: 0,
          is_taxable: false,
        },
      ],
      subtotal: 6220000,
      tax_percent: 0,
      tax_amount: 0,
      total_amount: 6220000,
      confidence_score: 0.96,
    },
  },
  {
    id: "simba-food",
    name: "Phiếu Giao Hàng SIM BA (Thuế Hỗn Hợp + Món Gạch Bỏ)",
    description: "Công ty CP Thương mại SIM BA (Đậu nành, trứng cá, rong biển 8% VAT, trứng gà 0% VAT, kèm 2 món gạch bỏ)",
    supplierName: "Công ty Cổ phần Thương mại SIM BA",
    data: {
      supplier_name: "Công ty Cổ phần Thương mại SIM BA",
      supplier_tax_code: "0303123890",
      supplier_phone: "0354010285",
      supplier_address: "968 Ba Tháng Hai, P. Phú Thọ, TP. Hồ Chí Minh / Kho SG_K032 Bạch Đằng, P. Hồng Hà, Hà Nội",
      invoice_number: "26413820",
      order_date: "2026-09-04",
      items: [
        {
          raw_name: "Trứng gà tươi (30 quả/khay)",
          quantity: 1,
          unit: "Khay",
          unit_price: 84000,
          line_total: 84000,
          tax_rate: 0,
          is_taxable: false,
        },
        {
          raw_name: "Đậu nành luộc đông lạnh Edamame 400g",
          quantity: 4,
          unit: "Gói",
          unit_price: 34500,
          line_total: 138000,
          tax_rate: 8,
          is_taxable: true,
        },
        {
          raw_name: "Trứng cá chế biến đông lạnh Tobiko Orange 500g",
          quantity: 1,
          unit: "Hộp",
          unit_price: 440000,
          line_total: 440000,
          tax_rate: 8,
          is_taxable: true,
        },
        {
          raw_name: "Trứng cá tuyết chế biến Yamaya 500g",
          quantity: 1,
          unit: "Gói",
          unit_price: 280000,
          line_total: 280000,
          tax_rate: 8,
          is_taxable: true,
        },
        {
          raw_name: "Mù tạt 505 Nama Wasabi Kaneku",
          quantity: 2,
          unit: "Gói",
          unit_price: 300000,
          line_total: 600000,
          tax_rate: 8,
          is_taxable: true,
        },
        {
          raw_name: "Rong biển đỏ ướp muối 500g",
          quantity: 1,
          unit: "Gói",
          unit_price: 230000,
          line_total: 230000,
          tax_rate: 8,
          is_taxable: true,
        },
        {
          raw_name: "Rong biển xanh ướp muối 500g",
          quantity: 1,
          unit: "Gói",
          unit_price: 230000,
          line_total: 230000,
          tax_rate: 8,
          is_taxable: true,
        },
        {
          raw_name: "Trứng gà Ise - Vfood Vitamin E (hộp 10 quả)",
          quantity: 1,
          unit: "Hộp",
          unit_price: 48000,
          line_total: 48000,
          tax_rate: 0,
          is_taxable: false,
        },
        {
          raw_name: "Gừng chế biến Menyo Sushigari Pink 1.5Kg",
          quantity: 2,
          unit: "Gói",
          unit_price: 85000,
          line_total: 170000,
          tax_rate: 8,
          is_taxable: true,
        },
        {
          raw_name: "Cá trứng đông lạnh Frozen Capelin Shisamo",
          quantity: 2,
          unit: "Khay",
          unit_price: 70000,
          line_total: 140000,
          tax_rate: 0,
          is_taxable: false,
        },
        {
          raw_name: "Bột khoai tây KATAKURIKO",
          quantity: 1,
          unit: "Túi",
          unit_price: 35000,
          line_total: 35000,
          tax_rate: 8,
          is_taxable: true,
        },
        {
          raw_name: "Hạt bạch quả đông lạnh FROZEN GINKGO (KARATSUKI GINNAN)",
          quantity: 1,
          unit: "Túi",
          unit_price: 415000,
          line_total: 415000,
          tax_rate: 0,
          is_taxable: false,
          note: "Có nét gạch trên hóa đơn",
        },
        {
          raw_name: "Vây cá đuối 250g",
          quantity: 1,
          unit: "Gói",
          unit_price: 145000,
          line_total: 145000,
          tax_rate: 8,
          is_taxable: true,
        },
        {
          raw_name: "Vỏ tắc Nhật: Kizami Yuzu (Khô) 250g",
          quantity: 1,
          unit: "Gói",
          unit_price: 165000,
          line_total: 165000,
          tax_rate: 0,
          is_taxable: false,
          note: "Có nét gạch trên hóa đơn",
        },
        {
          raw_name: "Rong biển nướng cắt sợi Kizami Nori",
          quantity: 1,
          unit: "Túi",
          unit_price: 115000,
          line_total: 115000,
          tax_rate: 8,
          is_taxable: true,
        },
        {
          raw_name: "Nước tương Higashimaru Usukuchi Shoyu 1.8L",
          quantity: 1,
          unit: "Chai",
          unit_price: 170000,
          line_total: 170000,
          tax_rate: 8,
          is_taxable: true,
        },
        {
          raw_name: "Súp Soba Tsuyu Sauce (Somi Shokuhin) 1.8L",
          quantity: 1,
          unit: "Chai",
          unit_price: 340000,
          line_total: 340000,
          tax_rate: 8,
          is_taxable: true,
        },
        {
          raw_name: "Xốt Yakiniku No Tare Deluxe (Somi Shokuhin) 2 kg",
          quantity: 1,
          unit: "Hộp",
          unit_price: 345000,
          line_total: 345000,
          tax_rate: 8,
          is_taxable: true,
        },
        {
          raw_name: "Nước xốt Yakiniku sauce 2kg",
          quantity: 1,
          unit: "Chai",
          unit_price: 640000,
          line_total: 640000,
          tax_rate: 8,
          is_taxable: true,
        },
      ],
      excluded_items: [
        "Hạt bạch quả đông lạnh FROZEN GINKGO (KARATSUKI GINNAN)",
        "Vỏ tắc Nhật: Kizami Yuzu (Khô) 250g",
      ],
      subtotal: 4730000,
      tax_percent: 8,
      tax_amount: 310240,
      total_amount: 5040240,
      confidence_score: 0.99,
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

  // 4. Tính toán tổng tiền & thuế VAT
  const calculatedItemsTotal = allItems.reduce((acc, it) => acc + (it.line_total || 0), 0);

  // Tìm tổng tiền thanh toán ghi trên hóa đơn (có thể nằm ở trang 1 như Kamereo, hoặc trang cuối)
  const candidateTotals = pages
    .map((p) => Number(p.total_amount) || 0)
    .filter((amt) => amt > 0);

  // Ưu tiên tổng tiền lớn hơn hoặc bằng tổng các mặt hàng (thường đã bao gồm thuế VAT/phí giao hàng)
  const explicitGrandTotal =
    candidateTotals.find((amt) => amt >= calculatedItemsTotal) ||
    candidateTotals[candidateTotals.length - 1] ||
    calculatedItemsTotal;

  // Tổng hợp thuế VAT từ các trang
  const explicitTaxPercent = pages.find((p) => (p.tax_percent || 0) > 0)?.tax_percent || 0;
  let explicitTaxAmount = pages.reduce((sum, p) => sum + (p.tax_amount || 0), 0);

  // Tính thuế từ các dòng mặt hàng chịu thuế nếu có
  const itemsTaxSum = allItems.reduce((acc, it) => {
    const rate = it.tax_rate || 0;
    return rate > 0 ? acc + Math.round((it.line_total || 0) * (rate / 100)) : acc;
  }, 0);
  if (explicitTaxAmount <= 0 && itemsTaxSum > 0) {
    explicitTaxAmount = itemsTaxSum;
  }

  // Nếu chưa có tax_amount nhưng explicitGrandTotal lớn hơn tổng tiền hàng (subtotal)
  if (explicitTaxAmount <= 0 && explicitGrandTotal > calculatedItemsTotal) {
    explicitTaxAmount = explicitGrandTotal - calculatedItemsTotal;
  }

  const taxPercent =
    explicitTaxPercent > 0
      ? explicitTaxPercent
      : (calculatedItemsTotal > 0 && explicitTaxAmount > 0
          ? Math.round((explicitTaxAmount / calculatedItemsTotal) * 100)
          : 0);

  const finalTotal =
    explicitGrandTotal > 0
      ? explicitGrandTotal
      : calculatedItemsTotal + explicitTaxAmount;

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
    tax_percent: taxPercent,
    tax_amount: explicitTaxAmount,
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

