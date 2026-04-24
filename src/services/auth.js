// CineLog — Authentication Service
// Communicates with Node.js/MSSQL backend

const API_URL = 'http://localhost:5000/api';
const STORAGE_KEYS = {
  SESSION: 'cinelog_session',
  TOKEN: 'cinelog_token',
};

// ---- Register ----

export async function register({ email, password, displayName }) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName })
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  
  setSession(data.token, data.user);
  return data.user;
}

// ---- Login ----

export async function login(email, password) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  
  setSession(data.token, data.user);
  return data.user;
}

// ---- Logout ----

export function logout() {
  localStorage.removeItem(STORAGE_KEYS.SESSION);
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
}

// ---- Session Management ----

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

export function getToken() {
  return localStorage.getItem(STORAGE_KEYS.TOKEN);
}

export function isAuthenticated() {
  return getSession() !== null && getToken() !== null;
}

export function isAdmin() {
  const session = getSession();
  return session?.role === 'admin';
}

export function getCurrentUserId() {
  const session = getSession();
  return session?.userId || null;
}

// ---- Fetch Current User (Refresh session) ----

export async function fetchCurrentUser() {
    const token = getToken();
    if (!token) return null;

    try {
        const res = await fetch(`${API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            logout();
            return null;
        }
        const data = await res.json();
        setSession(token, data.user);
        return data.user;
    } catch {
        return null;
    }
}

// ---- Profile Management ----

export async function updateProfile({ displayName, avatar }) {
  // Not fully implemented on backend yet, but can be added. 
  // For now, throwing error if called.
  throw new Error("Profile update not implemented in new backend yet.");
}

export async function changePassword(currentPassword, newPassword) {
  throw new Error("Password change not implemented in new backend yet.");
}

// ---- Admin Functions ----
// These need corresponding backend endpoints to be fully functional.

export function adminGetAllUsers() {
  if (!isAdmin()) throw new Error('Unauthorized');
  return []; // Placeholder
}

export function adminToggleUserActive(userId) {
  if (!isAdmin()) throw new Error('Unauthorized');
  throw new Error('Not implemented');
}

export function adminChangeRole(userId, newRole) {
  if (!isAdmin()) throw new Error('Unauthorized');
  throw new Error('Not implemented');
}

export function adminDeleteUser(userId) {
  if (!isAdmin()) throw new Error('Unauthorized');
  throw new Error('Not implemented');
}

export function adminGetUserStats(userId) {
  if (!isAdmin()) throw new Error('Unauthorized');
  return { totalWatched: 0, avgRating: '0', lastActivity: null };
}

export { adminGetAllUsers as _getAllUsersInternal };
