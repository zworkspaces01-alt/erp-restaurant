"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatNumber } from "@/lib/format";
import type { IngredientPickRow } from "@/lib/queries/purchases.queries";

interface IngredientPickerProps {
  ingredients: IngredientPickRow[];
  value: string;
  onSelect: (ingredient: IngredientPickRow) => void;
  disabledIds?: string[];
  id?: string;
}

export function IngredientPicker({
  ingredients,
  value,
  onSelect,
  disabledIds = [],
  id,
}: IngredientPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = ingredients.find((i) => i.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : "Chọn nguyên liệu"}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Tìm nguyên liệu..." />
          <CommandList>
            <CommandEmpty>Không tìm thấy nguyên liệu.</CommandEmpty>
            <CommandGroup>
              {ingredients.map((ing) => (
                <CommandItem
                  key={ing.id}
                  value={`${ing.name} ${ing.code ?? ""}`}
                  disabled={disabledIds.includes(ing.id) && ing.id !== value}
                  onSelect={() => {
                    onSelect(ing);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 size-4", ing.id === value ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{ing.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      Tồn {formatNumber(ing.current_stock, 2)} {ing.base_unit}
                      {ing.import_unit ? ` · ĐV nhập: ${ing.import_unit}` : ""}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
