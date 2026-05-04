import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';
import { resetPassword } from '../services/auth';
import Toast from '../components/Toast';
import AuthAside from '../components/AuthAside';
import './Auth.css';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [toast, setToast] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      setToast({ message: 'Password must be at least 6 characters', type: 'error' });
      return;
    }
    if (password !== confirmPassword) {
      setToast({ message: 'Passwords do not match', type: 'error' });
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      setToast({ message: err.message || 'Could not reset password', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page" id="reset-password-page">
      <AuthAside
        headline={<>A fresh page in your <em>diary</em>.</>}
        caption="Pick a new password and we'll get you back in."
      />

      <div className="auth-main">
        <div className="auth-container fade-in">
          <div className="auth-card">
            {!token ? (
              <>
                <div className="auth-card-header">
                  <h2>Missing reset token</h2>
                  <p>Please use the link from your reset email, or request a new one.</p>
                </div>
                <div className="auth-error-block">
                  <AlertCircle size={40} strokeWidth={1.6} />
                </div>
                <div className="auth-footer">
                  <Link to="/forgot-password">Request a new reset link</Link>
                </div>
              </>
            ) : done ? (
              <>
                <div className="auth-card-header">
                  <h2>Password updated</h2>
                  <p>Your new password is active. Redirecting you to sign in…</p>
                </div>
                <div className="auth-success-block">
                  <CheckCircle2 size={40} strokeWidth={1.6} />
                </div>
              </>
            ) : (
              <>
                <div className="auth-card-header">
                  <h2>Choose a new password</h2>
                  <p>Pick something memorable but private.</p>
                </div>

                <form className="auth-form" onSubmit={handleSubmit} noValidate>
                  <div className="auth-input-group">
                    <label htmlFor="reset-password">New password</label>
                    <span className="auth-input-icon"><Lock size={15} /></span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="input auth-input"
                      style={{ paddingRight: '42px' }}
                      placeholder="At least 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      id="reset-password"
                      autoComplete="new-password"
                      autoFocus
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

                  <div className="auth-input-group">
                    <label htmlFor="reset-confirm">Confirm password</label>
                    <span className="auth-input-icon"><Lock size={15} /></span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="input auth-input"
                      placeholder="Repeat your new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      id="reset-confirm"
                      autoComplete="new-password"
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary btn-lg auth-submit"
                    disabled={loading}
                  >
                    {loading ? <div className="auth-btn-spinner" /> : <><KeyRound size={16} /> Update password</>}
                  </button>
                </form>

                <div className="auth-footer">
                  <Link to="/login">Cancel and sign in</Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
