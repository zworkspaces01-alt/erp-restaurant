"use client";

import * as React from "react";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSidebar } from "@/components/layout/sidebar-provider";
import { cn } from "@/lib/utils";

interface SidebarTriggerProps extends React.ComponentProps<typeof Button> {
  className?: string;
}

export function SidebarTrigger({ className, ...props }: SidebarTriggerProps) {
  const { isCollapsed, toggleSidebar } = useSidebar();

  const label = isCollapsed ? "Mở rộng thanh bên (⌘B)" : "Thu nhỏ thanh bên (⌘B)";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-label={label}
          className={cn("size-8 text-muted-foreground hover:text-foreground", className)}
          {...props}
        >
          <PanelLeft className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
