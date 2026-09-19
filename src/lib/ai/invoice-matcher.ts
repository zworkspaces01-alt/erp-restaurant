import type {
  InvoiceParsedData,
  InvoiceParsedItem,
  MatchedInvoiceItem,
} from "@/types/restaurant";

export interface IngredientMatchCandidate {
  id: string;
  code: string | null;
  name: string;
  base_unit: string;
  import_unit: string;
  conversion_factor: number;
  avg_cost_price?: number;
}

export interface SupplierMatchCandidate {
  id: string;
  code: string | null;
  name: string;
  tax_code: string | null;
  phone: string | null;
}

/**
 * Chuẩn hóa chuỗi tiếng Việt: chuyển chữ thường, bỏ dấu và ký tự đặc biệt
 */
export function normalizeVietnamese(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Loại bỏ các từ phụ / pháp nhân không quan trọng khi so khớp tên nhà cung cấp
 */
function cleanSupplierName(name: string): string {
  const norm = normalizeVietnamese(name);
  const stopWords = [
    "cong ty",
    "tnhh",
    "co phan",
    "cp",
    "dai ly",
    "cua hang",
    "chi nhanh",
    "doanh nghiep",
    "thuong mai",
    "dich vu",
    "san xuat",
    "nha phan phoi",
    "npp",
    "ho kinh doanh",
  ];

  let cleaned = norm;
  for (const sw of stopWords) {
    cleaned = cleaned.replace(new RegExp(`\\b${sw}\\b`, "g"), " ");
  }
  return cleaned.replace(/\s+/g, " ").trim();
}

/**
 * Tính toán độ tương đồng giữa 2 chuỗi theo Dice Coefficient trên bigram và word overlap
 */
export function computeSimilarity(s1: string, s2: string): number {
  const n1 = normalizeVietnamese(s1);
  const n2 = normalizeVietnamese(s2);

  if (n1 === n2) return 1.0;
  if (!n1 || !n2) return 0.0;
  if (n1.includes(n2) || n2.includes(n1)) {
    const minLen = Math.min(n1.length, n2.length);
    const maxLen = Math.max(n1.length, n2.length);
    return 0.85 + 0.15 * (minLen / maxLen);
  }

  // So sánh tập từ (Word Overlap)
  const words1 = new Set(n1.split(" ").filter((w) => w.length > 1));
  const words2 = new Set(n2.split(" ").filter((w) => w.length > 1));

  let common = 0;
  words1.forEach((w) => {
    if (words2.has(w)) common++;
  });

  const union = new Set([...words1, ...words2]).size;
  const wordScore = union > 0 ? (2.0 * common) / (words1.size + words2.size) : 0;

  return wordScore;
}

/**
 * So khớp Nhà cung cấp từ thông tin hóa đơn với danh sách nhà cung cấp trong DB
 */
export function matchSupplier(
  parsed: InvoiceParsedData,
  suppliers: SupplierMatchCandidate[]
): {
  supplier_id: string | null;
  match_confidence: "exact" | "partial" | "unmatched";
} {
  if (suppliers.length === 0) {
    return { supplier_id: null, match_confidence: "unmatched" };
  }

  // 1. So khớp theo Mã số thuế (nếu cả 2 bên đều có)
  if (parsed.supplier_tax_code) {
    const cleanTax = parsed.supplier_tax_code.replace(/[^0-9]/g, "");
    const found = suppliers.find((s) => {
      const sTax = s.tax_code ? s.tax_code.replace(/[^0-9]/g, "") : "";
      return sTax && sTax === cleanTax;
    });
    if (found) {
      return { supplier_id: found.id, match_confidence: "exact" };
    }
  }

  // 2. So khớp theo Số điện thoại
  if (parsed.supplier_phone) {
    const cleanPhone = parsed.supplier_phone.replace(/[^0-9]/g, "");
    if (cleanPhone.length >= 8) {
      const found = suppliers.find((s) => {
        const sPhone = s.phone ? s.phone.replace(/[^0-9]/g, "") : "";
        return sPhone && sPhone.includes(cleanPhone);
      });
      if (found) {
        return { supplier_id: found.id, match_confidence: "exact" };
      }
    }
  }

  // 3. So khớp theo Tên nhà cung cấp (Fuzzy name matching)
  if (!parsed.supplier_name) {
    return { supplier_id: null, match_confidence: "unmatched" };
  }

  const targetClean = cleanSupplierName(parsed.supplier_name);
  let bestScore = 0;
  let bestSupplier: SupplierMatchCandidate | null = null;

  for (const s of suppliers) {
    const currentClean = cleanSupplierName(s.name);
    const score = computeSimilarity(targetClean, currentClean);
    if (score > bestScore) {
      bestScore = score;
      bestSupplier = s;
    }
  }

  if (bestSupplier && bestScore >= 0.7) {
    return { supplier_id: bestSupplier.id, match_confidence: "exact" };
  }
  if (bestSupplier && bestScore >= 0.4) {
    return { supplier_id: bestSupplier.id, match_confidence: "partial" };
  }

  return { supplier_id: null, match_confidence: "unmatched" };
}

/**
 * Chuẩn hóa đơn vị tính tiếng Việt (ví dụ: kg, kgs, ký, kilo -> kg)
 */
function normalizeUnit(unit: string | null | undefined): string {
  if (!unit) return "";
  const norm = normalizeVietnamese(unit);
  if (["kg", "kgs", "ky", "kilo", "kilogram"].includes(norm)) return "kg";
  if (["g", "gr", "gram"].includes(norm)) return "g";
  if (["l", "lit", "liter", "litter"].includes(norm)) return "lít";
  if (["ml", "mililit"].includes(norm)) return "ml";
  if (["thung", "carton"].includes(norm)) return "thùng";
  if (["hop", "box"].includes(norm)) return "hộp";
  if (["goi", "pack", "bag"].includes(norm)) return "gói";
  if (["chai", "bottle"].includes(norm)) return "chai";
  if (["lon", "can"].includes(norm)) return "lon";
  return unit.trim();
}

/**
 * So khớp một dòng mặt hàng trên hóa đơn với nguyên liệu trong kho
 */
export function matchItemWithIngredient(
  item: InvoiceParsedItem,
  ingredients: IngredientMatchCandidate[]
): MatchedInvoiceItem {
  const lineTotal = item.line_total ?? item.quantity * item.unit_price;
  const rawUnit = item.unit || "";
  const normRawUnit = normalizeUnit(rawUnit);

  if (ingredients.length === 0) {
    return {
      raw_name: item.raw_name,
      quantity: item.quantity,
      unit: rawUnit,
      unit_price: item.unit_price,
      line_total: lineTotal,
      ingredient_id: null,
      matched_ingredient_name: null,
      conversion_factor: 1,
      match_confidence: "unmatched",
    };
  }

  let bestScore = 0;
  let bestIng: IngredientMatchCandidate | null = null;

  for (const ing of ingredients) {
    // 1. Kiểm tra khớp chính xác theo code nếu có
    if (ing.code && item.raw_name.toUpperCase().includes(ing.code.toUpperCase())) {
      bestScore = 1.0;
      bestIng = ing;
      break;
    }

    // 2. Tính tương đồng tên nguyên liệu
    const score = computeSimilarity(item.raw_name, ing.name);
    if (score > bestScore) {
      bestScore = score;
      bestIng = ing;
    }
  }

  const taxRate =
    typeof item.tax_rate === "number" && !isNaN(item.tax_rate)
      ? Math.max(0, item.tax_rate)
      : item.is_taxable
      ? 8
      : 0;
  const isTaxable = item.is_taxable !== undefined && item.is_taxable !== null ? Boolean(item.is_taxable) : taxRate > 0;

  if (!bestIng || bestScore < 0.4) {
    return {
      raw_name: item.raw_name,
      quantity: item.quantity,
      unit: rawUnit,
      unit_price: item.unit_price,
      line_total: lineTotal,
      ingredient_id: null,
      matched_ingredient_name: null,
      conversion_factor: 1,
      match_confidence: "unmatched",
      tax_rate: taxRate,
      is_taxable: isTaxable,
    };
  }

  // Xác định đơn vị và hệ số quy đổi
  let conversionFactor = 1;
  let resolvedUnit = rawUnit || bestIng.import_unit || bestIng.base_unit;

  const normImportUnit = normalizeUnit(bestIng.import_unit);
  const normBaseUnit = normalizeUnit(bestIng.base_unit);

  if (normRawUnit && normRawUnit === normImportUnit) {
    conversionFactor = Number(bestIng.conversion_factor) || 1;
    resolvedUnit = bestIng.import_unit;
  } else if (normRawUnit && normRawUnit === normBaseUnit) {
    conversionFactor = 1;
    resolvedUnit = bestIng.base_unit;
  } else {
    // Nếu không khớp đơn vị rõ ràng, mặc định dùng đơn vị nhập của nguyên liệu
    conversionFactor = Number(bestIng.conversion_factor) || 1;
    if (!resolvedUnit) resolvedUnit = bestIng.import_unit;
  }

  let confidence: "exact" | "high" | "partial" = "partial";
  if (bestScore >= 0.8) confidence = "exact";
  else if (bestScore >= 0.6) confidence = "high";

  return {
    raw_name: item.raw_name,
    quantity: item.quantity,
    unit: resolvedUnit,
    unit_price: item.unit_price,
    line_total: lineTotal,
    ingredient_id: bestIng.id,
    matched_ingredient_name: bestIng.name,
    conversion_factor: conversionFactor,
    match_confidence: confidence,
    tax_rate: taxRate,
    is_taxable: isTaxable,
    note: item.note || null,
  };
}

/**
 * Xử lý toàn bộ kết quả OCR: so khớp Nhà cung cấp và toàn bộ danh sách mặt hàng
 */
export function matchInvoiceData(
  parsed: InvoiceParsedData,
  suppliers: SupplierMatchCandidate[],
  ingredients: IngredientMatchCandidate[],
  imageUrl: string | string[]
) {
  const imageUrls = Array.isArray(imageUrl) ? imageUrl : [imageUrl].filter(Boolean);
  const primaryImageUrl = imageUrls[0] || "";

  const supplierMatch = matchSupplier(parsed, suppliers);

  const matchedItems: MatchedInvoiceItem[] = (parsed.items || []).map((it) =>
    matchItemWithIngredient(it, ingredients)
  );

  const subtotal =
    parsed.subtotal ?? matchedItems.reduce((sum, it) => sum + (it.line_total || 0), 0);

  // Tính tiền thuế từ các dòng mặt hàng chịu thuế (nếu có)
  const itemTaxSum = matchedItems.reduce((sum, it) => {
    const rate = it.tax_rate || 0;
    return rate > 0 ? sum + Math.round((it.line_total || 0) * (rate / 100)) : sum;
  }, 0);

  const taxAmount = parsed.tax_amount && parsed.tax_amount > 0 ? parsed.tax_amount : itemTaxSum;
  const totalAmount = parsed.total_amount ?? subtotal + taxAmount;

  return {
    image_url: primaryImageUrl,
    image_urls: imageUrls,
    supplier_id: supplierMatch.supplier_id,
    supplier_name_raw: parsed.supplier_name ?? null,
    supplier_match_confidence: supplierMatch.match_confidence,
    invoice_number: parsed.invoice_number ?? "",
    order_date: parsed.order_date ?? new Date().toISOString().slice(0, 10),
    items: matchedItems,
    excluded_items: parsed.excluded_items || [],
    subtotal,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    raw_extracted: parsed,
  };
}
