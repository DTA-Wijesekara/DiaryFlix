import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Toast from '../components/Toast';
import AuthAside from '../components/AuthAside';
import './Auth.css';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page" id="login-page">
      <AuthAside
        headline={<>Every film you watch, <em>dated</em> and kept.</>}
        caption="A quiet record of your screening life."
      />

      <div className="auth-main">
        <div className="auth-container fade-in">
          <div className="auth-card">
            <div className="auth-card-header">
              <h2>Welcome back</h2>
              <p>Sign in to open your diary.</p>
            </div>

            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              <div className="auth-input-group">
                <label htmlFor="login-email">Email</label>
                <span className="auth-input-icon"><Mail size={15} /></span>
                <input
                  type="email"
                  className="input auth-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  id="login-email"
                  autoComplete="email"
                />
              </div>

              <div className="auth-input-group">
                <label htmlFor="login-password">Password</label>
                <span className="auth-input-icon"><Lock size={15} /></span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input auth-input"
                  style={{ paddingRight: '42px' }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  id="login-password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="auth-toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg auth-submit"
                disabled={loading}
                id="login-submit"
              >
                {loading ? (
                  <div className="auth-btn-spinner" />
                ) : (
                  <>
                    <LogIn size={16} /> Sign in
                  </>
                )}
              </button>
            </form>

            <div className="auth-footer">
              New here? <Link to="/register">Start a diary</Link>.
            </div>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
