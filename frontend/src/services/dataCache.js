// User data lives only in memory; credentials are managed separately.
const entries = new Map();
export const dataCache = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), clear: () => entries.clear() };
for (const key of Object.keys(localStorage)) {
  if (/^cinelog_(watch_log|wishlist|user_profile)_/.test(key)) localStorage.removeItem(key);
}
