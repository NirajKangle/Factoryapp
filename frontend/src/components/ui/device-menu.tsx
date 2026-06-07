import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import {
  fetchDevices,
  registerWorkstation,
  type DeviceSummary,
} from "@/lib/station";
import { cn } from "@/lib/utils";

export interface DeviceMenuProps {
  currentDeviceId: string;
  onSwitch: (deviceId: string) => void;
}

export function DeviceMenu({ currentDeviceId, onSwitch }: DeviceMenuProps) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    setError(null);
    void fetchDevices()
      .then(setDevices)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load devices.");
      })
      .finally(() => setLoading(false));
  }, [open]);

  async function handleSelect(deviceId: string) {
    if (deviceId === currentDeviceId || switching) {
      setOpen(false);
      return;
    }

    setSwitching(deviceId);
    setError(null);
    try {
      const result = await registerWorkstation(deviceId);
      onSwitch(result.device_id);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch device.");
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-sm font-semibold text-foreground transition-colors hover:bg-muted/60"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span aria-hidden="true">💻</span>
        {currentDeviceId}
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Registered devices"
          className="absolute right-0 z-50 mt-2 min-w-[220px] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg"
        >
          <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Devices
          </p>
          {loading ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Loading…</p>
          ) : devices.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No devices registered yet.</p>
          ) : (
            devices.map((device) => {
              const isCurrent = device.device_id === currentDeviceId;
              const busy = switching === device.device_id;

              return (
                <button
                  key={device.device_id}
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  disabled={Boolean(switching)}
                  onClick={() => void handleSelect(device.device_id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    isCurrent ? "bg-primary/10 text-foreground" : "text-foreground hover:bg-muted/50",
                    switching && !busy && "opacity-50"
                  )}
                >
                  <span className="w-4 shrink-0">
                    {isCurrent ? <Check className="h-4 w-4 text-primary" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{device.device_id}</span>
                  {busy ? (
                    <span className="text-xs text-muted-foreground">Switching…</span>
                  ) : null}
                </button>
              );
            })
          )}
          {error ? (
            <p className="border-t border-border px-3 py-2 text-xs text-destructive">{error}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default DeviceMenu;
