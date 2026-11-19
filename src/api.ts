// Data access for the SQL-backed API served by server/index.ts.
// Replaces the direct Firestore calls the app used before.
import { auth } from "./firebase";
import { Device, StaffMember, Subscription } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const MAX_ATTEMPTS = 12;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`/api/${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return res.status === 204 ? (undefined as T) : res.json();

    // 503 = server is doing its one-time data import; wait and retry.
    if (res.status === 503 && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      const seconds = Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 5, 10);
      await sleep(seconds * 1000);
      continue;
    }

    let message = `${method} /api/${path} failed with ${res.status}`;
    try {
      const err = await res.json();
      if (err?.error) message += `: ${err.error}`;
    } catch {}
    console.error("API error:", message);
    throw new ApiError(message, res.status);
  }
}

const enc = encodeURIComponent;
// Same as before: strip undefined values so the stored record has no undefined keys.
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// 1. Devices
export const fetchDevices = () => request<Device[]>("GET", "devices");
export const saveDevice = (device: Device) => request<void>("PUT", `devices/${enc(device.id)}`, clean(device));
export const deleteDevice = (id: string) => request<void>("DELETE", `devices/${enc(id)}`);

// 2. Staff members
export const fetchStaff = () => request<StaffMember[]>("GET", "staff");
export const saveStaff = (staff: StaffMember) => request<void>("PUT", `staff/${enc(staff.id)}`, clean(staff));
export const deleteStaff = (id: string) => request<void>("DELETE", `staff/${enc(id)}`);

// 3. Categories (the app works with names; records are { id, name })
export const fetchCategories = async () =>
  (await request<{ id: string; name?: string }[]>("GET", "categories")).map((c) => c.name).filter((n): n is string => !!n);
export const saveCategory = (id: string, name: string) => request<void>("PUT", `categories/${enc(id)}`, { id, name });
export const deleteCategory = (id: string) => request<void>("DELETE", `categories/${enc(id)}`);

// 4. Departments
export const fetchDepartments = async () =>
  (await request<{ id: string; name?: string }[]>("GET", "departments")).map((d) => d.name).filter((n): n is string => !!n);
export const saveDepartment = (id: string, name: string) => request<void>("PUT", `departments/${enc(id)}`, { id, name });
export const deleteDepartment = (id: string) => request<void>("DELETE", `departments/${enc(id)}`);

// 5. Subscriptions
export const fetchSubscriptions = async () =>
  (await request<Subscription[]>("GET", "subscriptions")).filter((s) => s.id && s.name);
export const saveSubscription = (sub: Subscription) => request<void>("PUT", `subscriptions/${enc(sub.id)}`, clean(sub));
export const deleteSubscription = (id: string) => request<void>("DELETE", `subscriptions/${enc(id)}`);
