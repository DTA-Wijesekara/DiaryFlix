import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSession, login as authLogin, register as authRegister, logout as authLogout, fetchCurrentUser } from '../services/auth';
import { fetchLogsFromServer } from '../services/storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initAuth() {
      const currentUser = await fetchCurrentUser();
      if (currentUser) {
        setUser(getSession());
        await fetchLogsFromServer();
      } else {
        authLogout();
      }
      setLoading(false);
    }
    initAuth();

    // Global session-expired handler: auth service dispatches this when the
    // server returns 401 TOKEN_EXPIRED so the user is logged out everywhere.
    const onExpired = () => setUser(null);
    window.addEventListener('cinelog:session-expired', onExpired);
    return () => window.removeEventListener('cinelog:session-expired', onExpired);
  }, []);

  const login = useCallback(async (email, password) => {
    const result = await authLogin(email, password);
    setUser(getSession());
    await fetchLogsFromServer();
    return result;
  }, []);

  const register = useCallback(async (data) => {
    const result = await authRegister(data);
    setUser(getSession());
    await fetchLogsFromServer();
    return result;
  }, []);

  const logout = useCallback(() => {
    authLogout();
    setUser(null);
  }, []);

  const refreshSession = useCallback(() => {
    setUser(getSession());
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
