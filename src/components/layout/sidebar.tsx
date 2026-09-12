import Link from "next/link";
import { ChefHat } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarNav } from "@/components/layout/sidebar-nav";

export function SidebarBrand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-4 py-4">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <ChefHat className="size-4" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold">Restaurant ERP</span>
        <span className="text-[11px] text-muted-foreground">Quản trị F&amp;B</span>
      </span>
    </Link>
  );
}

/** Desktop sidebar (hidden on small screens). */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <SidebarBrand />
      <ScrollArea className="flex-1">
        <SidebarNav />
      </ScrollArea>
    </aside>
  );
}
