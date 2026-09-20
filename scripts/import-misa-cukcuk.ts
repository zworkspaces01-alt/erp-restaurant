import * as XLSX from "xlsx";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function cellToString(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

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

function parseExcelDateTime(val: unknown, timeStr = ""): { iso: string; display: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");

  if (typeof val === "number") {
    try {
      const dateObj = XLSX.SSF.parse_date_code(val);
      if (dateObj) {
        const y = dateObj.y;
        const m = dateObj.m;
        const d = dateObj.d;
        let H = dateObj.H ?? 12;
        let M = dateObj.M ?? 0;
        let S = dateObj.S ?? 0;

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
    } catch {}
  }
  return { iso: now.toISOString(), display: "" };
}

async function run() {
  console.log("=== BẮT ĐẦU ĐỒNG BỘ THỰC ĐƠN & NHẬP HÓA ĐƠN TỪ MISA CUKCUK ===");

  const filePath = "./Chi-tiet-doanh-thu-theo-hoa-don-va-mat-hang-3bf02c14-41a0-4866-b546-22cfe39fe47f.xls";
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // -------------------------------------------------------------
  // BƯỚC 1: TRÍCH XUẤT VÀ TẠO 115 MÓN ĂN VÀO BẢNG menu_items
  // -------------------------------------------------------------
  const dishMap = new Map<string, {
    code: string;
    name: string;
    unit: string;
    price: number;
    vat: number;
    category: string;
    item_group: string;
  }>();

  for (let i = 11; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const code = cellToString(r[3]);
    const name = cellToString(r[4]);
    const unit = cellToString(r[5]);
    const price = cellToNumber(r[7], 0);
    const vatStr = cellToString(r[15]);
    const itemType = cellToString(r[16]);
    const menuGroup = cellToString(r[17]);

    if (!code && !name) continue;
    if (name.toLowerCase().includes("tổng cộng") || name.toLowerCase().includes("cộng")) continue;

    const key = (code || name).toLowerCase();
    if (!dishMap.has(key)) {
      // Phân loại nhóm món
      let category = menuGroup;
      if (!category) {
        if (itemType.toLowerCase().includes("uống")) category = "Đồ uống";
        else if (name.toLowerCase().includes("omakase")) category = "Omakase";
        else category = "Món khác";
      }

      const vat = vatStr.includes("8") ? 8 : vatStr.includes("10") ? 10 : 0;
      const itemGroup = itemType.toLowerCase().includes("uống") ? "Đồ uống" : "Món ăn";

      dishMap.set(key, {
        code: code || `MISA-${dishMap.size + 1}`,
        name,
        unit,
        price,
        vat,
        category,
        item_group: itemGroup,
      });
    }
  }

  console.log(`\n1. Đã trích xuất ${dishMap.size} mặt hàng từ file MISA.`);

  // Lấy các món đã có trong DB
  const { data: existingItems } = await supabase.from("menu_items").select("id, code, name");
  const existingCodeMap = new Map<string, string>();
  const existingNameMap = new Map<string, string>();

  for (const it of existingItems || []) {
    if (it.code) existingCodeMap.set(it.code.toLowerCase(), it.id);
    if (it.name) existingNameMap.set(it.name.toLowerCase().trim(), it.id);
  }

  let createdDishes = 0;
  let updatedDishes = 0;

  for (const dish of dishMap.values()) {
    const byCodeId = dish.code ? existingCodeMap.get(dish.code.toLowerCase()) : undefined;
    const byNameId = existingNameMap.get(dish.name.toLowerCase().trim());
    const existingId = byCodeId || byNameId;

    if (existingId) {
      // Cập nhật giá bán hoặc danh mục nếu thiếu
      await supabase
        .from("menu_items")
        .update({
          selling_price: dish.price > 0 ? dish.price : undefined,
          category: dish.category,
          tax_percent: dish.vat,
          is_active: true,
        })
        .eq("id", existingId);
      updatedDishes++;
    } else {
      // Tạo món mới
      const { data: inserted, error: insErr } = await supabase
        .from("menu_items")
        .insert({
          code: dish.code,
          name: dish.name,
          category: dish.category,
          item_group: dish.item_group,
          selling_price: dish.price,
          tax_percent: dish.vat,
          is_active: true,
          description: `ĐVT: ${dish.unit || "Phần"} · Đồng bộ từ MISA CukCuk`,
        })
        .select("id")
        .single();

      if (insErr) {
        console.error(`Lỗi tạo món ${dish.name}:`, insErr.message);
      } else if (inserted) {
        createdDishes++;
        existingCodeMap.set(dish.code.toLowerCase(), inserted.id);
        existingNameMap.set(dish.name.toLowerCase().trim(), inserted.id);
      }
    }
  }

  console.log(`=> Hoàn thành cập nhật thực đơn: Tạo mới ${createdDishes} món, cập nhật ${updatedDishes} món.`);

  // Nạp lại toàn bộ menuItems vào Map để ánh xạ sang đơn hàng
  const { data: allMenu } = await supabase.from("menu_items").select("id, code, name, selling_price");
  const menuMapByCode = new Map<string, { id: string; name: string; price: number }>();
  const menuMapByName = new Map<string, { id: string; name: string; price: number }>();

  for (const m of allMenu || []) {
    if (m.code) menuMapByCode.set(m.code.toLowerCase().trim(), { id: m.id, name: m.name, price: Number(m.selling_price) });
    if (m.name) menuMapByName.set(m.name.toLowerCase().trim(), { id: m.id, name: m.name, price: Number(m.selling_price) });
  }

  // -------------------------------------------------------------
  // BƯỚC 2: TRÍCH XUẤT VÀ TẠO 66 HÓA ĐƠN BÁN HÀNG
  // -------------------------------------------------------------
  console.log("\n2. Đang phân tích 66 hóa đơn và các dòng chi tiết...");

  interface InvoiceGroup {
    invoice_code: string;
    order_date: string;
    table_number: string;
    invoice_total: number;
    discount: number;
    time_str: string;
    items: {
      menu_item_id: string;
      code: string;
      name: string;
      quantity: number;
      price: number;
      total: number;
    }[];
  }

  const invoicesMap = new Map<string, InvoiceGroup>();
  let currentInvCode = "";

  for (let i = 11; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;

    const invCodeRaw = cellToString(r[2]);
    const itemCode = cellToString(r[3]);
    const itemName = cellToString(r[4]);
    const qty = cellToNumber(r[6], 0);
    const price = cellToNumber(r[7], 0);
    const lineTotal = cellToNumber(r[8], qty * price);
    const dateVal = r[0];
    const timeStr = cellToString(r[1]);
    const tableNumber = cellToString(r[22]) || cellToString(r[21]);

    if (itemName.toLowerCase().includes("tổng cộng") || itemName.toLowerCase().includes("cộng")) continue;

    // Dòng tổng quan hóa đơn
    if (invCodeRaw && !itemCode && !itemName) {
      currentInvCode = invCodeRaw;
      const { iso } = parseExcelDateTime(dateVal, timeStr);
      const invoiceTotal = cellToNumber(r[8], 0);
      const discount = cellToNumber(r[12], 0);

      if (!invoicesMap.has(invCodeRaw)) {
        invoicesMap.set(invCodeRaw, {
          invoice_code: invCodeRaw,
          order_date: iso,
          table_number: tableNumber,
          invoice_total: invoiceTotal,
          discount: discount,
          time_str: timeStr,
          items: [],
        });
      }
      continue;
    }

    // Dòng món
    if (itemCode || itemName) {
      if (qty <= 0) continue;
      const code = invCodeRaw || currentInvCode;
      currentInvCode = code;

      const { iso } = parseExcelDateTime(dateVal, timeStr);

      if (!invoicesMap.has(code)) {
        invoicesMap.set(code, {
          invoice_code: code,
          order_date: iso,
          table_number: tableNumber,
          invoice_total: lineTotal,
          discount: 0,
          time_str: timeStr,
          items: [],
        });
      }

      // Tìm menu_item_id
      const matched = (itemCode && menuMapByCode.get(itemCode.toLowerCase().trim())) ||
                      (itemName && menuMapByName.get(itemName.toLowerCase().trim()));

      if (!matched) {
        console.warn(`Không tìm thấy món: [${itemCode}] ${itemName}`);
        continue;
      }

      invoicesMap.get(code)!.items.push({
        menu_item_id: matched.id,
        code: itemCode,
        name: itemName || matched.name,
        quantity: qty,
        price: price > 0 ? price : matched.price,
        total: lineTotal,
      });
    }
  }

  console.log(`Đã gom được ${invoicesMap.size} hóa đơn hoàn chỉnh.`);

  // Kiểm tra các hóa đơn đã từng import
  const { data: existingOrders } = await supabase
    .from("orders")
    .select("note")
    .ilike("note", "%[MISA:%");

  const importedCodes = new Set<string>();
  const reg = /\[MISA:\s*([^\]]+)\]/i;
  for (const o of existingOrders || []) {
    if (o.note) {
      const match = reg.exec(o.note);
      if (match && match[1]) importedCodes.add(match[1].trim().toLowerCase());
    }
  }

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  let totalImportedRevenue = 0;

  for (const inv of invoicesMap.values()) {
    if (importedCodes.has(inv.invoice_code.toLowerCase())) {
      skipCount++;
      continue;
    }

    if (inv.items.length === 0) {
      console.warn(`Bỏ qua hóa đơn ${inv.invoice_code} vì không có dòng món nào.`);
      continue;
    }

    const note = `[MISA: ${inv.invoice_code}] Bàn: ${inv.table_number || "—"}${inv.time_str ? ` · ${inv.time_str}` : ""}`;

    // Gọi RPC create_order
    const { error: ordErr } = await supabase.rpc("create_order", {
      p_items: inv.items.map((it) => ({
        menu_item_id: it.menu_item_id,
        quantity: it.quantity,
      })),
      p_order_date: inv.order_date,
      p_table_number: inv.table_number || undefined,
      p_discount: inv.discount > 0 ? inv.discount : 0,
      p_payment_method: "cash",
      p_note: note,
    });

    if (ordErr) {
      console.error(`Lỗi tạo đơn ${inv.invoice_code}:`, ordErr.message);
      failCount++;
    } else {
      successCount++;
      importedCodes.add(inv.invoice_code.toLowerCase());
      const sumItems = inv.items.reduce((s, it) => s + it.total, 0);
      const rev = inv.invoice_total > 0 ? inv.invoice_total : sumItems;
      totalImportedRevenue += rev;
    }
  }

  console.log("\n=== KẾT QUẢ NHẬP DỮ LIỆU BÁN HÀNG ===");
  console.log(`- Nhập thành công: ${successCount} hóa đơn`);
  console.log(`- Bỏ qua do trùng lặp: ${skipCount} hóa đơn`);
  console.log(`- Lỗi: ${failCount} hóa đơn`);
  console.log(`- Tổng doanh thu ghi nhận: ${totalImportedRevenue.toLocaleString("vi-VN")} VNĐ`);
}

run().catch(console.error);
