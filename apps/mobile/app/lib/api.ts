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

let token: string | null = null;

export function setToken(t: string | null) {
  token = t;
}

async function req(path: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as any),
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
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
    updateLocation: (id: number, lat: number, lng: number) =>
      req(`/alerts/${id}/location`, {
        method: "POST",
        body: JSON.stringify({ lat, lng }),
      }),
    resolve: (id: number) => req(`/alerts/${id}/resolve`, { method: "POST" }),
  },
};
