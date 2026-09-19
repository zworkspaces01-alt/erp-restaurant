"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Merge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SupplierFormDialog, type SupplierFormData } from "./supplier-form-dialog";
import { SupplierDeleteDialog, type SupplierDeleteData } from "./supplier-delete-dialog";
import { SupplierMergeDialog } from "./supplier-merge-dialog";
import type { SupplierDebtRow } from "@/lib/queries/purchases.queries";

interface SupplierDetailActionsProps {
  supplier: SupplierFormData;
  debtInfo: {
    current_debt: number;
    po_count: number;
  };
  allSuppliers: SupplierDebtRow[];
}

export function SupplierDetailActions({
  supplier,
  debtInfo,
  allSuppliers,
}: SupplierDetailActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  const deleteData: SupplierDeleteData = {
    id: supplier.id,
    name: supplier.name,
    code: supplier.code,
    current_debt: debtInfo.current_debt,
    po_count: debtInfo.po_count,
    is_active: supplier.is_active,
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="mr-1.5 size-4" />
          Sửa thông tin
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="text-primary border-primary/25 bg-primary/5 hover:bg-primary/10"
          onClick={() => setMergeOpen(true)}
        >
          <Merge className="mr-1.5 size-4" />
          Gộp NCC này...
        </Button>

        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <SupplierFormDialog open={editOpen} onOpenChange={setEditOpen} supplier={supplier} />
      <SupplierDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        supplier={deleteData}
        onSuccess={() => router.push("/suppliers")}
      />
      <SupplierMergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        suppliers={allSuppliers}
        preselectedSourceId={supplier.id}
        onSuccess={() => router.push("/suppliers")}
      />
    </>
  );
}
