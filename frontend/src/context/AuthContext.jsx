import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSession, getToken, login as authLogin, register as authRegister, logout as authLogout, fetchCurrentUser, loginWithGoogle as authLoginWithGoogle } from '../services/auth';
import { fetchLogsFromServer } from '../services/storage';
import { fetchWishlistFromServer } from '../services/wishlist';
import { identifyUser, resetAnalyticsUser } from '../analytics';

const AuthContext = createContext(null);
async function hydrateSession() {
  const token = getToken();
  await Promise.all([fetchLogsFromServer({ strict: true }), fetchWishlistFromServer({ strict: true })]);
  if (!token || token !== getToken()) throw new Error('Session changed while loading your diary');
  return getSession();
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncError, setSyncError] = useState(null);

  useEffect(() => {
    let active = true;
    async function initAuth() {
      try {
        const currentUser = await fetchCurrentUser();
        if (currentUser) {
          const session = await hydrateSession();
          if (active) { setUser(session); identifyUser(session); }
        } else if (active) { authLogout(); }
      } catch (err) {
        if (active && getToken()) setError(err.message || 'Could not connect. Please retry.');
      } finally { if (active) setLoading(false); }
    }
    initAuth();
    const onExpired = () => { resetAnalyticsUser(); setUser(null); setError(null); setSyncError(null); };
    const onStorage = event => { if (event.key === 'cinelog_token') window.location.reload(); };
    const onSyncError = event => setSyncError(event.detail);
    window.addEventListener('cinelog:sync-error', onSyncError);
    window.addEventListener('storage', onStorage);
    window.addEventListener('cinelog:session-expired', onExpired);
    return () => {
      active = false;
      window.removeEventListener('cinelog:sync-error', onSyncError);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('cinelog:session-expired', onExpired);
    };
  }, []);

  const finishLogin = useCallback(async () => {
    const session = await hydrateSession();
    setError(null);
    setSyncError(null);
    setUser(session);
    identifyUser(session);
  }, []);
  const login = useCallback(async (email, password) => {
    const result = await authLogin(email, password);
    await finishLogin();
    return result;
  }, [finishLogin]);
  const register = useCallback(data => authRegister(data), []);
  const loginWithGoogle = useCallback(async credential => {
    const result = await authLoginWithGoogle(credential);
    await finishLogin();
    return result;
  }, [finishLogin]);
  const logout = useCallback(() => {
    authLogout();
    resetAnalyticsUser();
    setUser(null);
    setError(null);
    setSyncError(null);
  }, []);
  const refreshSession = useCallback(() => setUser(getSession()), []);

  return <AuthContext.Provider value={{ user, loading, error, syncError, login, register, loginWithGoogle, logout, refreshSession }}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- Context and its accessor share the provider module.
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
