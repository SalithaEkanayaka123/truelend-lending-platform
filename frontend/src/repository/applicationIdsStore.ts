/** Remembers the ids of applications started in this browser. The API has no
 * "list my applications" endpoint yet (E5-S1), so "My applications" is built
 * from these ids plus `GET /api/applications/{id}`. Ids only: no personal or
 * financial data is stored. Storage can be blocked, so every access is guarded. */

const KEY = 'truelend.applicationIds';

export function readApplicationIds(): number[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is number => Number.isInteger(v)) : [];
  } catch {
    return [];
  }
}

export function rememberApplicationId(id: number): void {
  try {
    const ids = readApplicationIds().filter((known) => known !== id);
    window.localStorage.setItem(KEY, JSON.stringify([id, ...ids].slice(0, 50)));
  } catch {
    // Storage unavailable: the list simply will not remember this application.
  }
}
