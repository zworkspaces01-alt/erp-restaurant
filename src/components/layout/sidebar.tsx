"use client";

import Link from "next/link";
import { ChefHat, ChevronLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { useSidebar } from "@/components/layout/sidebar-provider";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/restaurant";

export function SidebarBrand({ isCollapsed }: { isCollapsed: boolean }) {
  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/dashboard"
            className="flex size-14 items-center justify-center transition-transform hover:scale-105"
            aria-label="Restaurant ERP"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
              <ChefHat className="size-5" />
            </span>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={12}>
          <p className="font-semibold text-xs">Restaurant ERP</p>
          <p className="text-[11px] text-muted-foreground">Quản trị F&B</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-4 py-4 transition-opacity hover:opacity-90">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
        <ChefHat className="size-4" />
      </span>
      <span className="flex flex-col leading-tight min-w-0">
        <span className="text-sm font-semibold truncate">Restaurant ERP</span>
        <span className="text-[11px] text-muted-foreground truncate">Quản trị F&amp;B</span>
      </span>
    </Link>
  );
}

interface SidebarProps {
  role?: UserRole | null;
}

/** Desktop sidebar (hidden on small screens, collapsible on desktop). */
export function Sidebar({ role }: SidebarProps) {
  const { isCollapsed, toggleSidebar } = useSidebar();

  return (
    <aside
      data-collapsed={isCollapsed}
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-in-out lg:flex",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Brand Header & Toggle */}
      <div
        className={cn(
          "flex items-center border-b border-sidebar-border/40",
          isCollapsed ? "justify-center h-14" : "justify-between pr-2"
        )}
      >
        <SidebarBrand isCollapsed={isCollapsed} />
        {!isCollapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="size-7 text-muted-foreground hover:text-foreground"
                aria-label="Thu nhỏ thanh bên"
              >
                <PanelLeftClose className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              Thu nhỏ thanh bên (⌘B)
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Main Navigation Scroll Area */}
      <ScrollArea className="flex-1">
        <SidebarNav role={role} isCollapsed={isCollapsed} />
      </ScrollArea>

      {/* Footer Collapse Button */}
      <div className={cn("border-t border-sidebar-border/40 p-2", isCollapsed ? "flex justify-center" : "")}>
        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="size-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                aria-label="Mở rộng thanh bên"
              >
                <PanelLeftOpen className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12}>
              Mở rộng thanh bên (⌘B)
            </TooltipContent>
          </Tooltip>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className="w-full justify-between px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
          >
            <span className="flex items-center gap-2">
              <ChevronLeft className="size-4" />
              <span>Thu nhỏ thanh bên</span>
            </span>
            <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              ⌘B
            </kbd>
          </Button>
        )}
      </div>
    </aside>
  );
}
