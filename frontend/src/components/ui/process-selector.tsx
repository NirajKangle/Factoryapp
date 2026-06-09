import { useEffect, useRef, useState } from "react";
import { ChevronDown, Workflow } from "lucide-react";

import type { ProcessRecord } from "@/lib/processes";
import { cn } from "@/lib/utils";

export interface ProcessSelectorProps {
  processes: ProcessRecord[];
  selectedProcessId: number | null;
  onSelect: (processId: number) => void;
}

export function ProcessSelector({
  processes,
  selectedProcessId,
  onSelect,
}: ProcessSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = processes.find((entry) => entry.process_id === selectedProcessId);

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

  if (processes.length === 0) {
    return null;
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex max-w-[12rem] items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 sm:max-w-[14rem]"
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Workflow className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{selected?.name ?? "Select process"}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      <div
        role="listbox"
        className={cn(
          "absolute left-0 z-50 mt-2 min-w-[12rem] origin-top-left overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg transition-all duration-200",
          open
            ? "pointer-events-auto scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0"
        )}
      >
        {processes.map((process) => (
          <button
            key={process.process_id}
            type="button"
            role="option"
            aria-selected={process.process_id === selectedProcessId}
            onClick={() => {
              onSelect(process.process_id);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent",
              process.process_id === selectedProcessId
                ? "font-semibold text-foreground"
                : "text-muted-foreground"
            )}
          >
            {process.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default ProcessSelector;
