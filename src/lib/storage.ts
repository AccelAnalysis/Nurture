/** Browser storage is optional; private browsing and storage-denial must not break routing. */
export function readSession<T>(key: string, validate: (value: unknown) => value is T): T | null {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
export function writeSession(key: string, value: unknown): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Memory state remains usable when browser storage is unavailable. */
  }
}
