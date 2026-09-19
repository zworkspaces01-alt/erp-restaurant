"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FileX2,
  HelpCircle,
  Layers,
  Maximize2,
  Percent,
  Plus,
  Receipt,
  RotateCw,
  Sparkles,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { formatNumber, formatVND } from "@/lib/format";
import {
  type InvoiceOcrReviewData,
  type MatchedInvoiceItem,
  type PaymentMethod,
  normalizeDateToISO,
} from "@/types/restaurant";
import type {
  IngredientPickRow,
  SupplierPickRow,
} from "@/lib/queries/purchases.queries";
import { createPurchaseOrder } from "@/server-actions/purchases.actions";
import { createIngredient } from "@/server-actions/inventory.actions";
import { SubmitButton } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IngredientPicker } from "@/components/purchases/ingredient-picker";

interface InvoiceReviewSplitViewProps {
  reviewData: InvoiceOcrReviewData;
  modelUsed: string;
  isMock: boolean;
  suppliers: SupplierPickRow[];
  ingredients: IngredientPickRow[];
  onClose: () => void;
}

export function InvoiceReviewSplitView({
  reviewData,
  modelUsed,
  isMock,
  suppliers,
  ingredients,
  onClose,
}: InvoiceReviewSplitViewProps) {
  const router = useRouter();

  // Review Form States
  const [supplierId, setSupplierId] = useState<string>(reviewData.supplier_id || "");
  const [invoiceNumber, setInvoiceNumber] = useState<string>(reviewData.invoice_number || "");
  const [orderDate, setOrderDate] = useState<string>(reviewData.order_date);
  const [excludedItems] = useState<string[]>(() => reviewData.excluded_items || []);
  const [paidNow, setPaidNow] = useState<number>(0);
  const [paidMethod, setPaidMethod] = useState<PaymentMethod>("cash");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // VAT & Pricing Reconciliation States
  const [rawItems, setRawItems] = useState<MatchedInvoiceItem[]>(() =>
    reviewData.items.map((it) => ({
      ...it,
      tax_rate: typeof it.tax_rate === "number" ? it.tax_rate : (it.is_taxable ? (reviewData.raw_extracted?.tax_percent || 8) : 0),
      is_taxable: (it.tax_rate ?? 0) > 0 || Boolean(it.is_taxable),
    }))
  );

  const baseSubtotal = rawItems.reduce((sum, it) => sum + (it.line_total || 0), 0);

  // Tính tiền thuế từ các dòng mặt hàng
  const initialItemTaxSum = reviewData.items.reduce((sum, it) => {
    const rate = it.tax_rate || 0;
    return rate > 0 ? sum + Math.round((it.line_total || 0) * (rate / 100)) : sum;
  }, 0);

  const initialTaxAmount = reviewData.tax_amount > 0
    ? reviewData.tax_amount
    : initialItemTaxSum > 0
    ? initialItemTaxSum
    : Math.max(0, (reviewData.total_amount || 0) - baseSubtotal);

  const initialTaxPercent = reviewData.raw_extracted?.tax_percent ?? (
    baseSubtotal > 0 && initialTaxAmount > 0
      ? Math.round((initialTaxAmount / baseSubtotal) * 100)
      : 0
  );

  const hasItemTax = reviewData.items.some((it) => (it.tax_rate ?? 0) > 0);
  const shouldAutoAllocateVat = initialTaxAmount > 0;

  // Tính toán items ban đầu (Tự động phân bổ thuế VAT vào mặt hàng chịu thuế nếu hóa đơn có VAT)
  const [items, setItems] = useState<MatchedInvoiceItem[]>(() => {
    const initialRaw = reviewData.items.map((it) => ({
      ...it,
      tax_rate: typeof it.tax_rate === "number" ? it.tax_rate : (it.is_taxable ? (reviewData.raw_extracted?.tax_percent || 8) : 0),
      is_taxable: (it.tax_rate ?? 0) > 0 || Boolean(it.is_taxable),
    }));

    if (!shouldAutoAllocateVat) {
      return initialRaw;
    }

    const currentBaseSubtotal = initialRaw.reduce((sum, it) => sum + (it.line_total || 0), 0);
    const taxableBaseSum = initialRaw.reduce((sum, it) => {
      return (it.tax_rate || 0) > 0 ? sum + it.quantity * it.unit_price : sum;
    }, 0);
    const hasTaxable = taxableBaseSum > 0;
    const allocationBase = hasTaxable ? taxableBaseSum : currentBaseSubtotal;
    const ratio = (allocationBase + initialTaxAmount) / (allocationBase || 1);

    let currentSum = 0;
    const allocated = initialRaw.map((item) => {
      const isTaxableRow = hasTaxable ? (item.tax_rate || 0) > 0 : true;
      if (!isTaxableRow) {
        const keepPrice = item.unit_price;
        const lineTotal = item.quantity * keepPrice;
        currentSum += lineTotal;
        return { ...item, unit_price: keepPrice, line_total: lineTotal };
      }
      const newPrice = Math.round(item.unit_price * ratio);
      const lineTotal = item.quantity * newPrice;
      currentSum += lineTotal;
      return { ...item, unit_price: newPrice, line_total: lineTotal };
    });

    const targetGrandTotal = currentBaseSubtotal + initialTaxAmount;
    const diff = targetGrandTotal - currentSum;
    if (Math.abs(diff) > 0 && Math.abs(diff) < 10000 && allocated.length > 0) {
      let candidateIdx = -1;
      let maxTotal = -1;
      for (let i = 0; i < allocated.length; i++) {
        const isTaxableRow = hasTaxable ? (allocated[i].tax_rate || 0) > 0 : true;
        if (isTaxableRow && allocated[i].line_total > maxTotal) {
          maxTotal = allocated[i].line_total;
          candidateIdx = i;
        }
      }
      if (candidateIdx !== -1 && allocated[candidateIdx].quantity > 0) {
        const target = allocated[candidateIdx];
        const adjustedPrice = Math.round((target.line_total + diff) / target.quantity);
        target.unit_price = adjustedPrice;
        target.line_total = target.quantity * adjustedPrice;
      }
    }
    return allocated;
  });

  const [note, setNote] = useState<string>(() => {
    const baseNote = `Nhập tự động qua AI OCR (${modelUsed}). Hóa đơn: ${reviewData.invoice_number || "—"}`;
    return shouldAutoAllocateVat ? `${baseNote} [Đã gồm VAT]`.trim() : baseNote;
  });

  // Xác định mục tiêu tổng tiền hóa đơn: Lấy đúng tổng tiền in trên hóa đơn
  const initialTargetTotal = reviewData.total_amount > 0 ? reviewData.total_amount : baseSubtotal + initialTaxAmount;

  const [taxPercent, setTaxPercent] = useState<number>(initialTaxPercent);
  const [taxAmount, setTaxAmount] = useState<number>(initialTaxAmount);
  const [targetInvoiceTotal, setTargetInvoiceTotal] = useState<number>(initialTargetTotal);
  const [isVatAllocated, setIsVatAllocated] = useState<boolean>(shouldAutoAllocateVat);
  const [vatPreset, setVatPreset] = useState<"items" | "0" | "5" | "8" | "10" | "custom">(() => {
    if (hasItemTax) return "items";
    if (initialTaxPercent === 5) return "5";
    if (initialTaxPercent === 8) return "8";
    if (initialTaxPercent === 10) return "10";
    if (initialTaxAmount > 0) return "custom";
    return "0";
  });
  const [showCustomTaxInput, setShowCustomTaxInput] = useState<boolean>(
    initialTaxAmount > 0 && initialTaxPercent !== 5 && initialTaxPercent !== 8 && initialTaxPercent !== 10 && !hasItemTax
  );


  // Áp dụng mức VAT định sẵn hoặc tùy chỉnh
  const handleSelectVatPreset = (preset: "items" | "0" | "5" | "8" | "10" | "custom") => {
    setVatPreset(preset);
    if (preset === "items") {
      // Mỗi món áp dụng đúng thuế suất của từng món
      const updated = items.map((it, i) => {
        const raw = rawItems[i] || it;
        const r = it.tax_rate || 0;
        const price = r > 0 ? Math.round(raw.unit_price * (1 + r / 100)) : raw.unit_price;
        const lineTotal = it.quantity * price;
        return {
          ...it,
          unit_price: price,
          line_total: lineTotal,
        };
      });
      setItems(updated);

      const newTaxSum = updated.reduce((sum, it, i) => {
        const r = it.tax_rate || 0;
        if (r <= 0) return sum;
        const rawPrice = rawItems[i]?.unit_price || it.unit_price;
        return sum + Math.round(it.quantity * rawPrice * (r / 100));
      }, 0);

      const newTotal = updated.reduce((sum, it) => sum + (it.line_total || 0), 0);
      setTaxAmount(newTaxSum);
      setTargetInvoiceTotal(newTotal);
      setTaxPercent(baseSubtotal > 0 ? Math.round((newTaxSum / baseSubtotal) * 100) : 0);
      setIsVatAllocated(true);
      setShowCustomTaxInput(false);
    } else if (preset === "0") {
      // Đưa toàn bộ về giá gốc chưa VAT (KCT 0%)
      const updated = items.map((it, i) => {
        const raw = rawItems[i] || it;
        return {
          ...it,
          tax_rate: 0,
          is_taxable: false,
          unit_price: raw.unit_price,
          line_total: it.quantity * raw.unit_price,
        };
      });
      const updatedRaw = rawItems.map((it) => ({ ...it, tax_rate: 0, is_taxable: false }));
      setItems(updated);
      setRawItems(updatedRaw);
      setTaxPercent(0);
      setTaxAmount(0);
      setTargetInvoiceTotal(baseSubtotal);
      setIsVatAllocated(false);
      setShowCustomTaxInput(false);
    } else if (preset === "5" || preset === "8" || preset === "10") {
      const pct = Number(preset);
      const updated = items.map((it, i) => {
        const raw = rawItems[i] || it;
        const newPrice = Math.round(raw.unit_price * (1 + pct / 100));
        return {
          ...it,
          tax_rate: pct,
          is_taxable: true,
          unit_price: newPrice,
          line_total: it.quantity * newPrice,
        };
      });
      const updatedRaw = rawItems.map((it) => ({ ...it, tax_rate: pct, is_taxable: true }));
      setItems(updated);
      setRawItems(updatedRaw);
      const newTotal = updated.reduce((sum, it) => sum + (it.line_total || 0), 0);
      const computedTax = Math.max(0, newTotal - baseSubtotal);
      setTaxPercent(pct);
      setTaxAmount(computedTax);
      setTargetInvoiceTotal(newTotal);
      setIsVatAllocated(true);
      setShowCustomTaxInput(false);
    } else {
      setShowCustomTaxInput(true);
    }
  };

  const handleCustomTaxChange = (newTax: number) => {
    const validTax = Math.max(0, newTax);
    setTaxAmount(validTax);
    setTargetInvoiceTotal(baseSubtotal + validTax);
    setTaxPercent(baseSubtotal > 0 ? Math.round((validTax / baseSubtotal) * 100) : 0);
    if (isVatAllocated) {
      applyVatAllocationInternal(items, rawItems, validTax);
    }
  };

  const handleTargetTotalChange = (newTotal: number) => {
    const validTotal = Math.max(0, newTotal);
    setTargetInvoiceTotal(validTotal);
    const diff = Math.max(0, validTotal - baseSubtotal);
    setTaxAmount(diff);
    setTaxPercent(baseSubtotal > 0 ? Math.round((diff / baseSubtotal) * 100) : 0);
    if (isVatAllocated) {
      applyVatAllocationInternal(items, rawItems, diff);
    }
  };

  // Phân bổ VAT vào từng dòng hàng hóa:
  // CHỈ phân bổ thuế vào các mặt hàng CHỊU THUẾ (tax_rate > 0)
  // Các mặt hàng KHÔNG CHỊU THUẾ (tax_rate === 0) giữ nguyên 100% đơn giá gốc
  const applyVatAllocationInternal = (
    currentItems: MatchedInvoiceItem[],
    currentRaw: MatchedInvoiceItem[],
    amountToAllocate: number
  ) => {
    if (amountToAllocate <= 0) {
      return;
    }

    const currentBaseSubtotal = currentRaw.reduce(
      (sum, it) => sum + (it.line_total || it.quantity * it.unit_price || 0),
      0
    );

    // Tính tổng tiền hàng chưa thuế của riêng các món chịu thuế
    const taxableBaseSum = currentItems.reduce((sum, it, i) => {
      if ((it.tax_rate || 0) > 0) {
        const raw = currentRaw[i] || it;
        return sum + it.quantity * raw.unit_price;
      }
      return sum;
    }, 0);

    const hasTaxable = taxableBaseSum > 0;
    const allocationBase = hasTaxable ? taxableBaseSum : currentBaseSubtotal;
    const ratio = (allocationBase + amountToAllocate) / (allocationBase || 1);

    let currentSum = 0;
    const updated = currentItems.map((item, idx) => {
      const raw = currentRaw[idx] || item;
      const isTaxableRow = hasTaxable ? (item.tax_rate || 0) > 0 : true;

      if (!isTaxableRow) {
        // Mặt hàng không chịu thuế (KCT): GIỮ NGUYÊN ĐƠN GIÁ GỐC
        const keepPrice = raw.unit_price;
        const lineTotal = item.quantity * keepPrice;
        currentSum += lineTotal;
        return {
          ...item,
          unit_price: keepPrice,
          line_total: lineTotal,
        };
      }

      // Mặt hàng chịu thuế: tăng đơn giá theo tỷ lệ thuế
      const newPrice = Math.round(raw.unit_price * ratio);
      const lineTotal = item.quantity * newPrice;
      currentSum += lineTotal;
      return {
        ...item,
        unit_price: newPrice,
        line_total: lineTotal,
      };
    });

    // Bù trừ chênh lệch làm tròn vào mặt hàng CHỊU THUẾ có thành tiền lớn nhất
    const targetGrandTotal = currentBaseSubtotal + amountToAllocate;
    const diff = targetGrandTotal - currentSum;
    if (Math.abs(diff) > 0 && Math.abs(diff) < 10000 && updated.length > 0) {
      let candidateIdx = -1;
      let maxTotal = -1;
      for (let i = 0; i < updated.length; i++) {
        const isTaxableRow = hasTaxable ? (updated[i].tax_rate || 0) > 0 : true;
        if (isTaxableRow && updated[i].line_total > maxTotal) {
          maxTotal = updated[i].line_total;
          candidateIdx = i;
        }
      }
      if (candidateIdx !== -1) {
        const target = updated[candidateIdx];
        if (target.quantity > 0) {
          const adjustedPrice = Math.round((target.line_total + diff) / target.quantity);
          target.unit_price = adjustedPrice;
          target.line_total = target.quantity * adjustedPrice;
        }
      }
    }

    setItems(updated);
    setIsVatAllocated(true);
  };

  const applyVatAllocation = (amountToAllocate: number, pct: number = 0) => {
    if (amountToAllocate <= 0) {
      toast.error("Không có số tiền thuế VAT để phân bổ.");
      return;
    }
    applyVatAllocationInternal(items, rawItems, amountToAllocate);

    const taxableCount = items.filter((it) => (it.tax_rate || 0) > 0).length;
    const nonTaxableCount = items.filter((it) => (it.tax_rate || 0) === 0).length;

    const vatLabel = pct > 0 ? `${pct}%` : `+${formatVND(amountToAllocate)}`;
    setNote((prev) => {
      const tag = `[Đã gồm VAT ${vatLabel}]`;
      if (prev.includes("[Đã gồm VAT")) {
        return prev.replace(/\[Đã gồm VAT.*?\]/g, tag).trim();
      }
      return `${prev} ${tag}`.trim();
    });

    if (taxableCount > 0 && nonTaxableCount > 0) {
      toast.success(
        `Đã phân bổ VAT vào ${taxableCount} món chịu thuế. ${nonTaxableCount} món KCT giữ nguyên đơn giá gốc!`
      );
    } else {
      toast.success(`Đã phân bổ thuế VAT (${vatLabel}) vào đơn giá kho!`);
    }
  };

  // Cập nhật thuế suất của một dòng mặt hàng cụ thể
  const handleItemTaxRateChange = (index: number, newRate: number) => {
    const validRate = Math.max(0, newRate);

    // Cập nhật thuế suất trong rawItems
    const updatedRaw = rawItems.map((raw, i) => {
      if (i === index) {
        return {
          ...raw,
          tax_rate: validRate,
          is_taxable: validRate > 0,
        };
      }
      return raw;
    });
    setRawItems(updatedRaw);

    // Nhảy ngay số tiền của từng món:
    // Dòng chịu thuế r% => Đơn giá sau thuế = round(Đơn giá gốc * (1 + r / 100))
    // Dòng không chịu thuế (0%) => Đơn giá giữ nguyên giá gốc
    // Thành tiền = Số lượng * Đơn giá sau thuế
    const updatedItems = items.map((item, i) => {
      const raw = updatedRaw[i] || item;
      const rate = i === index ? validRate : (item.tax_rate || 0);
      const isTaxableRow = rate > 0;
      const unitPrice = isTaxableRow ? Math.round(raw.unit_price * (1 + rate / 100)) : raw.unit_price;
      const lineTotal = item.quantity * unitPrice;

      return {
        ...item,
        tax_rate: rate,
        is_taxable: isTaxableRow,
        unit_price: unitPrice,
        line_total: lineTotal,
      };
    });
    setItems(updatedItems);

    // Tính lại tổng tiền thuế VAT và tổng hóa đơn mới
    const newTaxSum = updatedItems.reduce((sum, it, i) => {
      const r = it.tax_rate || 0;
      if (r <= 0) return sum;
      const rawPrice = updatedRaw[i]?.unit_price || it.unit_price;
      return sum + Math.round(it.quantity * rawPrice * (r / 100));
    }, 0);

    const newDeliveredTotal = updatedItems.reduce((sum, it) => sum + (it.line_total || 0), 0);

    setTaxAmount(newTaxSum);
    setTargetInvoiceTotal(newDeliveredTotal);
    setTaxPercent(baseSubtotal > 0 ? Math.round((newTaxSum / baseSubtotal) * 100) : 0);
    setVatPreset("items");
    setIsVatAllocated(true);
  };

  // Hoàn tác về đơn giá gốc trước thuế
  const handleRevertVat = () => {
    setItems((prev) =>
      prev.map((item, idx) => {
        const raw = rawItems[idx];
        if (!raw) return item;
        return {
          ...item,
          unit_price: raw.unit_price,
          line_total: item.quantity * raw.unit_price,
        };
      })
    );

    setIsVatAllocated(false);
    setNote((prev) => prev.replace(/\s*\[Đã gồm VAT.*?\]/g, "").trim());
    toast.info("Đã khôi phục đơn giá gốc trước thuế (Chưa VAT).");
  };

  // Image Viewer Controls
  const images: string[] =
    reviewData.image_urls && reviewData.image_urls.length > 0
      ? reviewData.image_urls
      : reviewData.image_url
      ? [reviewData.image_url]
      : [];
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const currentImageUrl = images[activeImageIndex] || reviewData.image_url || "";

  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);

  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 0.25, 0.5));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);
  const handleResetView = () => {
    setZoomLevel(1);
    setRotation(0);
  };

  // Line item manipulation
  const handleUpdateItem = (index: number, patch: Partial<MatchedInvoiceItem>) => {
    setItems((prev) => {
      const copy = [...prev];
      const current = { ...copy[index], ...patch };
      current.line_total = current.quantity * current.unit_price;
      if (patch.tax_rate !== undefined) {
        current.is_taxable = patch.tax_rate > 0;
      }
      copy[index] = current;
      return copy;
    });

    setRawItems((prev) => {
      const copy = [...prev];
      if (copy[index]) {
        const current = { ...copy[index] };
        if (patch.raw_name !== undefined) current.raw_name = patch.raw_name;
        if (patch.quantity !== undefined) current.quantity = patch.quantity;
        if (patch.unit !== undefined) current.unit = patch.unit;
        if (patch.unit_price !== undefined) {
          const rate = current.tax_rate || 0;
          current.unit_price = isVatAllocated && rate > 0
            ? Math.round(patch.unit_price / (1 + rate / 100))
            : patch.unit_price;
        }
        if (patch.tax_rate !== undefined) {
          current.tax_rate = patch.tax_rate;
          current.is_taxable = patch.tax_rate > 0;
        }
        current.line_total = current.quantity * current.unit_price;
        copy[index] = current;
      }
      return copy;
    });
  };

  const [currentSuppliers] = useState<SupplierPickRow[]>(() => {
    const list = [...suppliers];
    if (reviewData.supplier_id && !list.some((s) => s.id === reviewData.supplier_id)) {
      list.unshift({
        id: reviewData.supplier_id,
        name: reviewData.matched_supplier_name || reviewData.supplier_name_raw || "Nhà cung cấp mới",
        code: "NCC-AUTO",
        payment_terms_days: 0,
        current_debt: 0,
      });
    }
    return list;
  });

  const [currentIngredients, setCurrentIngredients] = useState<IngredientPickRow[]>(() => {
    const map = new Map<string, IngredientPickRow>();
    ingredients.forEach((ing) => map.set(ing.id, ing));
    reviewData.items.forEach((it) => {
      if (it.ingredient_id && !map.has(it.ingredient_id)) {
        map.set(it.ingredient_id, {
          id: it.ingredient_id,
          name: it.matched_ingredient_name || it.raw_name,
          code: null,
          base_unit: it.unit || "kg",
          import_unit: it.unit || "kg",
          conversion_factor: it.conversion_factor || 1,
          current_stock: 0,
          avg_cost_price: it.unit_price || 0,
          avg_cost_per_import_unit: it.unit_price || 0,
          default_supplier_id: reviewData.supplier_id || null,
        });
      }
    });
    return Array.from(map.values());
  });
  const [isCreatingIngredient, setIsCreatingIngredient] = useState<number | null>(null);

  const handleSelectIngredient = (index: number, ing: IngredientPickRow) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        ingredient_id: ing.id,
        matched_ingredient_name: ing.name,
        unit: ing.import_unit || ing.base_unit,
        conversion_factor: ing.conversion_factor || 1,
        match_confidence: "exact",
      };
      return copy;
    });
  };

  const handleQuickCreateIngredient = async (index: number) => {
    const item = items[index];
    if (!item) return;

    setIsCreatingIngredient(index);
    try {
      const res = await createIngredient({
        name: item.raw_name,
        code: null,
        category: null,
        base_unit: item.unit || "kg",
        import_unit: item.unit || "kg",
        conversion_factor: 1,
        min_alert_stock: 0,
        default_price: item.unit_price || 0,
        default_supplier_id: null,
        is_active: true,
        note: null,
      });

      if (!res.success) {
        toast.error(res.error);
        return;
      }

      const newIng: IngredientPickRow = {
        id: res.data.id,
        name: item.raw_name,
        code: null,
        base_unit: item.unit || "kg",
        import_unit: item.unit || "kg",
        conversion_factor: 1,
        current_stock: 0,
        avg_cost_price: item.unit_price || 0,
        avg_cost_per_import_unit: item.unit_price || 0,
        default_supplier_id: null,
      };

      setCurrentIngredients((prev) => [...prev, newIng]);
      handleSelectIngredient(index, newIng);
      toast.success(`Đã tạo nguyên liệu "${item.raw_name}" vào kho!`);
    } catch {
      toast.error("Lỗi khi tạo nhanh nguyên liệu.");
    } finally {
      setIsCreatingIngredient(null);
    }
  };

  const handleAddItem = () => {
    const newItem: MatchedInvoiceItem = {
      raw_name: "Nguyên liệu bổ sung",
      quantity: 1,
      unit: "kg",
      unit_price: 0,
      line_total: 0,
      ingredient_id: null,
      matched_ingredient_name: null,
      conversion_factor: 1,
      match_confidence: "unmatched",
      tax_rate: 0,
      is_taxable: false,
    };
    setItems((prev) => [...prev, newItem]);
    setRawItems((prev) => [...prev, { ...newItem }]);
  };

  const handleDeleteItem = (index: number) => {
    const itemToDelete = items[index];
    const amount = itemToDelete?.line_total || 0;
    const r = itemToDelete?.tax_rate || 0;
    const itemTax = !isVatAllocated && r > 0 ? Math.round(amount * (r / 100)) : 0;

    setItems((prev) => prev.filter((_, i) => i !== index));
    setRawItems((prev) => prev.filter((_, i) => i !== index));

    // Đồng bộ giảm tổng hóa đơn theo món bị xóa để không bị lệch tiền
    setTargetInvoiceTotal((prev) => Math.max(0, prev - amount - itemTax));
    if (itemTax > 0) {
      setTaxAmount((prev) => Math.max(0, prev - itemTax));
    }
  };

  // Calculate totals
  const calculatedTotal = items.reduce((sum, it) => sum + (it.line_total || 0), 0);
  // Nếu đã phân bổ VAT thì so sánh calculatedTotal với targetInvoiceTotal.
  // Nếu chưa phân bổ VAT (giá trước thuế) thì tổng thanh toán là calculatedTotal + taxAmount.
  const effectivePayableTotal = isVatAllocated ? calculatedTotal : calculatedTotal + taxAmount;
  const isTotalMatched = Math.abs(effectivePayableTotal - targetInvoiceTotal) < 1000;
  const hasUnmatchedItems = items.some((it) => !it.ingredient_id);

  // Nút 1-click tự động khớp tiền theo danh sách món thực nhận
  const handleAutoReconcileTotal = () => {
    setTargetInvoiceTotal(effectivePayableTotal);
    toast.success(`Đã cập nhật tổng hóa đơn thành ${formatVND(effectivePayableTotal)} (Khớp 100%)!`);
  };

  // Phân loại mặt hàng chịu thuế & không chịu thuế
  const nonTaxableItems = items.filter((it) => (it.tax_rate || 0) === 0);
  const taxableItems = items.filter((it) => (it.tax_rate || 0) > 0);
  const nonTaxableItemsCount = nonTaxableItems.length;
  const taxableItemsCount = taxableItems.length;

  const nonTaxableSubtotal = items.reduce((sum, it, idx) => {
    if ((it.tax_rate || 0) === 0) {
      const raw = rawItems[idx] || it;
      const price = isVatAllocated ? raw.unit_price : it.unit_price;
      return sum + it.quantity * price;
    }
    return sum;
  }, 0);

  const taxableSubtotal = items.reduce((sum, it, idx) => {
    if ((it.tax_rate || 0) > 0) {
      const raw = rawItems[idx] || it;
      const price = isVatAllocated ? raw.unit_price : it.unit_price;
      return sum + it.quantity * price;
    }
    return sum;
  }, 0);

  // Submit and Approve
  const handleApproveAndCreate = async () => {
    if (!supplierId) {
      toast.error("Vui lòng chọn Nhà cung cấp trước khi duyệt.");
      return;
    }

    if (items.length === 0) {
      toast.error("Hóa đơn cần ít nhất 1 mặt hàng nguyên liệu.");
      return;
    }

    setIsSubmitting(true);
    setServerError(null);

    try {
      // Kiểm tra UUID nhà cung cấp
      const validSupplierUuid =
        supplierId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(supplierId)
          ? supplierId
          : null;

      // Tự động tạo nguyên liệu cho bất kỳ mục nào chưa có trong kho
      const finalItems = [...items];
      for (let i = 0; i < finalItems.length; i++) {
        const it = finalItems[i];
        if (!it.ingredient_id) {
          const res = await createIngredient({
            name: it.raw_name || "Nguyên liệu mới",
            code: null,
            category: null,
            base_unit: it.unit || "kg",
            import_unit: it.unit || "kg",
            conversion_factor: it.conversion_factor || 1,
            min_alert_stock: 0,
            default_price: it.unit_price || 0,
            default_supplier_id: validSupplierUuid,
            is_active: true,
            note: "Tự động tạo khi duyệt hóa đơn nhập kho",
          });

          if (!res.success) {
            throw new Error(
              `Không thể tự động tạo nguyên liệu "${it.raw_name}": ${res.error}`
            );
          }

          finalItems[i] = {
            ...it,
            ingredient_id: res.data.id,
            matched_ingredient_name: it.raw_name,
          };
        }
      }

      // Lọc bỏ các dòng có số lượng <= 0 (các món không giao trên phiếu)
      const validItemsToImport = finalItems.filter((it) => it.quantity > 0);
      if (validItemsToImport.length === 0) {
        const msg = "Không có mặt hàng nào có số lượng thực giao lớn hơn 0 để nhập kho.";
        setServerError(msg);
        toast.error(msg);
        return;
      }

      const totalValidAmount = validItemsToImport.reduce(
        (sum, it) => sum + it.quantity * it.unit_price,
        0
      );
      const sanitizedPaidNow = Math.min(paidNow, totalValidAmount);
      const sanitizedOrderDate =
        typeof orderDate === "string" && orderDate.trim()
          ? (normalizeDateToISO(orderDate) as string)
          : new Date().toISOString().slice(0, 10);

      const finalInvoiceImageUrl =
        images.length > 1
          ? JSON.stringify(images)
          : images[0] || reviewData.image_url || null;

      const payload = {
        supplier_id: supplierId,
        order_date: sanitizedOrderDate,
        due_date: null,
        invoice_number: invoiceNumber || null,
        invoice_image_url: finalInvoiceImageUrl,
        note: note || null,
        items: validItemsToImport.map((it) => ({
          ingredient_id: it.ingredient_id!,
          quantity: it.quantity,
          unit_price: it.unit_price,
          unit: it.unit || null,
          conversion_factor: it.conversion_factor || 1,
        })),
        paid_now: sanitizedPaidNow,
        paid_method: paidMethod,
      };

      const res = await createPurchaseOrder(payload);

      if (!res.success) {
        setServerError(res.error);
        toast.error(res.error, { duration: 8000 });
        return;
      }

      toast.success("Đã duyệt và tạo phiếu nhập hàng thành công!");
      onClose();
      router.push(`/purchases/${res.data.id}`);
      router.refresh();
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định khi lưu phiếu nhập.";
      setServerError(errMsg);
      toast.error(errMsg, { duration: 8000 });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-[85vh] max-h-[900px] overflow-hidden">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b bg-muted/40">
        <div className="flex items-center gap-2">
          <FileCheck2 className="size-5 text-emerald-600 dark:text-emerald-400" />
          <h2 className="font-semibold text-base">
            Đối Soát & Duyệt Hóa Đơn Nhập Hàng
          </h2>
          <Badge variant="outline" className="gap-1 text-xs bg-background">
            <Sparkles className="size-3 text-sky-500" />
            {modelUsed}
          </Badge>
          {images.length > 1 && (
            <Badge variant="secondary" className="gap-1 text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
              <Layers className="size-3" />
              {images.length} trang ảnh
            </Badge>
          )}
          {isMock && (
            <Badge variant="secondary" className="text-xs">
              Chế độ mẫu (Demo)
            </Badge>
          )}
        </div>

        <div className="text-sm text-muted-foreground">
          Vui lòng kiểm tra đối chiếu các trường trước khi nhấn <strong>Duyệt phiếu</strong>.
        </div>
      </div>

      {/* Main Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
        {/* Left Column: Interactive Image Viewer (5 cols) */}
        <div className="lg:col-span-5 border-r flex flex-col bg-zinc-950/90 text-zinc-100 overflow-hidden relative select-none">
          {/* Viewer Floating Controls */}
          <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1.5 p-1 bg-zinc-900/85 backdrop-blur-md rounded-md border border-zinc-800 shadow-md">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-zinc-300 hover:text-white"
              onClick={handleZoomIn}
              title="Phóng to"
            >
              <ZoomIn className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-zinc-300 hover:text-white"
              onClick={handleZoomOut}
              title="Thu nhỏ"
            >
              <ZoomOut className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-zinc-300 hover:text-white"
              onClick={handleRotate}
              title="Xoay 90 độ"
            >
              <RotateCw className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-zinc-300 hover:text-white"
              onClick={handleResetView}
              title="Đặt lại góc nhìn"
            >
              <Maximize2 className="size-4" />
            </Button>
            <span className="text-[11px] px-1 font-mono text-zinc-400">
              {Math.round(zoomLevel * 100)}%
            </span>

            {/* Điều hướng trang ảnh khi có từ 2 trang trở lên */}
            {images.length > 1 && (
              <div className="flex items-center gap-1 pl-1.5 border-l border-zinc-700 ml-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-zinc-300 hover:text-white disabled:opacity-30"
                  onClick={() => setActiveImageIndex((i) => Math.max(0, i - 1))}
                  disabled={activeImageIndex === 0}
                  title="Trang trước"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-[11px] font-semibold text-emerald-400 whitespace-nowrap px-1">
                  Trang {activeImageIndex + 1}/{images.length}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-zinc-300 hover:text-white disabled:opacity-30"
                  onClick={() => setActiveImageIndex((i) => Math.min(images.length - 1, i + 1))}
                  disabled={activeImageIndex === images.length - 1}
                  title="Trang sau"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Image Canvas Container */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            {currentImageUrl && currentImageUrl !== "/sample-invoice.png" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentImageUrl}
                alt={`Ảnh hóa đơn gốc - Trang ${activeImageIndex + 1}`}
                style={{
                  transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                  transition: "transform 0.15s ease-out",
                }}
                className="max-w-full max-h-full object-contain rounded shadow-lg"
              />
            ) : (
              <div
                style={{
                  transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                  transition: "transform 0.15s ease-out",
                }}
                className="w-full max-w-md bg-white text-zinc-900 p-6 rounded-lg shadow-xl font-sans text-xs border border-zinc-200"
              >
                <div className="border-b pb-3 mb-3 text-center">
                  <h3 className="font-bold text-sm tracking-wide uppercase">
                    {reviewData.supplier_name_raw || "HÓA ĐƠN BÁN HÀNG"}
                  </h3>
                  <p className="text-[11px] text-zinc-500">Phiếu Xuất Kho & Bàn Giao Hàng Hóa</p>
                  <p className="text-[10px] text-zinc-400 mt-1">
                    Số HĐ: {reviewData.invoice_number || "HD-DEMO-001"} · Ngày: {reviewData.order_date}
                  </p>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-300 font-semibold">
                      <th className="py-1 text-center w-8 text-zinc-500">STT</th>
                      <th className="py-1">Mặt hàng</th>
                      <th className="py-1 text-center">SL</th>
                      <th className="py-1 text-right">Đơn giá</th>
                      <th className="py-1 text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewData.items.map((it, idx) => (
                      <tr key={idx} className="border-b border-zinc-100">
                        <td className="py-1.5 text-center text-zinc-400 font-mono">{idx + 1}</td>
                        <td className="py-1.5">{it.raw_name}</td>
                        <td className="py-1.5 text-center">
                          {it.quantity} {it.unit}
                        </td>
                        <td className="py-1.5 text-right">{formatNumber(it.unit_price)}</td>
                        <td className="py-1.5 text-right font-medium">
                          {formatNumber(it.line_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-4 pt-2 border-t text-right space-y-0.5">
                  <div className="flex justify-between font-bold text-sm text-emerald-700">
                    <span>Tổng tiền thanh toán:</span>
                    <span>{formatVND(reviewData.total_amount)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Thanh thumbnail chuyển trang nhanh (nếu nhiều hơn 1 ảnh) */}
          {images.length > 1 && (
            <div className="p-2 border-t border-zinc-800 bg-zinc-900/90 flex items-center justify-center gap-2 overflow-x-auto">
              {images.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveImageIndex(idx)}
                  className={`relative rounded border overflow-hidden transition-all flex items-center gap-1.5 px-2.5 py-1 text-xs cursor-pointer ${
                    activeImageIndex === idx
                      ? "border-emerald-500 bg-emerald-950/40 text-emerald-300 font-semibold shadow-xs"
                      : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <span
                    className={`size-2 rounded-full inline-block ${
                      activeImageIndex === idx ? "bg-emerald-400" : "bg-zinc-600"
                    }`}
                  />
                  <span>Trang {idx + 1}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Pre-filled Review & Approval Form (7 cols) */}
        <div className="lg:col-span-7 flex flex-col overflow-hidden bg-background">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {serverError && (
              <div className="p-3.5 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-2.5 font-medium shadow-sm">
                <AlertTriangle className="size-4 shrink-0 mt-0.5 text-destructive" />
                <div className="space-y-1">
                  <p className="font-semibold text-destructive">Lỗi kiểm tra dữ liệu:</p>
                  <p className="leading-relaxed whitespace-pre-wrap">{serverError}</p>
                </div>
              </div>
            )}

            {/* Thông báo các mặt hàng có nét gạch bút mực trên hóa đơn */}
            {excludedItems && excludedItems.length > 0 && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 space-y-2 text-xs text-rose-900 dark:text-rose-200 shadow-sm">
                <div className="flex items-start gap-2.5">
                  <FileX2 className="size-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-rose-950 dark:text-rose-100">
                      Hóa đơn có {excludedItems.length} mặt hàng có nét gạch bút mực ({excludedItems.join(", ")}):
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Các món này vẫn được trích xuất đầy đủ vào bảng bên dưới để bạn kiểm tra đối chiếu. Nếu thực tế không nhận món nào, bạn hãy nhấn biểu tượng <strong>Thùng rác</strong> trên dòng đó để xóa thủ công (hệ thống sẽ tự động trừ tiền tương ứng để khớp 100%).
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Supplier & Invoice Meta Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg border bg-muted/20">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="supplier_id" className="text-xs font-semibold">
                    Nhà cung cấp <span className="text-destructive">*</span>
                  </Label>
                  {reviewData.supplier_match_confidence === "exact" ? (
                    <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 gap-1">
                      <CheckCircle2 className="size-2.5" /> Khớp chính xác
                    </Badge>
                  ) : reviewData.supplier_match_confidence === "partial" ? (
                    <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 gap-1">
                      <HelpCircle className="size-2.5" /> Gợi ý khớp
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-[10px]">
                      Chưa khớp NCC
                    </Badge>
                  )}
                </div>

                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger id="supplier_id">
                    <SelectValue placeholder="-- Chọn nhà cung cấp --" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentSuppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} {s.code ? `(${s.code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {reviewData.supplier_name_raw && (
                  <div className="text-[11px] text-muted-foreground space-y-0.5 pt-0.5">
                    <p className="truncate">
                      Tên trên HĐ: <span className="font-medium text-foreground">{reviewData.supplier_name_raw}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px]">
                      {reviewData.raw_extracted?.supplier_tax_code && (
                        <span>MST: <strong className="text-foreground">{reviewData.raw_extracted.supplier_tax_code}</strong></span>
                      )}
                      {reviewData.raw_extracted?.supplier_phone && (
                        <span>SĐT: <strong className="text-foreground">{reviewData.raw_extracted.supplier_phone}</strong></span>
                      )}
                      {reviewData.raw_extracted?.supplier_address && (
                        <span className="truncate max-w-full">Đ/C: {reviewData.raw_extracted.supplier_address}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="invoice_number" className="text-xs font-semibold">
                  Số hóa đơn / Chứng từ
                </Label>
                <Input
                  id="invoice_number"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="Vd: HD-2026-001"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="order_date" className="text-xs font-semibold">
                  Ngày nhập hàng
                </Label>
                <Input
                  id="order_date"
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="note" className="text-xs font-semibold">
                  Ghi chú phiếu
                </Label>
                <Input
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ghi chú thêm..."
                />
              </div>
            </div>

            {/* Line Items Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Chi tiết nguyên liệu ({items.length} dòng)</h3>
                  <p className="text-xs text-muted-foreground">
                    Kiểm tra nguyên liệu trong kho được gán và hệ số quy đổi.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleAddItem} className="gap-1 text-xs">
                  <Plus className="size-3.5" />
                  Thêm dòng
                </Button>
              </div>

              <div className="border rounded-lg overflow-x-auto shadow-sm bg-card">
                <table className="min-w-[1080px] w-full text-xs text-left border-collapse">
                  <thead className="bg-muted/60 border-b">
                    <tr>
                      <th className="p-2.5 text-center w-[46px] min-w-[42px] text-muted-foreground font-semibold">
                        STT
                      </th>
                      <th className="p-2.5 w-[180px] min-w-[160px]">Tên trên hóa đơn</th>
                      <th className="p-2.5 w-[220px] min-w-[190px]">Nguyên liệu trong kho</th>
                      <th className="p-2.5 text-center w-[100px] min-w-[95px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-x border-emerald-500/20">
                        Số lượng
                      </th>
                      <th className="p-2.5 text-center w-[90px] min-w-[85px]">Đơn vị</th>
                      <th className="p-2.5 text-right w-[125px] min-w-[115px]">Đơn giá</th>
                      <th className="p-2.5 text-center w-[75px] min-w-[70px]" title="Hệ số quy đổi về đơn vị gốc của kho">
                        Hệ số
                      </th>
                      <th className="p-2.5 text-center w-[110px] min-w-[105px]" title="Thuế suất GTGT của từng mặt hàng theo hóa đơn">
                        Thuế VAT
                      </th>
                      <th className="p-2.5 text-right w-[130px] min-w-[120px]">Thành tiền</th>
                      <th className="p-2.5 w-[44px] min-w-[44px] text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item, idx) => {
                      const isMatched = Boolean(item.ingredient_id);
                      const isStruckItem = Boolean(
                        item.note?.toLowerCase().includes("gạch") ||
                        excludedItems.some((name) =>
                          item.raw_name?.toLowerCase().includes(name.toLowerCase()) ||
                          name.toLowerCase().includes(item.raw_name?.toLowerCase() || "")
                        )
                      );
                      return (
                        <tr
                          key={idx}
                          className={
                            isStruckItem
                              ? "bg-rose-500/10 dark:bg-rose-950/20"
                              : !isMatched
                              ? "bg-amber-500/10 dark:bg-amber-950/20"
                              : undefined
                          }
                        >
                          <td className="p-2 text-center w-[46px] min-w-[42px] font-mono text-xs font-semibold text-muted-foreground/80 select-none">
                            {idx + 1}
                          </td>
                          <td className="p-2 w-[180px] min-w-[160px]">
                            <Input
                              value={item.raw_name}
                              onChange={(e) => handleUpdateItem(idx, { raw_name: e.target.value })}
                              className={`h-8 text-xs font-medium ${isStruckItem ? "border-rose-300 dark:border-rose-800" : ""}`}
                            />
                            {isStruckItem && (
                              <div className="flex items-center gap-1 mt-1 text-[10px] text-rose-600 dark:text-rose-400 font-medium">
                                <FileX2 className="size-3 shrink-0" />
                                <span>Có nét gạch trên HĐ</span>
                              </div>
                            )}
                          </td>
                          <td className="p-2 w-[220px] min-w-[190px]">
                            <div className="space-y-1">
                              <IngredientPicker
                                ingredients={currentIngredients}
                                value={item.ingredient_id ?? ""}
                                onSelect={(ing) => handleSelectIngredient(idx, ing)}
                              />
                              {!isMatched && (
                                <div className="flex items-center justify-between gap-1 pt-0.5">
                                  <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                                    <AlertTriangle className="size-3 shrink-0" /> Chưa chọn NL
                                  </span>
                                  <button
                                    type="button"
                                    disabled={isCreatingIngredient === idx}
                                    onClick={() => void handleQuickCreateIngredient(idx)}
                                    className="text-[10px] text-emerald-600 hover:text-emerald-700 hover:underline font-medium whitespace-nowrap"
                                  >
                                    {isCreatingIngredient === idx ? "Đang tạo..." : "+ Tạo mới NL"}
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-2 w-[100px] min-w-[95px] text-center border-x border-emerald-500/15 bg-emerald-500/[0.03]">
                            <Input
                              type="number"
                              step="any"
                              value={item.quantity}
                              onChange={(e) =>
                                handleUpdateItem(idx, { quantity: Math.max(0, Number(e.target.value)) })
                              }
                              className="h-8 w-full min-w-[85px] text-xs font-bold text-center tabular-nums px-2 bg-background border-emerald-400 dark:border-emerald-600 focus-visible:ring-emerald-500 shadow-sm"
                            />
                          </td>
                          <td className="p-2 w-[90px] min-w-[85px] text-center">
                            <Input
                              value={item.unit}
                              onChange={(e) => handleUpdateItem(idx, { unit: e.target.value })}
                              className="h-8 w-full min-w-[75px] text-xs text-center px-1.5"
                            />
                          </td>
                          <td className="p-2 w-[125px] min-w-[115px] text-right">
                            <Input
                              type="number"
                              value={item.unit_price}
                              onChange={(e) =>
                                handleUpdateItem(idx, { unit_price: Math.max(0, Number(e.target.value)) })
                              }
                              className="h-8 w-full min-w-[115px] text-xs text-right tabular-nums px-2"
                            />
                          </td>
                          <td className="p-2 w-[75px] min-w-[70px] text-center">
                            <Input
                              type="number"
                              step="any"
                              value={item.conversion_factor}
                              onChange={(e) =>
                                handleUpdateItem(idx, {
                                  conversion_factor: Math.max(0.001, Number(e.target.value)),
                                })
                              }
                              className="h-8 w-full min-w-[65px] text-xs text-center tabular-nums px-1"
                              title="1 Đơn vị mua = ? Đơn vị cơ sở của kho"
                            />
                          </td>
                          <td className="p-2 w-[110px] min-w-[105px] text-center">
                            <div className="space-y-1 flex flex-col items-center">
                              <select
                                value={String(item.tax_rate ?? 0)}
                                onChange={(e) => handleItemTaxRateChange(idx, Number(e.target.value))}
                                className={`h-7 w-full text-xs rounded border px-1 font-medium transition-colors cursor-pointer ${
                                  (item.tax_rate ?? 0) > 0
                                    ? "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200 font-semibold focus:ring-amber-500"
                                    : "border-input bg-background text-muted-foreground focus:ring-primary"
                                }`}
                              >
                                <option value="0">KCT (0%)</option>
                                <option value="5">VAT 5%</option>
                                <option value="8">VAT 8%</option>
                                <option value="10">VAT 10%</option>
                              </select>
                              <div className="text-[10px] tabular-nums leading-tight">
                                {(item.tax_rate ?? 0) > 0 ? (
                                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                                    +{formatVND(Math.round((rawItems[idx]?.unit_price || item.unit_price) * item.quantity * ((item.tax_rate ?? 0) / 100)))}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/60">Không thuế</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-2 w-[130px] min-w-[120px] text-right font-semibold tabular-nums whitespace-nowrap">
                            <div>{formatVND(item.line_total)}</div>
                            {isVatAllocated && (
                              <div className="text-[10px] font-normal">
                                {(item.tax_rate ?? 0) > 0 ? (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                    Gồm VAT {item.tax_rate}%
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/70">Giá gốc KCT</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-2 w-[44px] min-w-[44px] text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className={`size-7 ${
                                isStruckItem
                                  ? "text-rose-600 hover:text-rose-700 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30"
                                  : "text-muted-foreground hover:text-destructive"
                              }`}
                              onClick={() => handleDeleteItem(idx)}
                              title={isStruckItem ? "Xóa món có nét gạch trên hóa đơn" : "Xóa dòng này"}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Reconciliation and Payment Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg border bg-muted/10">
              {/* Payment Allocation */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Thanh Toán Hóa Đơn
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="paid_now" className="text-xs">
                      Thanh toán ngay (VNĐ)
                    </Label>
                    <Input
                      id="paid_now"
                      type="number"
                      value={paidNow}
                      onChange={(e) => setPaidNow(Math.max(0, Number(e.target.value)))}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="paid_now" className="text-xs">
                        Thanh toán ngay (VNĐ)
                      </Label>
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setPaidNow(calculatedTotal)}
                          className="text-primary hover:underline font-medium"
                        >
                          Trả đủ (100%)
                        </button>
                        <span className="text-muted-foreground">•</span>
                        <button
                          type="button"
                          onClick={() => setPaidNow(0)}
                          className="text-muted-foreground hover:underline"
                        >
                          Ghi nợ
                        </button>
                      </div>
                    </div>
                    <Input
                      id="paid_now"
                      type="number"
                      value={paidNow}
                      onChange={(e) => setPaidNow(Math.max(0, Number(e.target.value)))}
                      className="h-9 text-xs font-medium"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="paid_method" className="text-xs">
                      Hình thức
                    </Label>
                    <Select
                      value={paidMethod}
                      onValueChange={(v) => setPaidMethod(v as PaymentMethod)}
                    >
                      <SelectTrigger id="paid_method" className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Tiền mặt</SelectItem>
                        <SelectItem value="bank_transfer">Chuyển khoản</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Số tiền còn lại sẽ được tính vào <strong>Công nợ nhà cung cấp</strong>.
                </p>
              </div>

              {/* Total Reconciliation & VAT Handling */}
              <div className="space-y-2.5 border-t md:border-t-0 md:border-l md:pl-4 pt-3 md:pt-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Receipt className="size-3.5 text-primary" />
                    Đối Chiếu Số Liệu & Thuế VAT
                  </h4>
                  {isVatAllocated ? (
                    <Badge variant="default" className="text-[10px] gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
                      <CheckCircle2 className="size-2.5" />
                      Đã phân bổ vào đơn giá
                    </Badge>
                  ) : taxAmount > 0 ? (
                    <Badge variant="secondary" className="text-[10px] gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
                      <Percent className="size-2.5" />
                      {taxPercent > 0 ? `VAT ${taxPercent}%` : `VAT +${formatVND(taxAmount)}`}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      Không VAT (0%)
                    </Badge>
                  )}
                </div>

                {/* VAT Quick Presets */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Mức thuế VAT:</span>
                    {vatPreset === "custom" ? (
                      <span className="text-[10px] text-primary font-medium">Tùy chỉnh số tiền</span>
                    ) : vatPreset === "items" ? (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Theo từng mặt hàng</span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-6 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={vatPreset === "items" ? "default" : "outline"}
                      onClick={() => handleSelectVatPreset("items")}
                      className={`h-7 text-[11px] px-1 ${vatPreset === "items" ? "bg-emerald-700 hover:bg-emerald-800 text-white font-semibold" : ""}`}
                      title="Tính thuế tự động theo từng món trong bảng"
                    >
                      Từng món
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={vatPreset === "0" ? "default" : "outline"}
                      onClick={() => handleSelectVatPreset("0")}
                      className={`h-7 text-xs px-1 ${vatPreset === "0" ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-black font-semibold" : ""}`}
                    >
                      0% (KCT)
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={vatPreset === "5" ? "default" : "outline"}
                      onClick={() => handleSelectVatPreset("5")}
                      className={`h-7 text-xs px-1 ${vatPreset === "5" ? "bg-primary text-primary-foreground font-semibold" : ""}`}
                    >
                      5%
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={vatPreset === "8" ? "default" : "outline"}
                      onClick={() => handleSelectVatPreset("8")}
                      className={`h-7 text-xs px-1 ${vatPreset === "8" ? "bg-primary text-primary-foreground font-semibold" : ""}`}
                    >
                      8%
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={vatPreset === "10" ? "default" : "outline"}
                      onClick={() => handleSelectVatPreset("10")}
                      className={`h-7 text-xs px-1 ${vatPreset === "10" ? "bg-primary text-primary-foreground font-semibold" : ""}`}
                    >
                      10%
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={vatPreset === "custom" ? "default" : "outline"}
                      onClick={() => handleSelectVatPreset("custom")}
                      className={`h-7 text-[10px] px-1 ${vatPreset === "custom" ? "bg-amber-600 hover:bg-amber-700 text-white font-semibold" : ""}`}
                    >
                      Tùy chỉnh
                    </Button>
                  </div>
                </div>

                {/* Custom tax input box */}
                {(vatPreset === "custom" || showCustomTaxInput) && (
                  <div className="grid grid-cols-2 gap-2 p-2 bg-muted/40 rounded border text-xs">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Tiền thuế VAT (VNĐ)</Label>
                      <Input
                        type="number"
                        value={taxAmount}
                        onChange={(e) => handleCustomTaxChange(Number(e.target.value))}
                        className="h-7 text-xs mt-0.5"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Tổng hóa đơn (VNĐ)</Label>
                      <Input
                        type="number"
                        value={targetInvoiceTotal}
                        onChange={(e) => handleTargetTotalChange(Number(e.target.value))}
                        className="h-7 text-xs mt-0.5 font-medium text-primary"
                      />
                    </div>
                  </div>
                )}

                {/* Detailed breakdown */}
                <div className="space-y-1 text-xs">
                  {nonTaxableItemsCount > 0 && taxableItemsCount > 0 ? (
                    <>
                      <div className="flex justify-between py-0.5 text-muted-foreground">
                        <span>Hàng không thuế (KCT - {nonTaxableItemsCount} món):</span>
                        <span className="font-medium text-foreground">{formatVND(nonTaxableSubtotal)}</span>
                      </div>
                      <div className="flex justify-between py-0.5 text-muted-foreground">
                        <span>Hàng chịu thuế ({taxableItemsCount} món):</span>
                        <span className="font-medium text-foreground">{formatVND(taxableSubtotal)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between py-0.5 text-muted-foreground">
                      <span>Tiền hàng (chưa thuế):</span>
                      <span className="font-medium text-foreground">{formatVND(baseSubtotal)}</span>
                    </div>
                  )}

                  <div className="flex justify-between py-0.5 text-muted-foreground">
                    <span>
                      Tiền thuế GTGT {vatPreset === "items" ? "(Theo từng món)" : taxPercent > 0 ? `(${taxPercent}%)` : "(VAT)"}:
                    </span>
                    <span className={`font-medium ${taxAmount > 0 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-foreground"}`}>
                      +{formatVND(taxAmount)}
                    </span>
                  </div>

                  <div className="flex justify-between py-1 border-t font-semibold">
                    <span>Tổng hóa đơn thanh toán:</span>
                    <span className="text-primary font-bold text-sm">{formatVND(targetInvoiceTotal)}</span>
                  </div>

                  <div className="flex justify-between py-0.5 text-muted-foreground">
                    <span>Tổng tính theo bảng kho:</span>
                    <span className={`font-bold ${isTotalMatched ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                      {formatVND(calculatedTotal)}
                    </span>
                  </div>
                </div>

                {/* VAT Allocation Controls */}
                {taxAmount > 0 && (
                  <div className="pt-1.5 border-t">
                    {!isVatAllocated ? (
                      <div className="p-2.5 rounded-md bg-amber-500/10 border border-amber-500/25 space-y-2">
                        <div className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                          {taxableItemsCount > 0 && nonTaxableItemsCount > 0 ? (
                            <>
                              Hóa đơn gồm <strong>{taxableItemsCount} món chịu thuế</strong> và <strong>{nonTaxableItemsCount} món không thuế (KCT)</strong>.
                              Bấm phân bổ để tính thuế VAT (+{formatVND(taxAmount)}) vào riêng các món chịu thuế, <strong>giữ nguyên đơn giá gốc</strong> các món không thuế!
                            </>
                          ) : (
                            <>
                              Đơn giá trong bảng đang là <strong>giá chưa VAT</strong> ({formatVND(calculatedTotal)}).
                              Tổng hóa đơn là <strong>{formatVND(targetInvoiceTotal)}</strong> (chênh lệch +{formatVND(taxAmount)} thuế VAT).
                            </>
                          )}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          onClick={() => applyVatAllocation(taxAmount, taxPercent)}
                          className="w-full h-7 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-sm"
                        >
                          <Percent className="size-3" />
                          {taxableItemsCount > 0 && nonTaxableItemsCount > 0
                            ? `Phân bổ thuế (+${formatVND(taxAmount)}) vào ${taxableItemsCount} món chịu thuế`
                            : `Phân bổ thuế (+${formatVND(taxAmount)}) vào đơn giá hàng`}
                        </Button>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="size-4 shrink-0" />
                          <span>
                            {taxableItemsCount > 0 && nonTaxableItemsCount > 0
                              ? `Đã phân bổ VAT vào ${taxableItemsCount} món chịu thuế`
                              : "Đã phân bổ VAT vào đơn giá hàng"}
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={handleRevertVat}
                          className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
                        >
                          <Undo2 className="size-3" />
                          Khôi phục giá chưa thuế
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Match Status indicator */}
                <div className="pt-1">
                  {isTotalMatched ? (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="size-4 shrink-0" />
                      <span>Số tiền khớp hoàn toàn với hóa đơn ({formatVND(targetInvoiceTotal)})</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-amber-700 dark:text-amber-300 font-medium bg-amber-500/10 border border-amber-500/30 px-2.5 py-1.5 rounded-lg">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span>Lệch {formatVND(Math.abs(effectivePayableTotal - targetInvoiceTotal))} so với hóa đơn</span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleAutoReconcileTotal}
                        className="h-6 text-[11px] px-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-200 border-amber-500/40 gap-1 font-semibold shadow-none"
                      >
                        <Sparkles className="size-3 text-amber-600 dark:text-amber-400" />
                        Khớp nhanh theo hàng thực nhận
                      </Button>
                    </div>
                  )}

                  {hasUnmatchedItems && (
                    <div className="flex items-center gap-1.5 text-[11px] text-sky-600 dark:text-sky-400 mt-1">
                      <Sparkles className="size-3.5 shrink-0" />
                      Có nguyên liệu chưa có trong danh mục — Sẽ được tự động thêm vào kho khi duyệt!
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t bg-muted/30">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Hủy / Đóng
            </Button>

            <div className="flex items-center gap-2">
              <SubmitButton
                size="sm"
                pending={isSubmitting}
                pendingText="Đang lưu phiếu..."
                disabled={items.length === 0 || !supplierId}
                onClick={() => void handleApproveAndCreate()}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="size-4" />
                Duyệt & Tạo Phiếu Nhập ({formatVND(calculatedTotal)})
              </SubmitButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
