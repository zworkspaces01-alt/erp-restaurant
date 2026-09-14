"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SupplierFormDialog, type SupplierFormData } from "./supplier-form-dialog";

export function SupplierEditButton({ supplier }: { supplier: SupplierFormData }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="mr-1.5 size-4" />
        Sửa thông tin
      </Button>
      <SupplierFormDialog open={open} onOpenChange={setOpen} supplier={supplier} />
    </>
  );
}
