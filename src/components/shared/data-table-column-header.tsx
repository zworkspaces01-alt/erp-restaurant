"use client";

import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface DataTableColumnHeaderProps<TData, TValue> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
  /** Right-align numeric columns. */
  align?: "left" | "right" | "center";
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  align = "left",
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return (
      <div className={cn(align === "right" && "text-right", align === "center" && "text-center", className)}>
        {title}
      </div>
    );
  }
  const sorted = column.getIsSorted();
  return (
    <div className={cn("flex items-center", align === "right" && "justify-end", align === "center" && "justify-center", className)}>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 h-7 gap-1 px-2 data-[state=open]:bg-accent"
        onClick={() => column.toggleSorting(sorted === "asc")}
      >
        <span>{title}</span>
        {sorted === "desc" ? (
          <ArrowDown className="size-3.5" />
        ) : sorted === "asc" ? (
          <ArrowUp className="size-3.5" />
        ) : (
          <ArrowUpDown className="size-3.5 opacity-50" />
        )}
      </Button>
    </div>
  );
}
