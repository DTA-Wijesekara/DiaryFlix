// CineLog — Frontend auth / user / admin service
// Talks to the Express backend. Handles token expiration uniformly.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const STORAGE_KEYS = {
  SESSION: 'cinelog_session',
  TOKEN: 'cinelog_token',
};

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

async function parseResponse(res) {
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }

  if (!res.ok) {
    if (res.status === 401 && data.code === 'TOKEN_EXPIRED') {
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
  const { body, headers, ...rest } = options;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: authHeaders(headers || {}),
    body: body && typeof body !== 'string' ? JSON.stringify(body) : body,
  });
  return parseResponse(res);
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
  setSession(data.token, data.user);
  return data.user;
}

export async function login(email, password) {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  setSession(data.token, data.user);
  return data.user;
}

export function logout() {
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
    if (err.status === 401 || err.status === 404) logout();
    return null;
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
  return apiFetch('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
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
