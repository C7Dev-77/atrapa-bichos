/** Returns a persistent anonymous UUID for this device/browser.
 *  Stored in localStorage under "ab-uuid".
 *  Used as the identifier for the global leaderboard (no login required).
 */
export function getOrCreateUuid(): string {
  const KEY = "ab-uuid";
  const stored = localStorage.getItem(KEY);
  if (stored) return stored;
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(KEY, id);
  return id;
}
