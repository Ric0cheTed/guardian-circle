const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

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
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) throw new Error(data?.detail || `Request failed (${res.status})`);
  return data;
}

export const api = {
  auth: {
    register: (email: string, password: string, name: string) =>
      req("/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) }),
    login: (email: string, password: string) => {
      const form = new URLSearchParams({ email, password });
      return fetch(`${API_URL}/auth/login?${form.toString()}`, { method: "POST" })
        .then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d?.detail || "Login failed");
          return d;
        });
    },
  },
  contacts: {
    list: () => req("/contacts/"),
    create: (name: string, phone: string, is_emergency: boolean) =>
      req("/contacts/", { method: "POST", body: JSON.stringify({ name, phone, is_emergency }) }),
    remove: (id: number) => req(`/contacts/${id}`, { method: "DELETE" }),
  },
  alerts: {
    list: () => req("/alerts/"),
    create: (lat?: number, lng?: number) =>
      req("/alerts/", { method: "POST", body: JSON.stringify({ lat, lng }) }),
    updateLocation: (id: number, lat: number, lng: number) =>
      req(`/alerts/${id}/location`, { method: "POST", body: JSON.stringify({ lat, lng }) }),
    resolve: (id: number) => req(`/alerts/${id}/resolve`, { method: "POST" }),
  },
};
