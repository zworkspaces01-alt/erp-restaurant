import * as XLSX from "xlsx";
import {
  ingredientSchema,
  menuItemSchema,
  recipeImportRowSchema,
  type IngredientInput,
  type MenuItemInput,
  type RecipeImportRowInput,
} from "@/types/restaurant";

export interface ParsedExcelRow<T> {
  rowIndex: number;
  data: Partial<T>;
  isValid: boolean;
  errors: Record<string, string>;
  raw: Record<string, unknown>;
}

/** Chuẩn hóa tiêu đề cột: loại bỏ dấu cách thừa, chuyển về chữ thường, bỏ dấu tiếng Việt để so sánh linh hoạt. */
function normalizeHeader(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Chuyển đổi giá trị ô bất kỳ sang string sạch hoặc null */
function cellToString(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

/** Chuyển đổi giá trị ô sang số */
function cellToNumber(val: unknown, defaultValue = 0): number {
  if (val === null || val === undefined) return defaultValue;
  if (typeof val === "number") return val;
  const cleaned = String(val).replace(/[,.\s]/g, (match, offset, str) => {
    // Nếu là dấu chấm/phẩy cuối cùng trong số thập phân
    const isLastSep = offset === str.lastIndexOf(".") || offset === str.lastIndexOf(",");
    return isLastSep ? "." : "";
  });
  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/** Chuyển đổi giá trị ô sang boolean */
function cellToBoolean(val: unknown, defaultValue = true): boolean {
  if (val === null || val === undefined || val === "") return defaultValue;
  if (typeof val === "boolean") return val;
  const s = String(val).trim().toLowerCase();
  if (["có", "co", "true", "1", "yes", "đang bán", "dang ban", "hoạt động", "hoat dong"].includes(s)) {
    return true;
  }
  if (["không", "khong", "false", "0", "no", "ngừng bán", "ngung ban"].includes(s)) {
    return false;
  }
  return defaultValue;
}

// -----------------------------------------------------------------------------
// THỰC ĐƠN (MENU ITEMS)
// -----------------------------------------------------------------------------

export function downloadMenuTemplate() {
  const wsData = [
    ["Mã món", "Tên món (*)", "Danh mục", "Nhóm món", "Giá bán (VND) (*)", "Thuế (%)", "Loại món", "Mô tả", "Đang bán"],
    ["MON-001", "Phở bò tái", "Món ăn", "Món nước", 65000, 8, "Món đơn", "Bò phi lê tươi mềm", "Có"],
    ["MON-002", "Bún chả Hà Nội", "Món ăn", "Món bún", 60000, 8, "Món đơn", "Chả nướng than hoa", "Có"],
    ["MON-003", "Cà phê sữa đá", "Đồ uống", "Cà phê", 35000, 10, "Món đơn", "Pha phin truyền thống", "Có"],
    ["CB-001", "Combo Bữa Sáng", "Đồ ăn sáng", "Combo", 89000, 8, "Combo", "1 Phở bò + 1 Cà phê sữa", "Có"],
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Đặt độ rộng cột phù hợp
  ws["!cols"] = [
    { wch: 14 }, // Mã món
    { wch: 26 }, // Tên món
    { wch: 18 }, // Danh mục
    { wch: 18 }, // Nhóm món
    { wch: 18 }, // Giá bán
    { wch: 12 }, // Thuế (%)
    { wch: 14 }, // Loại món
    { wch: 32 }, // Mô tả
    { wch: 12 }, // Đang bán
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Thực đơn");
  XLSX.writeFile(wb, "mau_nhap_thuc_don.xlsx");
}

export async function parseMenuExcelFile(file: File): Promise<ParsedExcelRow<MenuItemInput>[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];

  const ws = wb.Sheets[sheetName];
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

  return rawRows.map((row, idx) => {
    // Map linh hoạt các header có thể xuất hiện
    const normMap: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      normMap[normalizeHeader(key)] = value;
    }

    const code = cellToString(normMap["mamon"] ?? normMap["ma"] ?? normMap["code"] ?? normMap["sku"]);
    const name = cellToString(normMap["tenmon"] ?? normMap["ten"] ?? normMap["name"] ?? normMap["tenmonan"]);
    const category = cellToString(normMap["danhmuc"] ?? normMap["category"]);
    const item_group = cellToString(normMap["nhommon"] ?? normMap["nhomthucdon"] ?? normMap["nhom"] ?? normMap["itemgroup"]);
    const priceVal = normMap["giaban"] ?? normMap["gia"] ?? normMap["giabanvnd"] ?? normMap["price"] ?? normMap["dongia"];
    const selling_price = cellToNumber(priceVal, 0);

    const taxVal =
      normMap["thue"] ??
      normMap["thuesuat"] ??
      normMap["vat"] ??
      normMap["tax"] ??
      normMap["thuevat"] ??
      normMap["thuepercent"];
    const tax_percent = cellToNumber(taxVal, 0);

    const typeStr = cellToString(normMap["loaimon"] ?? normMap["loai"] ?? normMap["type"] ?? normMap["iscombo"]).toLowerCase();
    const is_combo = typeStr.includes("combo") || typeStr.includes("set") || typeStr === "1" || typeStr === "true";

    const description = cellToString(normMap["mota"] ?? normMap["ghi chu"] ?? normMap["ghichu"] ?? normMap["description"]);
    const is_active = cellToBoolean(normMap["dangban"] ?? normMap["trangthai"] ?? normMap["active"] ?? normMap["isactive"], true);

    const candidate: MenuItemInput = {
      code: code ? code : null,
      name,
      category: category ? category : null,
      item_group: item_group ? item_group : null,
      selling_price,
      tax_percent,
      is_combo,
      is_active,
      description: description ? description : null,
      image_url: null,
    };

    const parsed = menuItemSchema.safeParse(candidate);
    const errors: Record<string, string> = {};

    if (!parsed.success) {
      const flattened = parsed.error.flatten().fieldErrors;
      for (const [field, msgs] of Object.entries(flattened)) {
        if (msgs && msgs.length > 0) {
          errors[field] = msgs[0];
        }
      }
    }

    return {
      rowIndex: idx + 2, // 1-indexed, bỏ qua header
      data: candidate,
      isValid: parsed.success,
      errors,
      raw: row,
    };
  });
}

// -----------------------------------------------------------------------------
// NGUYÊN LIỆU KHO (INGREDIENTS)
// -----------------------------------------------------------------------------

export function downloadIngredientTemplate() {
  const wsData = [
    [
      "Mã nguyên liệu",
      "Tên nguyên liệu (*)",
      "Danh mục",
      "Đơn vị cơ sở (*)",
      "Đơn vị nhập (*)",
      "Hệ số quy đổi (*)",
      "Đơn giá nhập ngầm định (VND)",
      "Cảnh báo tồn tối thiểu",
      "Ghi chú",
    ],
    ["NL-001", "Thịt thăn bò", "Thịt / Hải sản", "g", "kg", 1000, 250000, 2000, "Bảo quản đông mát 2-4°C"],
    ["NL-002", "Bánh phở tươi", "Tinh bột", "g", "kg", 1000, 25000, 5000, "Dùng hết trong ngày"],
    ["NL-003", "Trứng gà tươi", "Thực phẩm khô", "quả", "vỉ", 10, 32000, 30, "Vỉ 10 quả"],
    ["NL-004", "Hành lá", "Rau củ", "g", "kg", 1000, 30000, 1000, "Rửa sạch trước khi sơ chế"],
    ["NL-005", "Sữa đặc Ông Thọ", "Đồ khô", "hộp", "thùng", 24, 620000, 5, "Thùng 24 hộp"],
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws["!cols"] = [
    { wch: 16 }, // Mã nguyên liệu
    { wch: 26 }, // Tên nguyên liệu
    { wch: 18 }, // Danh mục
    { wch: 16 }, // Đơn vị cơ sở
    { wch: 16 }, // Đơn vị nhập
    { wch: 18 }, // Hệ số quy đổi
    { wch: 26 }, // Đơn giá nhập ngầm định
    { wch: 22 }, // Cảnh báo tồn
    { wch: 32 }, // Ghi chú
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Nguyên liệu");
  XLSX.writeFile(wb, "mau_nhap_nguyen_lieu.xlsx");
}

export async function parseIngredientExcelFile(file: File): Promise<ParsedExcelRow<IngredientInput>[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];

  const ws = wb.Sheets[sheetName];
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

  return rawRows.map((row, idx) => {
    const normMap: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      normMap[normalizeHeader(key)] = value;
    }

    const code = cellToString(normMap["manguyenlieu"] ?? normMap["ma"] ?? normMap["code"] ?? normMap["sku"]);
    const name = cellToString(normMap["tennguyenlieu"] ?? normMap["ten"] ?? normMap["name"] ?? normMap["tenhang"]);
    const category = cellToString(normMap["danhmuc"] ?? normMap["nhom"] ?? normMap["category"] ?? normMap["nhomnguyenlieu"]);

    const base_unit = cellToString(normMap["donvicoso"] ?? normMap["dvt"] ?? normMap["donvi"] ?? normMap["baseunit"] ?? normMap["donvixuat"]);
    const import_unit = cellToString(normMap["donvinhap"] ?? normMap["dvtnhap"] ?? normMap["importunit"]);

    const convVal = normMap["hesoquydoi"] ?? normMap["heso"] ?? normMap["quydoi"] ?? normMap["conversionfactor"];
    const conversion_factor = cellToNumber(convVal, 1);

    const priceVal =
      normMap["dongianhapngamdinhvnd"] ??
      normMap["dongianhapngamdinh"] ??
      normMap["dongianhap"] ??
      normMap["dongia"] ??
      normMap["gianhap"] ??
      normMap["gia"] ??
      normMap["defaultprice"] ??
      normMap["price"];
    const default_price = cellToNumber(priceVal, 0);

    const minStockVal = normMap["canhbaotontoithieu"] ?? normMap["dinhmuc"] ?? normMap["tontoithieu"] ?? normMap["minalertstock"];
    const min_alert_stock = cellToNumber(minStockVal, 0);

    const note = cellToString(normMap["ghichu"] ?? normMap["mota"] ?? normMap["note"]);

    const candidate: IngredientInput = {
      code: code ? code : null,
      name,
      category: category ? category : null,
      base_unit: base_unit || "phần",
      import_unit: import_unit || base_unit || "phần",
      conversion_factor,
      min_alert_stock,
      default_price,
      default_supplier_id: null,
      is_active: true,
      note: note ? note : null,
    };

    const parsed = ingredientSchema.safeParse(candidate);
    const errors: Record<string, string> = {};

    if (!parsed.success) {
      const flattened = parsed.error.flatten().fieldErrors;
      for (const [field, msgs] of Object.entries(flattened)) {
        if (msgs && msgs.length > 0) {
          errors[field] = msgs[0];
        }
      }
    }

    return {
      rowIndex: idx + 2,
      data: candidate,
      isValid: parsed.success,
      errors,
      raw: row,
    };
  });
}

// -----------------------------------------------------------------------------
// ĐỊNH LƯỢNG MÓN ĂN (RECIPES / BOM)
// -----------------------------------------------------------------------------

export function downloadRecipeTemplate() {
  const wsData = [
    [
      "Mã món (*)",
      "Tên món (tham khảo)",
      "Mã nguyên liệu (*)",
      "Tên nguyên liệu (tham khảo)",
      "Định lượng (*)",
      "Đơn vị kho",
      "Hao hụt (%)",
      "Ghi chú",
    ],
    ["MON-DU-01", "Trà Ô Long Macchiato", "NL-NUOC-03", "Trà ô long thượng hạng", 10, "g", 5, "10g trà ô long ủ cốt"],
    ["MON-DU-01", "Trà Ô Long Macchiato", "NL-NUOC-02", "Sữa tươi thanh trùng Barista Milk", 60, "ml", 0, "Sữa tươi"],
    ["MON-DU-01", "Trà Ô Long Macchiato", "NL-KEM-02", "Kem whipping Anchor 35.1% Fat", 30, "ml", 3, "Lớp kem macchiato"],
    ["MON-DU-01", "Trà Ô Long Macchiato", "NL-KEM-01", "Kem béo thực vật Rich's Non-Dairy", 20, "ml", 0, "Tạo độ sánh béo"],
    ["MON-MA-01", "Salad Xà Lách Xốt Chanh", "NL-RAU-01", "Xà lách xoăn Lolo xanh", 120, "g", 8, "Rửa sạch cắt khúc"],
    ["MON-MA-01", "Salad Xà Lách Xốt Chanh", "NL-RAU-02", "Cà chua bi hữu cơ", 60, "g", 5, "Cà chua bổ đôi"],
    ["MON-MA-01", "Salad Xà Lách Xốt Chanh", "NL-RAU-03", "Chanh tươi không hạt", 20, "g", 20, "Vắt lấy nước cốt làm xốt"],
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws["!cols"] = [
    { wch: 14 }, // Mã món
    { wch: 26 }, // Tên món
    { wch: 16 }, // Mã nguyên liệu
    { wch: 30 }, // Tên nguyên liệu
    { wch: 14 }, // Định lượng
    { wch: 12 }, // Đơn vị
    { wch: 14 }, // Hao hụt %
    { wch: 30 }, // Ghi chú
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Định lượng BOM");
  XLSX.writeFile(wb, "mau_nhap_dinh_luong_bom.xlsx");
}

/** Tải file mẫu Bảng tính Costing món ăn chuẩn F&B (theo mẫu ảnh SET CÁ NGỪ 3 LOẠI) */
export function downloadCostingTemplate() {
  exportDishCostingExcel(
    "SET CÁ NGỪ 3 LOẠI",
    [
      {
        ingredient_name: "Akami",
        portion_quantity: 45,
        portion_unit: "Gram",
        package_quantity: 1000,
        package_unit: "Gram",
        package_price: 2300000,
        line_total: 103500,
      },
      {
        ingredient_name: "Chutoro",
        portion_quantity: 45,
        portion_unit: "Gram",
        package_quantity: 1000,
        package_unit: "Gram",
        package_price: 2300000,
        line_total: 103500,
      },
      {
        ingredient_name: "Otoro",
        portion_quantity: 45,
        portion_unit: "Gram",
        package_quantity: 1000,
        package_unit: "Gram",
        package_price: 2300000,
        line_total: 103500,
      },
      {
        ingredient_name: "Wasabi",
        portion_quantity: 3,
        portion_unit: "Gram",
        package_quantity: 1000,
        package_unit: "Gram",
        package_price: 500000,
        line_total: 1500,
      },
      {
        ingredient_name: "Đá",
        portion_quantity: 1,
        portion_unit: "Pack",
        package_quantity: 1000,
        package_unit: "Gram",
        package_price: 1000,
        line_total: 1,
      },
      {
        ingredient_name: "Lá tía tô",
        portion_quantity: 3,
        portion_unit: "Lá",
        package_quantity: 100,
        package_unit: "Lá",
        package_price: 90000,
        line_total: 2700,
      },
      {
        ingredient_name: "Củ cải bào",
        portion_quantity: 200,
        portion_unit: "Gram",
        package_quantity: 1000,
        package_unit: "Gram",
        package_price: 20000,
        line_total: 4000,
      },
    ],
    {
      idealCost: 318701,
      sellingPrice: 599000,
      foodCostPct: 53.21,
    }
  );
}

export async function parseRecipeExcelFile(file: File): Promise<ParsedExcelRow<RecipeImportRowInput>[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];

  const ws = wb.Sheets[sheetName];
  const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

  // 1. Kiểm tra trường hợp file mẫu đơn món dạng Costing Sheet (như ảnh SET CÁ NGỪ 3 LOẠI)
  // Dòng đầu tiên là tiêu đề tên món, các dòng tiếp theo là: Tên NL | Định lượng | ĐVT dùng | Quy cách | ĐVT mua | Đơn giá mua | Thành tiền
  if (sheetRows.length >= 2) {
    const firstRow = sheetRows[0] || [];
    const possibleDishTitle = cellToString(firstRow[0]);
    const isSingleDishHeader =
      possibleDishTitle &&
      !normalizeHeader(possibleDishTitle).includes("mamon") &&
      !normalizeHeader(possibleDishTitle).includes("tenmon") &&
      !normalizeHeader(possibleDishTitle).includes("manguyenlieu");

    if (isSingleDishHeader) {
      const dishTitle = possibleDishTitle;
      const parsedRows: ParsedExcelRow<RecipeImportRowInput>[] = [];

      for (let i = 1; i < sheetRows.length; i++) {
        const row = sheetRows[i] || [];
        const col0 = cellToString(row[0]);
        const norm0 = normalizeHeader(col0);

        // Bỏ qua dòng tiêu đề phụ hoặc dòng tổng kết Cost / Sale / F%
        if (
          !col0 ||
          norm0.includes("cost") ||
          norm0.includes("sale") ||
          norm0 === "f" ||
          norm0.includes("tong") ||
          norm0.includes("tennguyenlieu")
        ) {
          continue;
        }

        const ingredient_name = col0;
        const quantity = cellToNumber(row[1], 0);
        const unit = cellToString(row[2]) || null;
        const note = cellToString(row[7] ?? row[6] ?? "");

        const candidate: RecipeImportRowInput = {
          menu_item_code: null,
          menu_item_name: dishTitle,
          ingredient_code: null,
          ingredient_name,
          quantity,
          unit,
          waste_percent: 0,
          note: note ? note : null,
        };

        const parsed = recipeImportRowSchema.safeParse(candidate);
        const errors: Record<string, string> = {};

        if (!parsed.success) {
          const flattened = parsed.error.flatten().fieldErrors;
          for (const [field, msgs] of Object.entries(flattened)) {
            if (msgs && msgs.length > 0) {
              errors[field] = msgs[0];
            }
          }
        }

        parsedRows.push({
          rowIndex: i + 1,
          data: candidate,
          isValid: parsed.success && quantity > 0,
          errors,
          raw: { row },
        });
      }

      if (parsedRows.length > 0) {
        return parsedRows;
      }
    }
  }

  // 2. Chế độ bảng chuẩn nhiều món (có Header cột)
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

  return rawRows.map((row, idx) => {
    const normMap: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      normMap[normalizeHeader(key)] = value;
    }

    const menu_item_code = cellToString(normMap["mamon"] ?? normMap["mamona"] ?? normMap["menuitemcode"] ?? normMap["itemcode"]);
    const menu_item_name = cellToString(normMap["tenmon"] ?? normMap["tenmonan"] ?? normMap["menuitemname"] ?? normMap["itemname"]);

    const ingredient_code = cellToString(normMap["manguyenlieu"] ?? normMap["manl"] ?? normMap["ingredientcode"] ?? normMap["sku"]);
    const ingredient_name = cellToString(normMap["tennguyenlieu"] ?? normMap["tennl"] ?? normMap["ingredientname"]);

    const qtyVal = normMap["dinhluong"] ?? normMap["soluong"] ?? normMap["quantity"] ?? normMap["luong"];
    const quantity = cellToNumber(qtyVal, 0);

    const unit = cellToString(normMap["donvikho"] ?? normMap["donvicoso"] ?? normMap["donvi"] ?? normMap["dvt"] ?? normMap["unit"]);

    const wasteVal = normMap["haohut"] ?? normMap["haohutpercent"] ?? normMap["tilehaohut"] ?? normMap["wastepercent"] ?? normMap["waste"];
    const waste_percent = cellToNumber(wasteVal, 0);

    const note = cellToString(normMap["ghichu"] ?? normMap["mota"] ?? normMap["note"]);

    const candidate: RecipeImportRowInput = {
      menu_item_code: menu_item_code || null,
      menu_item_name: menu_item_name || null,
      ingredient_code: ingredient_code || null,
      ingredient_name: ingredient_name || null,
      quantity,
      unit: unit || null,
      waste_percent,
      note: note || null,
    };

    const parsed = recipeImportRowSchema.safeParse(candidate);
    const errors: Record<string, string> = {};

    if (!parsed.success) {
      const flattened = parsed.error.flatten().fieldErrors;
      for (const [field, msgs] of Object.entries(flattened)) {
        if (msgs && msgs.length > 0) {
          errors[field] = msgs[0];
        }
      }
    }

    if (!menu_item_code && !menu_item_name) {
      errors.menu_item_code = "Cần có Mã món hoặc Tên món";
    }

    if (!ingredient_code && !ingredient_name) {
      errors.ingredient_code = "Cần có Mã NL hoặc Tên nguyên liệu";
    }

    const isValid = parsed.success && Object.keys(errors).length === 0;

    return {
      rowIndex: idx + 2,
      data: candidate,
      isValid,
      errors,
      raw: row,
    };
  });
}

/** Xuất bảng tính Cost món ăn (Recipe Costing Sheet) ra file Excel theo chuẩn F&B */
export function exportDishCostingExcel(
  dishName: string,
  lines: Array<{
    ingredient_name: string;
    portion_quantity: number;
    portion_unit: string;
    package_quantity: number;
    package_unit: string;
    package_price: number;
    line_total: number;
  }>,
  totals: {
    idealCost: number;
    sellingPrice: number;
    foodCostPct: number | null;
  }
) {
  const wsData: (string | number)[][] = [
    [dishName, "", "", "", "", "", ""],
    ["Tên nguyên liệu", "Định lượng", "ĐVT dùng", "Quy cách mua", "ĐVT mua", "Đơn giá mua (VND)", "Thành tiền (VND)"],
  ];

  for (const l of lines) {
    wsData.push([
      l.ingredient_name,
      l.portion_quantity,
      l.portion_unit,
      l.package_quantity,
      l.package_unit,
      l.package_price,
      l.line_total,
    ]);
  }

  wsData.push(["", "", "", "", "", "Cost", totals.idealCost]);
  wsData.push(["", "", "", "", "", "Sale", totals.sellingPrice]);
  const pctStr = totals.foodCostPct !== null ? `${totals.foodCostPct.toFixed(2).replace(".", ",")}%` : "—";
  wsData.push(["", "", "", "", "", "F%", pctStr]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, // Title row
  ];

  ws["!cols"] = [
    { wch: 28 }, // Tên nguyên liệu
    { wch: 14 }, // Định lượng
    { wch: 12 }, // ĐVT dùng
    { wch: 14 }, // Quy cách mua
    { wch: 12 }, // ĐVT mua
    { wch: 20 }, // Đơn giá mua
    { wch: 20 }, // Thành tiền
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Costing");
  const safeName = dishName.replace(/[^a-zA-Z0-9_\u00C0-\u1EF9\s]/g, "").trim().replace(/\s+/g, "_");
  XLSX.writeFile(wb, `Costing_${safeName || "Mon_an"}.xlsx`);
}

/** Xuất báo cáo tiêu hao nguyên liệu và lỗ lãi theo ngày ra file Excel */
export function exportDailyReportToExcel(
  date: string,
  summary: {
    report_date: string;
    revenue: number;
    order_count: number;
    avg_order_value: number;
    cogs_sales: number;
    cogs_waste: number;
    cogs_total: number;
    food_cost_pct: number;
    gross_profit: number;
    gross_margin_pct: number;
    labor_cost: number;
    opex_total: number;
    net_profit: number;
    net_margin_pct: number;
  },
  ingredients: Array<{
    ingredient_code: string | null;
    ingredient_name: string;
    category: string;
    base_unit: string;
    sale_qty: number;
    waste_qty: number;
    total_qty: number;
    avg_unit_cost: number;
    total_cost: number;
    pct_of_total_cogs: number;
    pct_of_revenue: number;
  }>,
  trend: Array<{
    report_date: string;
    order_count: number;
    revenue: number;
    cogs_total: number;
    food_cost_pct: number;
    gross_profit: number;
    opex_total: number;
    net_profit: number;
  }>
) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Tổng quan ngày
  const summaryData = [
    ["BÁO CÁO KẾT QUẢ KINH DOANH & LỖ LÃI THEO NGÀY"],
    [`Ngày báo cáo: ${date}`],
    [],
    ["Chỉ số", "Giá trị", "Đơn vị"],
    ["Số lượng đơn hàng", summary.order_count, "đơn"],
    ["Giá trị trung bình/đơn", summary.avg_order_value, "VNĐ"],
    ["1. Tổng doanh thu bán hàng", summary.revenue, "VNĐ"],
    ["2. Chi phí nguyên liệu bán ra (COGS)", summary.cogs_sales, "VNĐ"],
    ["3. Hao hụt / hủy nguyên liệu", summary.cogs_waste, "VNĐ"],
    ["4. TỔNG CHI PHÍ NGUYÊN LIỆU (2 + 3)", summary.cogs_total, "VNĐ"],
    ["   Tỷ lệ Food Cost / Doanh thu", Number(summary.food_cost_pct.toFixed(2)), "%"],
    ["5. LỢI NHUẬN GỘP (1 - 4)", summary.gross_profit, "VNĐ"],
    ["   Tỷ suất lợi nhuận gộp", Number(summary.gross_margin_pct.toFixed(2)), "%"],
    ["6. Chi phí nhân sự ngày", summary.labor_cost, "VNĐ"],
    ["7. Chi phí vận hành ngày (OPEX)", summary.opex_total, "VNĐ"],
    ["8. LỢI NHUẬN RÒNG TRONG NGÀY (5 - 6 - 7)", summary.net_profit, "VNĐ"],
    ["   Tỷ suất lợi nhuận ròng", Number(summary.net_margin_pct.toFixed(2)), "%"],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Tong_Quan_Ngay");

  // Sheet 2: Chi tiết tiêu hao nguyên liệu
  const ingHeaders = [
    "Mã NL",
    "Tên nguyên liệu",
    "Danh mục",
    "ĐVT",
    "Lượng bán",
    "Lượng hao hụt",
    "Tổng tiêu hao",
    "Đơn giá vốn (VNĐ)",
    "Thành tiền (VNĐ)",
    "Tỷ trọng / Chi phí NL (%)",
    "Tỷ trọng / Doanh thu (%)",
  ];
  const ingRows = ingredients.map((it) => [
    it.ingredient_code || "",
    it.ingredient_name,
    it.category,
    it.base_unit,
    it.sale_qty,
    it.waste_qty,
    it.total_qty,
    it.avg_unit_cost,
    it.total_cost,
    Number(it.pct_of_total_cogs.toFixed(2)),
    Number(it.pct_of_revenue.toFixed(2)),
  ]);
  const wsIng = XLSX.utils.aoa_to_sheet([ingHeaders, ...ingRows]);
  XLSX.utils.book_append_sheet(wb, wsIng, "Tieu_Hao_Nguyen_Lieu");

  // Sheet 3: Xu hướng chuỗi ngày
  const trendHeaders = [
    "Ngày",
    "Số đơn",
    "Doanh thu (VNĐ)",
    "Chi phí nguyên liệu (VNĐ)",
    "% Food Cost / Doanh thu",
    "Lợi nhuận gộp (VNĐ)",
    "Chi phí vận hành (VNĐ)",
    "Lợi nhuận ròng (VNĐ)",
  ];
  const trendRows = trend.map((tr) => [
    tr.report_date,
    tr.order_count,
    tr.revenue,
    tr.cogs_total,
    Number(tr.food_cost_pct.toFixed(2)),
    tr.gross_profit,
    tr.opex_total,
    tr.net_profit,
  ]);
  const wsTrend = XLSX.utils.aoa_to_sheet([trendHeaders, ...trendRows]);
  XLSX.utils.book_append_sheet(wb, wsTrend, "Chuoi_Ngay_Trend");

  XLSX.writeFile(wb, `Bao_Cao_Tieu_Hao_Nguyen_Lieu_${date}.xlsx`);
}

