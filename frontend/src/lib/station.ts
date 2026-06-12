const TOKEN_KEY = "werqr_device_token";
const WORKSTATION_KEY = "werqr_device_id";
const CLIENT_ID_KEY = "werqr_client_id";

export function getOrCreateClientId(): string {
  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

export function clientHeaders(): Record<string, string> {
  return { "X-Client-Id": getOrCreateClientId() };
}

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

export function clearStation(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(WORKSTATION_KEY);
}

export async function restoreDeviceSession(): Promise<string | null> {
  const response = await fetch("/api/devices/me", {
    headers: {
      Accept: "application/json",
      ...stationHeaders(),
      ...clientHeaders(),
    },
    credentials: "same-origin",
  });

  if (response.ok) {
    const payload = (await response.json()) as {
      device_id?: string;
      device_token?: string;
    };
    if (payload.device_id && payload.device_token) {
      saveStation(payload.device_id, payload.device_token);
      return payload.device_id;
    }
  }

  if (response.status === 401) {
    clearStation();
  }

  return null;
}

export async function fetchSuggestedDeviceName(): Promise<{
  device_id: string | null;
  device_token?: string | null;
  restored: boolean;
}> {
  const response = await fetch("/api/devices/suggest", {
    headers: {
      Accept: "application/json",
      ...stationHeaders(),
      ...clientHeaders(),
    },
    credentials: "same-origin",
  });
  if (!response.ok) {
    return { device_id: null, restored: false };
  }
  const payload = (await response.json()) as {
    device_id?: string | null;
    device_token?: string | null;
    restored?: boolean;
  };
  return {
    device_id: payload.device_id ?? null,
    device_token: payload.device_token ?? null,
    restored: Boolean(payload.restored),
  };
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
): Promise<{
  device_id: string;
  device_token: string;
  reconnected?: boolean;
  requested_name?: string;
}> {
  const response = await fetch("/api/devices/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...stationHeaders(),
      ...clientHeaders(),
    },
    credentials: "same-origin",
    body: JSON.stringify({
      device_id: workstationId,
      client_id: getOrCreateClientId(),
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        error?: string;
        device_id?: string;
        device_token?: string;
        reconnected?: boolean;
        requested_name?: string;
      }
    | null;
  if (!response.ok || !payload?.device_token || !payload.device_id) {
    throw new Error(payload?.error ?? "Could not register device.");
  }
  saveStation(payload.device_id, payload.device_token);
  return {
    device_id: payload.device_id,
    device_token: payload.device_token,
    reconnected: payload.reconnected,
    requested_name: payload.requested_name,
  };
}
