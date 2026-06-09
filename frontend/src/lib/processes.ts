import type { ProcessStage } from "@/lib/job-status";

export interface ProcessRecord {
  process_id: number;
  name: string;
  created_at?: string;
  modified_at?: string | null;
  statuses: ProcessStage[];
}

export async function fetchProcesses(): Promise<ProcessRecord[]> {
  const response = await fetch("/api/processes", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Could not load processes.");
  }
  return response.json();
}

export async function fetchProcess(processId: number): Promise<ProcessRecord> {
  const response = await fetch(`/api/processes/${processId}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Could not load process.");
  }
  return response.json();
}

export async function createProcess(
  name: string,
  statuses?: ProcessStage[]
): Promise<ProcessRecord> {
  const response = await fetch("/api/processes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ name, statuses }),
  });
  const payload = (await response.json().catch(() => null)) as
    | ProcessRecord
    | { error?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      payload && "error" in payload ? payload.error : "Could not create process."
    );
  }
  return payload as ProcessRecord;
}

export async function updateProcess(
  processId: number,
  data: { name?: string; statuses?: ProcessStage[] }
): Promise<ProcessRecord> {
  const response = await fetch(`/api/processes/${processId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(data),
  });
  const payload = (await response.json().catch(() => null)) as
    | ProcessRecord
    | { error?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      payload && "error" in payload ? payload.error : "Could not update process."
    );
  }
  return payload as ProcessRecord;
}

export async function deleteProcess(processId: number): Promise<void> {
  const response = await fetch(`/api/processes/${processId}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Could not delete process.");
  }
}

export function sortProcesses(processes: ProcessRecord[]): ProcessRecord[] {
  return [...processes].sort((a, b) => a.name.localeCompare(b.name));
}
