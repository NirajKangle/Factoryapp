import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Menu,
  Settings,
  Users,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AppMenuAction = "team-members" | "reports" | "settings" | "tools";

export const APP_MENU_ITEMS: { id: AppMenuAction; label: string; icon: LucideIcon }[] = [
  { id: "team-members", label: "Team Members", icon: Users },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "tools", label: "Tools", icon: Wrench },
];

export interface AppMenuProps {
  onAction: (action: AppMenuAction) => void;
}

export function AppMenu({ onAction }: AppMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function handleSelect(action: AppMenuAction) {
    onAction(action);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        size="icon"
        variant="outline"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Open menu"
        className="h-8 w-8"
      >
        <Menu className="h-4 w-4" />
      </Button>

      <div
        role="menu"
        aria-label="App menu"
        className={cn(
          "absolute right-0 z-50 mt-2 min-w-[200px] origin-top-right overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg transition-all duration-200 ease-out",
          open
            ? "pointer-events-auto scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0"
        )}
      >
        {APP_MENU_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            onClick={() => handleSelect(item.id)}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-accent"
          >
            <item.icon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default AppMenu;
