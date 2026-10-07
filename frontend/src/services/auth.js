import { dataCache } from './dataCache';
// CineLog — Frontend auth / user / admin service
// Talks to the Express backend. Handles token expiration uniformly.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const STORAGE_KEYS = {
  SESSION: 'cinelog_session',
  TOKEN: 'cinelog_token',
};

const pendingRequests = new Set();

// ---- Low-level fetch helpers ----

function getToken() {
  return localStorage.getItem(STORAGE_KEYS.TOKEN);
}

function authHeaders(extra = {}) {
  const t = getToken();
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (t) headers.Authorization = `Bearer ${t}`;
  return headers;
}

async function parseResponse(res, requestToken) {
  const text = await res.text();
  if (requestToken !== getToken()) throw new Error('Session changed during request');
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }

  if (!res.ok) {
    if (res.status === 401 && ['TOKEN_EXPIRED', 'SESSION_REVOKED'].includes(data.code)) {
      logout();
      window.dispatchEvent(new CustomEvent('cinelog:session-expired'));
    }
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

async function apiFetch(path, options = {}) {
  const requestToken = getToken();
  const controller = new AbortController();
  pendingRequests.add(controller);
  try {
    const { body, headers, ...rest } = options;
    const res = await fetch(API_URL + path, {
      ...rest,
      signal: controller.signal,
      headers: authHeaders(headers || {}),
      body: body && typeof body !== 'string' ? JSON.stringify(body) : body,
    });
    return await parseResponse(res, requestToken);
  } finally { pendingRequests.delete(controller); }
}

// ---- Session storage ----

function setSession(token, user) {
  const session = {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    avatar: user.avatar,
    loginAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
  localStorage.setItem(STORAGE_KEYS.TOKEN, token);
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION));
  } catch {
    return null;
  }
}

export { getToken };

export function isAuthenticated() {
  return !!getToken() && !!getSession();
}

export function isAdmin() {
  return getSession()?.role === 'admin';
}

export function getCurrentUserId() {
  return getSession()?.userId || null;
}

// ---- Public API ----

export async function register({ email, password, displayName }) {
  const data = await apiFetch('/auth/register', {
    method: 'POST',
    body: { email, password, displayName },
  });
  return data;
}

export async function login(email, password) {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  setSession(data.token, data.user);
  return data.user;
}

export async function loginWithGoogle(credential) {
  const data = await apiFetch('/auth/google', {
    method: 'POST',
    body: { credential },
  });
  setSession(data.token, data.user);
  return data.user;
}

export function logout() {
  for (const controller of pendingRequests) controller.abort();
  pendingRequests.clear();
  dataCache.clear();
  const uid = getCurrentUserId();
  for (const prefix of ['cinelog_watch_log_', 'cinelog_wishlist_', 'cinelog_user_profile_']) localStorage.removeItem(prefix + uid);
  localStorage.removeItem(STORAGE_KEYS.SESSION);
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
}

export async function fetchCurrentUser() {
  if (!getToken()) return null;
  try {
    const data = await apiFetch('/auth/me');
    // Refresh cached session using current token
    setSession(getToken(), data.user);
    return data.user;
  } catch (err) {
    if (err.status === 401 || err.status === 404) { logout(); return null; }
    throw err;
  }
}

// ---- Profile ----

export async function updateProfile({ displayName, avatar }) {
  const payload = {};
  if (displayName !== undefined) payload.displayName = displayName;
  if (avatar !== undefined) payload.avatar = avatar;

  const data = await apiFetch('/auth/me', { method: 'PUT', body: payload });
  setSession(getToken(), data.user);
  return data.user;
}

export async function changePassword(currentPassword, newPassword) {
  const result = await apiFetch('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
  logout();
  window.dispatchEvent(new CustomEvent('cinelog:session-expired'));
  return result;
}

export async function forgotPassword(email) {
  return apiFetch('/auth/forgot-password', {
    method: 'POST',
    body: { email },
  });
}

export async function resetPassword(token, newPassword) {
  const result = await apiFetch('/auth/reset-password', {
    method: 'POST',
    body: { token, newPassword },
  });
  logout();
  window.dispatchEvent(new CustomEvent('cinelog:session-expired'));
  return result;
}

// ---- Admin ----

export async function adminGetAllUsers() {
  return apiFetch('/admin/users');
}

export async function adminGetUserStats(userId) {
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}/stats`);
}

export async function adminChangeRole(userId, role) {
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}/role`, {
    method: 'PUT',
    body: { role },
  });
}

export async function adminToggleUserActive(userId, isActive) {
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}/active`, {
    method: 'PUT',
    body: { isActive },
  });
}

export async function adminDeleteUser(userId) {
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

// Expose the generic fetch for other services (storage.js) to reuse.
export { apiFetch, API_URL };

export async function linkGoogle(credential, currentPassword) {
  return apiFetch('/auth/link-google', { method: 'POST', body: { credential, currentPassword } });
}

export async function apiFetchAll(path) {
  const rows = [];
  const token = getToken();
  for (let offset = 0; ; offset += 200) {
    if (token !== getToken()) throw new Error('Session changed during request');
    const page = await apiFetch(path + '?limit=200&offset=' + offset);
    rows.push(...page);
    if (page.length < 200) return rows;
  }
}
