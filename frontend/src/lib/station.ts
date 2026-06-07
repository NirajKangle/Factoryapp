const TOKEN_KEY = "werqr_device_token";
const WORKSTATION_KEY = "werqr_device_id";

export function getDeviceToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getWorkstationId(): string | null {
  return localStorage.getItem(WORKSTATION_KEY);
}

export function saveStation(workstationId: string, deviceToken: string): void {
  localStorage.setItem(TOKEN_KEY, deviceToken);
  localStorage.setItem(WORKSTATION_KEY, workstationId);
}

export function stationHeaders(): Record<string, string> {
  const token = getDeviceToken();
  return token ? { "X-Device-Token": token } : {};
}

export function isMobileBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return (
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && window.innerWidth < 1024)
  );
}

export interface DeviceSummary {
  device_id: string;
  created_at: string;
}

export async function fetchDevices(): Promise<DeviceSummary[]> {
  const response = await fetch("/api/devices", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Could not load devices.");
  }
  return response.json();
}

export async function registerWorkstation(
  workstationId: string
): Promise<{ device_id: string; device_token: string }> {
  const response = await fetch("/api/devices/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ device_id: workstationId }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { error?: string; device_id?: string; device_token?: string }
    | null;
  if (!response.ok || !payload?.device_token || !payload.device_id) {
    throw new Error(payload?.error ?? "Could not register device.");
  }
  saveStation(payload.device_id, payload.device_token);
  return {
    device_id: payload.device_id,
    device_token: payload.device_token,
  };
}
