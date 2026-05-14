import { Platform } from "react-native";

function resolveApiUrl() {
  const raw = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

  // On Android emulator, localhost points to the emulator itself.
  // 10.0.2.2 routes to the host machine.
  if (Platform.OS === "android" && raw.includes("localhost")) {
    return raw.replace("localhost", "10.0.2.2");
  }

  return raw;
}

const API_URL = resolveApiUrl();
const ALERT_LOCATION_UPDATE_TIMEOUT_MS = 12_000;

let token: string | null = null;

export function setToken(t: string | null) {
  token = t;
}

type RequestOptions = RequestInit & {
  timeoutMs?: number;
};

async function req(path: string, opts: RequestOptions = {}) {
  const { timeoutMs, signal, ...fetchOptions } = opts;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as any),
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  const controller =
    timeoutMs && typeof AbortController !== "undefined"
      ? new AbortController()
      : null;

  const abortFromSignal = () => {
    controller?.abort();
  };

  if (controller && signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", abortFromSignal, { once: true });
    }
  }

  const timeoutId =
    controller && timeoutMs
      ? setTimeout(() => {
          controller.abort();
        }, timeoutMs)
      : null;

  let res: Response;

  try {
    res = await fetch(`${API_URL}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller?.signal ?? signal,
    });
  } catch (error) {
    if (controller?.signal.aborted && timeoutMs) {
      throw new Error("Request timed out");
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (controller && signal) {
      signal.removeEventListener("abort", abortFromSignal);
    }
  }

  const text = await res.text();

  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) throw new Error(data?.detail || `Request failed (${res.status})`);
  return data;
}

export const api = {
  auth: {
    register: (email: string, password: string, name: string) =>
      req("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, name }),
      }),
    login: async (email: string, password: string) => {
      const params = new URLSearchParams({ email, password });
      const res = await fetch(`${API_URL}/auth/login?${params.toString()}`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || "Login failed");
      return data as { access_token: string; token_type: string };
    },
    deleteAccount: () => req("/auth/me", { method: "DELETE" }),
  },
  contacts: {
    list: () => req("/contacts/"),
    create: (name: string, phone: string, is_emergency: boolean) =>
      req("/contacts/", {
        method: "POST",
        body: JSON.stringify({ name, phone, is_emergency }),
      }),
    remove: (id: number) => req(`/contacts/${id}`, { method: "DELETE" }),
  },
  alerts: {
    list: () => req("/alerts/"),
    create: (lat?: number, lng?: number) =>
      req("/alerts/", { method: "POST", body: JSON.stringify({ lat, lng }) }),
    deleteHistory: () => req("/alerts/history", { method: "DELETE" }),
    listNotifications: (id: number) => req(`/alerts/${id}/notifications`),
    updateLocation: (id: number, lat: number, lng: number) =>
      req(`/alerts/${id}/location`, {
        method: "POST",
        body: JSON.stringify({ lat, lng }),
        timeoutMs: ALERT_LOCATION_UPDATE_TIMEOUT_MS,
      }),
    resolve: (id: number) => req(`/alerts/${id}/resolve`, { method: "POST" }),
    createWatcherToken: (id: number) =>
      req(`/alerts/${id}/watcher-token`, { method: "POST" }),
  },
  watcher: {
    get: (token: string) => req(`/alerts/watcher/${encodeURIComponent(token)}`),
    subscribePush: (token: string, expoPushToken: string) =>
      req(`/alerts/watcher/${encodeURIComponent(token)}/push-subscription`, {
        method: "POST",
        body: JSON.stringify({ expo_push_token: expoPushToken }),
      }),
    unsubscribePush: (token: string) =>
      req(`/alerts/watcher/${encodeURIComponent(token)}/push-subscription`, {
        method: "DELETE",
      }),
  },
};
