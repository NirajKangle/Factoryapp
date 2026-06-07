import React from "react";
import { QrCode } from "lucide-react";

import { AppMenu, APP_MENU_ITEMS, type AppMenuAction } from "@/components/ui/app-menu";
import { DeviceMenu } from "@/components/ui/device-menu";
import { MobileMenu, useScroll } from "@/components/ui/header-3";
import { Button } from "@/components/ui/button";
import { MenuToggleIcon } from "@/components/ui/menu-toggle-icon";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { WerqrLogo } from "@/components/ui/werqr-logo";
import { cn } from "@/lib/utils";

export interface WerqrHeaderProps {
  jobCount: number;
  workstationId: string | null;
  onMenuAction: (action: AppMenuAction) => void;
}

export function WerqrHeader({
  jobCount,
  workstationId,
  onMenuAction,
}: WerqrHeaderProps) {
  const [open, setOpen] = React.useState(false);
  const scrolled = useScroll(10);

  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function handleMenuSelect(action: AppMenuAction) {
    onMenuAction(action);
    setOpen(false);
  }

  return (
    <header
      className={cn("sticky top-0 z-50 w-full border-b border-transparent", {
        "border-border bg-background/95 backdrop-blur-lg supports-[backdrop-filter]:bg-background/50":
          scrolled,
      })}
    >
      <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-4">
          <a href="/" className="flex min-w-0 items-center gap-2.5 rounded-md p-1 hover:bg-accent">
            <WerqrLogo />
            <span className="truncate text-2xl font-bold tracking-tight text-foreground">
              Werqr
            </span>
          </a>

          <a
            href="/scan"
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted/60 md:hidden"
          >
            <QrCode className="h-3.5 w-3.5" />
            Scan
          </a>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Status status="online">
            <StatusIndicator />
            <StatusLabel>Live</StatusLabel>
          </Status>
          <span className="text-sm text-muted-foreground">
            {jobCount} job{jobCount === 1 ? "" : "s"}
          </span>
          {workstationId && <DeviceMenu currentDeviceId={workstationId} />}
          <AppMenu onAction={onMenuAction} />
          <ThemeToggle />
        </div>

        <div className="flex shrink-0 items-center gap-2 md:hidden">
          {workstationId && (
            <DeviceMenu currentDeviceId={workstationId} mobile />
          )}
          <Button
            size="icon"
            variant="outline"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="werqr-mobile-menu"
            aria-label="Toggle menu"
            className="h-8 w-8"
          >
            <MenuToggleIcon open={open} className="size-5" duration={300} />
          </Button>
        </div>
      </nav>

      <MobileMenu
        open={open}
        id="werqr-mobile-menu"
        className="flex flex-col gap-4 overflow-y-auto"
      >
        <div className="flex flex-col gap-1">
          {APP_MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleMenuSelect(item.id)}
              className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-accent"
            >
              <item.icon className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between px-1">
            <Status status="online">
              <StatusIndicator />
              <StatusLabel>Live</StatusLabel>
            </Status>
            <span className="text-sm text-muted-foreground">
              {jobCount} job{jobCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="px-1">
            <ThemeToggle />
          </div>
        </div>
      </MobileMenu>
    </header>
  );
}

export default WerqrHeader;
