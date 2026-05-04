// DiaryFLIX — Wishlist service.
// Backend is source of truth; localStorage is a synchronous cache for UI reads.

import { getCurrentUserId, apiFetch, getToken } from './auth';

function getKey() {
  const uid = getCurrentUserId() || 'anonymous';
  return `cinelog_wishlist_${uid}`;
}

function saveCache(items) {
  localStorage.setItem(getKey(), JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('cinelog:wishlist-changed'));
}

export function getAllWishlist() {
  try {
    const data = localStorage.getItem(getKey());
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function getWishlistById(id) {
  return getAllWishlist().find(it => it.id === id) || null;
}

export async function fetchWishlistFromServer() {
  if (!getToken()) return [];
  try {
    const items = await apiFetch('/wishlist');
    saveCache(items);
    return items;
  } catch (e) {
    console.error('Failed to fetch wishlist from server:', e.message);
    return getAllWishlist();
  }
}

export async function addWishlist(entry) {
  const created = await apiFetch('/wishlist', { method: 'POST', body: entry });
  const items = getAllWishlist();
  items.unshift(created);
  saveCache(items);
  return created;
}

export async function updateWishlist(id, updates) {
  const current = getWishlistById(id);
  if (!current) throw new Error('Wishlist item not found in local cache');
  const merged = { ...current, ...updates };

  const saved = await apiFetch(`/wishlist/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: merged,
  });

  const items = getAllWishlist();
  const idx = items.findIndex(i => i.id === id);
  if (idx !== -1) items[idx] = saved;
  saveCache(items);
  return saved;
}

export async function deleteWishlist(id) {
  await apiFetch(`/wishlist/${encodeURIComponent(id)}`, { method: 'DELETE' });
  saveCache(getAllWishlist().filter(i => i.id !== id));
}

// ---- Date bucketing helpers ----

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function bucketWishlist(items = getAllWishlist()) {
  const today = todayKey();
  const buckets = { overdue: [], today: [], upcoming: [], someday: [] };
  for (const item of items) {
    if (!item.plannedDate) buckets.someday.push(item);
    else if (item.plannedDate < today) buckets.overdue.push(item);
    else if (item.plannedDate === today) buckets.today.push(item);
    else buckets.upcoming.push(item);
  }
  return buckets;
}

export function getDueCount(items = getAllWishlist()) {
  const { overdue, today } = bucketWishlist(items);
  return overdue.length + today.length;
}
