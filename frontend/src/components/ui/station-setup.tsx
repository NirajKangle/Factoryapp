import { useEffect, useState } from "react";

import {
  fetchSuggestedDeviceName,
  getWorkstationId,
  registerWorkstation,
  restoreDeviceSession,
  saveStation,
} from "@/lib/station";

export interface StationSetupProps {
  onReady: (workstationId: string) => void;
}

export function StationSetup({ onReady }: StationSetupProps) {
  const [workstationId, setWorkstationId] = useState(getWorkstationId() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const restored = await restoreDeviceSession();
      if (restored) {
        onReady(restored);
        return;
      }

      const suggestion = await fetchSuggestedDeviceName();
      if (suggestion.restored && suggestion.device_id && suggestion.device_token) {
        saveStation(suggestion.device_id, suggestion.device_token);
        onReady(suggestion.device_id);
        return;
      }
      if (suggestion.device_id) {
        setWorkstationId(suggestion.device_id);
        setHint(
          `This PC was registered before as "${suggestion.device_id}". Register with that same name to reconnect.`
        );
      }
    })();
  }, [onReady]);

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    const id = workstationId.trim();
    if (!id) return;

    setBusy(true);
    setError(null);
    try {
      const result = await registerWorkstation(id);
      if (result.reconnected && result.requested_name) {
        setHint(
          `This PC is already registered as "${result.device_id}". Reconnected using your existing device — no duplicate was created.`
        );
      }
      onReady(result.device_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-4">
      <h2 className="text-sm font-semibold text-foreground">Register this PC</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        One-time setup for dragging jobs on this office computer (e.g. Office-PC).
        Workers register phones on the floor scan page instead. The app remembers
        this PC via a secure browser cookie.
      </p>
      {hint ? <p className="mt-2 text-sm text-muted-foreground">{hint}</p> : null}
      <form onSubmit={handleRegister} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Workstation ID</span>
          <input
            type="text"
            value={workstationId}
            onChange={(e) => setWorkstationId(e.target.value)}
            placeholder="Office-PC"
            required
            className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Saving…" : "Register terminal"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
