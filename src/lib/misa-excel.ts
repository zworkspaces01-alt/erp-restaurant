import * as XLSX from "xlsx";
import type { PaymentMethod } from "@/types/restaurant";
import type { PosMenuItem } from "@/lib/queries/orders.queries";

export interface MisaRawRow {
  invoice_code: string;
  order_date: string;
  table_number: string;
  item_code: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  discount: number;
  payment_method: string;
  note: string;
}

export interface MisaOrderItem {
  menu_item_id?: string;
  raw_code: string;
  raw_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  is_matched: boolean;
  matched_name?: string;
  matched_by?: "code" | "name";
  missing_recipe?: boolean;
  unit?: string;
  category?: string;
  item_group?: string;
  tax_percent?: number;
}

export interface MisaUnmatchedItem {
  code: string;
  name: string;
  occurrences: number;
  unitPrice: number;
  unit?: string;
  category?: string;
  itemGroup?: string;
  taxPercent?: number;
}

export interface MisaParsedOrder {
  invoice_code: string;
  order_date: string; // ISO string
  display_date: string;
  table_number: string;
  payment_method: PaymentMethod;
  discount: number;
  subtotal: number;
  total_amount: number;
  tax_amount: number;
  total_with_tax: number;
  note: string;
  items: MisaOrderItem[];
  is_duplicate: boolean;
  is_valid: boolean;
  has_new_items?: boolean;
  errors: string[];
  warnings: string[];
}

export interface MisaParseOptions {
  autoAddMenuItems?: boolean;
}

export interface MisaParseResult {
  orders: MisaParsedOrder[];
  totalInvoices: number;
  validInvoices: number;
  duplicateInvoices: number;
  invalidInvoices: number;
  unmatchedItems: MisaUnmatchedItem[];
  totalRevenue: number;
  totalTax: number;
  totalGrossRevenue: number;
}

/** Chuẩn hóa tiêu đề cột để so sánh linh hoạt */
function normalizeHeader(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Chuẩn hóa chuỗi so sánh tên món */
function normalizeName(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .normalize("NFC")
    .replace(/\s+/g, " ");
}

/** Chuyển đổi giá trị ô sang string */
function cellToString(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

/** Chuyển đổi giá trị ô sang số an toàn */
function cellToNumber(val: unknown, defaultValue = 0): number {
  if (val === null || val === undefined) return defaultValue;
  if (typeof val === "number") return val;
  const cleaned = String(val).replace(/[,.\s]/g, (match, offset, str) => {
    const isLastSep = offset === str.lastIndexOf(".") || offset === str.lastIndexOf(",");
    return isLastSep ? "." : "";
  });
  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/** Nhận diện phương thức thanh toán từ chuỗi tiếng Việt MISA */
export function normalizePaymentMethod(str: string): PaymentMethod {
  const s = str.trim().toLowerCase();
  if (
    s.includes("chuyển khoản") ||
    s.includes("chuyen khoan") ||
    s.includes("ngân hàng") ||
    s.includes("ngan hang") ||
    s.includes("qr") ||
    s.includes("momo") ||
    s.includes("vnpay") ||
    s.includes("zalopay") ||
    s.includes("thẻ") ||
    s.includes("the") ||
    s.includes("card") ||
    s.includes("pos") ||
    s.includes("visa") ||
    s.includes("master")
  ) {
    return "bank_transfer";
  }
  return "cash";
}

/** Phân tích ngày giờ từ ô Excel (hỗ trợ cả serial number của Excel và chuỗi DD/MM/YYYY HH:mm:ss) */
export function parseExcelDateTime(val: unknown, timeStr?: string): { iso: string; display: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");

  if (typeof val === "number") {
    // Excel serial date number
    try {
      const dateObj = XLSX.SSF.parse_date_code(val);
      if (dateObj) {
        const y = dateObj.y;
        const m = dateObj.m;
        const d = dateObj.d;
        let H = dateObj.H ?? 12;
        let M = dateObj.M ?? 0;
        let S = dateObj.S ?? 0;

        // Nếu có chuỗi thời gian bổ sung (VD: "18:10 - 20:07"), lấy giờ ra kết thúc
        if (timeStr && timeStr.includes(":")) {
          const parts = timeStr.split("-").map((s) => s.trim());
          const target = parts[parts.length - 1]; // Giờ thanh toán/ra
          const mTime = /(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/.exec(target);
          if (mTime) {
            H = Number(mTime[1]);
            M = Number(mTime[2]);
            if (mTime[3]) S = Number(mTime[3]);
          }
        }

        const iso = `${y}-${pad(m)}-${pad(d)}T${pad(H)}:${pad(M)}:${pad(S)}+07:00`;
        const display = `${pad(d)}/${pad(m)}/${y} ${pad(H)}:${pad(M)}`;
        return { iso, display };
      }
    } catch {
      // fallback
    }
  }

  const str = cellToString(val);
  if (!str) {
    return {
      iso: now.toISOString(),
      display: `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    };
  }

  // Khớp định dạng: DD/MM/YYYY HH:mm:ss hoặc DD/MM/YYYY HH:mm hoặc DD/MM/YYYY
  const dmyMatch = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/.exec(str);
  if (dmyMatch) {
    const [, d, m, y, H, M, S] = dmyMatch;
    const hours = H ? Number(H) : 12;
    const mins = M ? Number(M) : 0;
    const secs = S ? Number(S) : 0;
    const iso = `${y}-${pad(Number(m))}-${pad(Number(d))}T${pad(hours)}:${pad(mins)}:${pad(secs)}+07:00`;
    const display = `${pad(Number(d))}/${pad(Number(m))}/${y} ${pad(hours)}:${pad(mins)}`;
    return { iso, display };
  }

  // Khớp định dạng: YYYY-MM-DD HH:mm:ss hoặc ISO
  const ymdMatch = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+[T]?(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/.exec(str);
  if (ymdMatch) {
    const [, y, m, d, H, M, S] = ymdMatch;
    const hours = H ? Number(H) : 12;
    const mins = M ? Number(M) : 0;
    const secs = S ? Number(S) : 0;
    const iso = `${y}-${pad(Number(m))}-${pad(Number(d))}T${pad(hours)}:${pad(mins)}:${pad(secs)}+07:00`;
    const display = `${pad(Number(d))}/${pad(Number(m))}/${y} ${pad(hours)}:${pad(mins)}`;
    return { iso, display };
  }

  // Thử parse bằng Date chuẩn
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      iso: parsed.toISOString(),
      display: `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}/${parsed.getFullYear()} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`,
    };
  }

  return {
    iso: now.toISOString(),
    display: `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

/** Nhận diện các cột tiêu đề từ file MISA CukCuk */
function identifyMisaHeaders(headers: string[]) {
  let colInvoice = -1;
  let colDate = -1;
  let colTable = -1;
  let colCode = -1;
  let colName = -1;
  let colQty = -1;
  let colPrice = -1;
  let colTotal = -1;
  let colDiscount = -1;
  let colVat = -1;
  let colGrossTotal = -1;
  let colMethod = -1;
  let colNote = -1;
  let colUnit = -1;
  let colCategory = -1;
  let colItemGroup = -1;
  let colVatRate = -1;

  headers.forEach((h, idx) => {
    const norm = normalizeHeader(h);
    // Số hóa đơn
    if (
      norm.includes("sohoadon") ||
      norm.includes("sohd") ||
      norm.includes("mahoadon") ||
      norm.includes("sochungtu") ||
      norm.includes("madon") ||
      norm === "shd" ||
      norm === "sct" ||
      norm === "invoiceno" ||
      norm === "billno"
    ) {
      if (colInvoice === -1) colInvoice = idx;
    }
    // Ngày giờ bán
    else if (
      norm.includes("ngayban") ||
      norm.includes("ngayhd") ||
      norm.includes("thoigian") ||
      norm.includes("ngaychungtu") ||
      norm.includes("ngaytao") ||
      norm === "ngay" ||
      norm === "date" ||
      norm === "time"
    ) {
      if (colDate === -1) colDate = idx;
    }
    // Mã món
    else if (
      norm.includes("mamon") ||
      norm.includes("mahang") ||
      norm.includes("mahh") ||
      norm.includes("masp") ||
      norm === "sku" ||
      norm === "itemcode" ||
      norm === "code"
    ) {
      if (colCode === -1) colCode = idx;
    }
    // Tên món
    else if (
      norm.includes("tenmon") ||
      norm.includes("tenhang") ||
      norm.includes("tenhh") ||
      norm.includes("tensp") ||
      norm.includes("mathang") ||
      norm === "itemname" ||
      norm === "name"
    ) {
      if (colName === -1) colName = idx;
    }
    // Số lượng (phải kiểm tra trước 'ban' để tránh nhận nhầm 'slban')
    else if (
      norm.includes("soluong") ||
      norm.includes("slban") ||
      norm === "sl" ||
      norm === "qty" ||
      norm === "quantity"
    ) {
      if (colQty === -1) colQty = idx;
    }
    // Đơn giá
    else if (
      norm.includes("dongia") ||
      norm.includes("giaban") ||
      norm === "gia" ||
      norm === "price"
    ) {
      if (colPrice === -1) colPrice = idx;
    }
    // Thành tiền / Doanh thu
    else if (
      norm.includes("thanhtien") ||
      norm.includes("tienhang") ||
      norm.includes("tongtien") ||
      norm.includes("doanhthu") ||
      norm === "amount" ||
      norm === "total"
    ) {
      if (colTotal === -1) colTotal = idx;
    }
    // Giảm giá / Chiết khấu
    else if (
      norm.includes("giamgia") ||
      norm.includes("chietkhau") ||
      norm.includes("khuyenmai") ||
      norm.includes("tienck") ||
      norm.includes("tiengiam") ||
      norm === "ck" ||
      norm === "discount"
    ) {
      if (colDiscount === -1) colDiscount = idx;
    }
    // Bàn / Phòng (ưu tiên khớp chính xác để tránh nhầm với slban, giaban)
    else if (
      norm === "ban" ||
      norm === "soban" ||
      norm === "phong" ||
      norm === "phongban" ||
      norm.includes("soban") ||
      norm.includes("khuvuc") ||
      norm === "table"
    ) {
      if (colTable === -1) colTable = idx;
    }
    // Phương thức thanh toán
    else if (
      norm.includes("hinhthucthanhtoan") ||
      norm.includes("phuongthucthanhtoan") ||
      norm.includes("pttt") ||
      norm.includes("thanhtoan") ||
      norm === "paymentmethod"
    ) {
      if (colMethod === -1) colMethod = idx;
    }
    // Thuế suất GTGT (%)
    else if (
      norm.includes("thuesuat") ||
      norm.includes("vatrate") ||
      norm === "vat" ||
      norm === "thue"
    ) {
      if (colVatRate === -1) colVatRate = idx;
    }
    // Tiền thuế GTGT / VAT (số tiền)
    else if (
      norm.includes("tienthue") ||
      norm.includes("thuegtgt") ||
      norm.includes("vat")
    ) {
      if (colVat === -1) colVat = idx;
    }
    // Tổng thanh toán (thực thu)
    else if (
      norm === "tong" ||
      norm === "tongcong" ||
      norm.includes("tongthanhtoan") ||
      norm.includes("thucthu")
    ) {
      if (colGrossTotal === -1) colGrossTotal = idx;
    }
    // Đơn vị tính
    else if (
      norm === "dvt" ||
      norm.includes("donvitinh") ||
      norm.includes("donvi") ||
      norm === "unit"
    ) {
      if (colUnit === -1) colUnit = idx;
    }
    // Nhóm thực đơn
    else if (
      norm.includes("nhomthucdon") ||
      norm.includes("nhommon") ||
      norm.includes("nhomhang") ||
      norm.includes("category") ||
      norm === "nhom"
    ) {
      if (colCategory === -1) colCategory = idx;
    }
    // Loại mặt hàng
    else if (
      norm.includes("loaimathang") ||
      norm.includes("loaihang") ||
      norm.includes("loaimon") ||
      norm.includes("loaihh") ||
      norm.includes("itemtype")
    ) {
      if (colItemGroup === -1) colItemGroup = idx;
    }
    // Ghi chú
    else if (norm.includes("ghichu") || norm.includes("diengiai") || norm === "note") {
      if (colNote === -1) colNote = idx;
    }
  });

  return {
    colInvoice,
    colDate,
    colTable,
    colCode,
    colName,
    colQty,
    colPrice,
    colTotal,
    colDiscount,
    colVat,
    colGrossTotal,
    colMethod,
    colNote,
    colUnit,
    colCategory,
    colItemGroup,
    colVatRate,
  };
}

/** Phân tích file Excel bán hàng xuất từ MISA CukCuk */
export function parseMisaSalesExcel(
  buffer: ArrayBuffer,
  menuItems: PosMenuItem[],
  existingMisaOrderCodes: string[] = [],
  options: MisaParseOptions = { autoAddMenuItems: true }
): MisaParseResult {
  const autoAddMenuItems = options.autoAddMenuItems !== false;
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("File Excel không có trang tính nào.");
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });
  if (rows.length === 0) {
    throw new Error("File Excel không có dữ liệu.");
  }

  // 1. Tìm dòng tiêu đề (Header row)
  let headerRowIndex = -1;
  let headers: string[] = [];

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i] as unknown[];
    if (!row || row.length === 0) continue;
    const strRow = row.map(cellToString);
    const joined = strRow.map(normalizeHeader).join(" ");
    // Tiêu chí nhận diện dòng tiêu đề: chứa ít nhất tên món / số lượng / thành tiền
    if (
      (joined.includes("tenmon") || joined.includes("tenhang") || joined.includes("mathang")) &&
      (joined.includes("soluong") || joined.includes("sl"))
    ) {
      headerRowIndex = i;
      headers = strRow;
      break;
    }
  }

  if (headerRowIndex === -1) {
    // Thử lấy dòng 0 làm tiêu đề
    headerRowIndex = 0;
    headers = (rows[0] as unknown[]).map(cellToString);
  }

  const cols = identifyMisaHeaders(headers);

  // Chuẩn bị map tra cứu menu items
  const menuByCode = new Map<string, PosMenuItem>();
  const menuByName = new Map<string, PosMenuItem>();

  for (const m of menuItems) {
    if (m.code) {
      menuByCode.set(m.code.trim().toLowerCase(), m);
    }
    menuByName.set(normalizeName(m.name), m);
  }

  const existingCodesSet = new Set(
    existingMisaOrderCodes.map((c) => c.trim().toLowerCase())
  );

  // 2. Đọc các dòng dữ liệu và nhóm theo Số hóa đơn
  const groupsMap = new Map<string, {
    invoice_code: string;
    order_date: string;
    display_date: string;
    table_number: string;
    payment_method_str: string;
    discount: number;
    invoice_total: number;
    tax_amount: number;
    gross_total: number;
    note: string;
    items: MisaOrderItem[];
  }>();

  let autoInvoiceCounter = 1;
  let currentInvoiceCode = "";
  const unmatchedTracker = new Map<string, MisaUnmatchedItem>();

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row || row.length === 0) continue;

    const invCodeRaw = cols.colInvoice !== -1 ? cellToString(row[cols.colInvoice]) : "";
    const itemCode = cols.colCode !== -1 ? cellToString(row[cols.colCode]) : "";
    const itemName = cols.colName !== -1 ? cellToString(row[cols.colName]) : "";
    const qty = cols.colQty !== -1 ? cellToNumber(row[cols.colQty], 0) : 0;
    const unitPrice = cols.colPrice !== -1 ? cellToNumber(row[cols.colPrice], 0) : 0;
    const lineTotal = cols.colTotal !== -1 ? cellToNumber(row[cols.colTotal], qty * unitPrice) : qty * unitPrice;
    const lineDiscount = cols.colDiscount !== -1 ? cellToNumber(row[cols.colDiscount], 0) : 0;

    const dateVal = cols.colDate !== -1 ? row[cols.colDate] : null;
    const timeVal = cellToString(row[1]); // Giờ vào - ra (VD: "18:10 - 20:07")
    const { iso: orderDateIso, display: displayDate } = parseExcelDateTime(dateVal, timeVal);
    const tableNumber = cols.colTable !== -1 ? cellToString(row[cols.colTable]) : "";
    const methodStr = cols.colMethod !== -1 ? cellToString(row[cols.colMethod]) : "";
    const note = cols.colNote !== -1 ? cellToString(row[cols.colNote]) : "";

    const unitVal = cols.colUnit !== -1 ? cellToString(row[cols.colUnit]) : "";
    const categoryVal = cols.colCategory !== -1 ? cellToString(row[cols.colCategory]) : "";
    const itemGroupVal = cols.colItemGroup !== -1 ? cellToString(row[cols.colItemGroup]) : "";
    const vatRateStr = cols.colVatRate !== -1 ? cellToString(row[cols.colVatRate]) : "";
    let vatRateVal = 0;
    if (vatRateStr.includes("8")) vatRateVal = 8;
    else if (vatRateStr.includes("10")) vatRateVal = 10;
    else if (vatRateStr.includes("5")) vatRateVal = 5;

    // Suy luận Category & ItemGroup nếu chưa có
    let finalCategory = categoryVal.trim();
    let finalItemGroup = itemGroupVal.trim();
    const lowerName = itemName.toLowerCase();

    if (!finalCategory) {
      if (
        lowerName.includes("uống") ||
        lowerName.includes("bia") ||
        lowerName.includes("rượu") ||
        lowerName.includes("nước") ||
        lowerName.includes("trà") ||
        lowerName.includes("sake") ||
        lowerName.includes("dassai") ||
        lowerName.includes("sapporo") ||
        lowerName.includes("tiger")
      ) {
        finalCategory = "Đồ uống";
        finalItemGroup = "Đồ uống";
      } else if (lowerName.includes("omakase")) {
        finalCategory = "Omakase";
        finalItemGroup = "Món ăn";
      } else if (
        lowerName.includes("sushi") ||
        lowerName.includes("sashimi") ||
        lowerName.includes("gunkan") ||
        lowerName.includes("maki") ||
        lowerName.includes("nigiri")
      ) {
        finalCategory = "Sushi & Sashimi";
        finalItemGroup = "Món ăn";
      } else {
        finalCategory = "Món ăn";
        finalItemGroup = "Món ăn";
      }
    }
    if (!finalItemGroup) {
      finalItemGroup = finalCategory.toLowerCase().includes("uống") ? "Đồ uống" : "Món ăn";
    }

    // Bỏ qua dòng trống hoặc dòng tổng cộng của MISA
    if (itemName.toLowerCase().includes("tổng cộng") || itemName.toLowerCase().includes("cộng")) continue;

    // TRƯỜNG HỢP A: Dòng tổng quan của Hóa đơn MISA CukCuk
    if (invCodeRaw && !itemCode && !itemName) {
      currentInvoiceCode = invCodeRaw;
      const invoiceTotal = lineTotal;
      const vatVal = cols.colVat !== -1 ? cellToNumber(row[cols.colVat], 0) : 0;
      const grossVal = cols.colGrossTotal !== -1 ? cellToNumber(row[cols.colGrossTotal], 0) : 0;

      if (!groupsMap.has(invCodeRaw)) {
        groupsMap.set(invCodeRaw, {
          invoice_code: invCodeRaw,
          order_date: orderDateIso,
          display_date: displayDate,
          table_number: tableNumber,
          payment_method_str: methodStr,
          discount: lineDiscount,
          invoice_total: invoiceTotal > 0 ? invoiceTotal : 0,
          tax_amount: vatVal,
          gross_total: grossVal,
          note: note || (tableNumber ? `Bàn: ${tableNumber}${timeVal ? ` · ${timeVal}` : ""}` : ""),
          items: [],
        });
      } else {
        const group = groupsMap.get(invCodeRaw)!;
        if (lineTotal > 0 && (!group.invoice_total || group.invoice_total === 0)) {
          group.invoice_total = lineTotal;
        }
        if (vatVal > 0) group.tax_amount = vatVal;
        if (grossVal > 0) group.gross_total = grossVal;
      }
      continue;
    }

    // TRƯỜNG HỢP B: Dòng chi tiết món ăn
    if (!itemName && !itemCode) continue;
    if (qty <= 0) continue;

    let invoiceCode = invCodeRaw || currentInvoiceCode;
    if (!invoiceCode) {
      const datePart = orderDateIso.slice(0, 10).replace(/-/g, "");
      invoiceCode = `MISA-TH-${datePart}-${String(autoInvoiceCounter++).padStart(3, "0")}`;
    }
    currentInvoiceCode = invoiceCode;

    // Đối chiếu món với menu ERP
    let matchedItem: PosMenuItem | undefined;
    let matchedBy: "code" | "name" | undefined;

    if (itemCode && menuByCode.has(itemCode.toLowerCase())) {
      matchedItem = menuByCode.get(itemCode.toLowerCase());
      matchedBy = "code";
    } else if (itemName && menuByName.has(normalizeName(itemName))) {
      matchedItem = menuByName.get(normalizeName(itemName));
      matchedBy = "name";
    }

    const isMatched = Boolean(matchedItem);

    if (!isMatched) {
      const key = `${itemCode}__${itemName}`;
      const existing = unmatchedTracker.get(key);
      if (existing) {
        existing.occurrences += 1;
        if (unitPrice > 0 && existing.unitPrice <= 0) existing.unitPrice = unitPrice;
      } else {
        unmatchedTracker.set(key, {
          code: itemCode,
          name: itemName,
          occurrences: 1,
          unitPrice: unitPrice > 0 ? unitPrice : 0,
          unit: unitVal || "Phần",
          category: finalCategory,
          itemGroup: finalItemGroup,
          taxPercent: vatRateVal,
        });
      }
    }

    const orderItem: MisaOrderItem = {
      menu_item_id: matchedItem?.id,
      raw_code: itemCode,
      raw_name: itemName,
      quantity: qty,
      unit_price: unitPrice,
      line_total: lineTotal,
      is_matched: isMatched,
      matched_name: matchedItem?.name,
      matched_by: matchedBy,
      missing_recipe: matchedItem?.missing_recipe,
      unit: unitVal || "Phần",
      category: finalCategory,
      item_group: finalItemGroup,
      tax_percent: vatRateVal,
    };

    if (!groupsMap.has(invoiceCode)) {
      groupsMap.set(invoiceCode, {
        invoice_code: invoiceCode,
        order_date: orderDateIso,
        display_date: displayDate,
        table_number: tableNumber,
        payment_method_str: methodStr,
        discount: lineDiscount,
        invoice_total: 0,
        tax_amount: 0,
        gross_total: 0,
        note: note || (tableNumber ? `Bàn: ${tableNumber}${timeVal ? ` · ${timeVal}` : ""}` : ""),
        items: [orderItem],
      });
    } else {
      const group = groupsMap.get(invoiceCode)!;
      group.items.push(orderItem);
      group.discount += lineDiscount;
      if (!group.table_number && tableNumber) group.table_number = tableNumber;
      if (!group.note && note) group.note = note;
    }
  }

  // 3. Xây dựng danh sách đơn hoàn chỉnh và đánh giá tính hợp lệ
  const orders: MisaParsedOrder[] = [];
  let totalRevenue = 0;
  let totalTax = 0;
  let totalGrossRevenue = 0;

  for (const group of groupsMap.values()) {
    if (group.items.length === 0) continue;

    const subtotal = group.items.reduce((sum, it) => sum + it.line_total, 0);
    const discount = Math.min(group.discount, subtotal);
    const totalAmount = group.invoice_total && group.invoice_total > 0
      ? group.invoice_total
      : Math.max(0, subtotal - discount);
    const paymentMethod = normalizePaymentMethod(group.payment_method_str);

    const isDuplicate = existingCodesSet.has(group.invoice_code.toLowerCase());

    const errors: string[] = [];
    const warnings: string[] = [];

    // Kiểm tra trùng lặp
    if (isDuplicate) {
      warnings.push(`Hóa đơn "${group.invoice_code}" đã từng được nhập vào hệ thống`);
    }

    // Kiểm tra món chưa khớp
    const unmatched = group.items.filter((it) => !it.is_matched);
    const hasNewItems = unmatched.length > 0;
    if (hasNewItems) {
      const names = unmatched.map((u) => u.raw_name || u.raw_code).join(", ");
      if (autoAddMenuItems) {
        warnings.push(`Có ${unmatched.length} món mới sẽ tự động thêm vào Thực đơn ERP: ${names}`);
      } else {
        errors.push(`Có ${unmatched.length} món chưa có trong Thực đơn ERP: ${names}`);
      }
    }

    // Cảnh báo món chưa có định lượng BOM
    const missingRecipe = group.items.filter((it) => it.is_matched && it.missing_recipe);
    if (missingRecipe.length > 0) {
      const names = missingRecipe.map((m) => m.matched_name || m.raw_name).join(", ");
      warnings.push(`Có ${missingRecipe.length} món chưa thiết lập định lượng BOM: ${names}`);
    }

    const isValid = errors.length === 0;
    const vatAmount = group.tax_amount || 0;
    const grossTotal = group.gross_total > 0 ? group.gross_total : totalAmount + vatAmount;
    let finalNote = group.note;
    if (vatAmount > 0 && !finalNote.includes("VAT:")) {
      finalNote = `${finalNote} · VAT: ${Math.round(vatAmount)} · Thực thu: ${Math.round(grossTotal)}`;
    }

    orders.push({
      invoice_code: group.invoice_code,
      order_date: group.order_date,
      display_date: group.display_date,
      table_number: group.table_number,
      payment_method: paymentMethod,
      discount: discount,
      subtotal: subtotal,
      total_amount: totalAmount,
      tax_amount: vatAmount,
      total_with_tax: grossTotal,
      note: finalNote,
      items: group.items,
      is_duplicate: isDuplicate,
      is_valid: isValid,
      has_new_items: hasNewItems,
      errors: errors,
      warnings: warnings,
    });

    if (isValid && !isDuplicate) {
      totalRevenue += totalAmount;
      totalTax += vatAmount;
      totalGrossRevenue += grossTotal;
    }
  }

  const validInvoices = orders.filter((o) => o.is_valid && !o.is_duplicate).length;
  const duplicateInvoices = orders.filter((o) => o.is_duplicate).length;
  const invalidInvoices = orders.filter((o) => !o.is_valid).length;

  return {
    orders,
    totalInvoices: orders.length,
    validInvoices,
    duplicateInvoices,
    invalidInvoices,
    unmatchedItems: Array.from(unmatchedTracker.values()),
    totalRevenue,
    totalTax,
    totalGrossRevenue,
  };
}

/** Tạo file mẫu Excel xuất bán hàng chuẩn của MISA CukCuk */
export function generateMisaCukCukTemplate(): ArrayBuffer {
  const headers = [
    "Số hóa đơn",
    "Ngày hóa đơn",
    "Phòng bàn",
    "Mã món",
    "Tên món",
    "Đơn vị tính",
    "Số lượng",
    "Đơn giá",
    "Thành tiền",
    "Tiền giảm giá",
    "Hình thức thanh toán",
    "Ghi chú",
  ];

  const sampleData = [
    [
      "HD0001",
      "12/09/2026 11:30:00",
      "Bàn 1",
      "PHO-01",
      "Phở bò tái",
      "Bát",
      2,
      65000,
      130000,
      0,
      "Tiền mặt",
      "Ít hành lá",
    ],
    [
      "HD0001",
      "12/09/2026 11:30:00",
      "Bàn 1",
      "DU-01",
      "Trà đào cam sả",
      "Ly",
      2,
      35000,
      70000,
      0,
      "Tiền mặt",
      "",
    ],
    [
      "HD0002",
      "12/09/2026 12:15:00",
      "Bàn 3",
      "COM-01",
      "Cơm sườn nướng",
      "Đĩa",
      1,
      75000,
      75000,
      5000,
      "Chuyển khoản QR",
      "Thêm canh",
    ],
    [
      "HD0002",
      "12/09/2026 12:15:00",
      "Bàn 3",
      "DU-02",
      "Nước cam vắt",
      "Ly",
      1,
      40000,
      40000,
      0,
      "Chuyển khoản QR",
      "",
    ],
    [
      "HD0003",
      "12/09/2026 13:00:00",
      "Mang về",
      "PHO-02",
      "Phở gà ta",
      "Bát",
      3,
      60000,
      180000,
      10000,
      "Thẻ ngân hàng",
      "Để riêng bánh phở",
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);

  // Căn chỉnh độ rộng cột
  ws["!cols"] = [
    { wch: 14 }, // Số hóa đơn
    { wch: 20 }, // Ngày hóa đơn
    { wch: 14 }, // Phòng bàn
    { wch: 14 }, // Mã món
    { wch: 24 }, // Tên món
    { wch: 12 }, // ĐVT
    { wch: 10 }, // Số lượng
    { wch: 14 }, // Đơn giá
    { wch: 16 }, // Thành tiền
    { wch: 14 }, // Tiền giảm giá
    { wch: 22 }, // Hình thức thanh toán
    { wch: 24 }, // Ghi chú
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ChiTietBanHang_MISA");

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return out as ArrayBuffer;
}
