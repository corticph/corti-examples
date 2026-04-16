export function cacheFormValues(key: string, value: unknown): void {
  sessionStorage.setItem(key, JSON.stringify(value));
}

export function consumeCachedFormValues<T>(key: string): T | null {
  const raw = sessionStorage.getItem(key);
  if (!raw) {
    return null;
  }
  sessionStorage.removeItem(key);
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
