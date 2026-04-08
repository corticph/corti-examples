export function getRequiredTrimmedFields<
  T extends Record<string, string>,
  const K extends readonly (keyof T)[],
>(
  form: T,
  keys: K,
): { ok: true; values: { [P in K[number]]: string } } | { ok: false; missing: K[number][] } {
  const values = {} as { [P in K[number]]: string };
  const missing: K[number][] = [];

  for (const key of keys) {
    const value = form[key].trim();
    if (!value) {
      missing.push(key);
    }
    values[key] = value;
  }

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  return { ok: true, values };
}

export function getRequiredFormValues(formEl: HTMLFormElement):
  | {
      ok: true;
      values: Record<string, string>;
    }
  | {
      ok: false;
      missing: string[];
    } {
  const data = new FormData(formEl);
  const values: Record<string, string> = {};
  const missing: string[] = [];

  for (const [key, value] of data.entries()) {
    const v = String(value).trim();
    values[key] = v;
    if (!v) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  return { ok: true, values };
}
