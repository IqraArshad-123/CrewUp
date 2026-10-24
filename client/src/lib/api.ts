let refreshing: Promise<boolean> | null = null;
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    if (!refreshing)
      refreshing = fetch("/api/auth/refresh", { method: "POST" })
        .then((r) => r.ok)
        .finally(() => {
          refreshing = null;
        });
    if (await refreshing) return api<T>(path, options, false);
  }
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error?.message || "Request failed. Please try again.");
  return data as T;
}
export const money = (amount: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
export const date = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
