import { useState } from "react";

import { getWorkstationId, registerWorkstation } from "@/lib/station";

export interface StationSetupProps {
  onReady: (workstationId: string) => void;
}

export function StationSetup({ onReady }: StationSetupProps) {
  const [workstationId, setWorkstationId] = useState(getWorkstationId() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    const id = workstationId.trim();
    if (!id) return;

    setBusy(true);
    setError(null);
    try {
      const result = await registerWorkstation(id);
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
        Workers register phones on the floor scan page instead.
      </p>
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
