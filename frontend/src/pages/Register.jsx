import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Eye, EyeOff, User, Mail, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Toast from '../components/Toast';
import AuthAside from '../components/AuthAside';
import './Auth.css';

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({ displayName: '', email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (form.password !== form.confirmPassword) {
      setToast({ message: 'Passwords do not match', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      await register({
        email: form.email,
        password: form.password,
        displayName: form.displayName,
      });
      navigate('/');
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page" id="register-page">
      <AuthAside
        headline={<>Begin a diary that <em>outlives</em> the films.</>}
        caption="A place for your screening life."
      />

      <div className="auth-main">
        <div className="auth-container fade-in">
          <div className="auth-card">
            <div className="auth-card-header">
              <h2>Open a new diary</h2>
              <p>Name your journal and create an account.</p>
            </div>

            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              <div className="auth-input-group">
                <label htmlFor="register-name">Name</label>
                <span className="auth-input-icon"><User size={15} /></span>
                <input
                  type="text"
                  className="input auth-input"
                  placeholder="How should we address you?"
                  value={form.displayName}
                  onChange={(e) => handleChange('displayName', e.target.value)}
                  required
                  autoFocus
                  id="register-name"
                  autoComplete="name"
                />
              </div>

              <div className="auth-input-group">
                <label htmlFor="register-email">Email</label>
                <span className="auth-input-icon"><Mail size={15} /></span>
                <input
                  type="email"
                  className="input auth-input"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  required
                  id="register-email"
                  autoComplete="email"
                />
              </div>

              <div className="auth-input-group">
                <label htmlFor="register-password">Password</label>
                <span className="auth-input-icon"><Lock size={15} /></span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input auth-input"
                  style={{ paddingRight: '42px' }}
                  placeholder="At least 6 characters"
                  value={form.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  required
                  minLength={6}
                  id="register-password"
                  autoComplete="new-password"
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
                <label htmlFor="register-confirm">Confirm password</label>
                <span className="auth-input-icon"><Lock size={15} /></span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input auth-input"
                  placeholder="Repeat your password"
                  value={form.confirmPassword}
                  onChange={(e) => handleChange('confirmPassword', e.target.value)}
                  required
                  minLength={6}
                  id="register-confirm"
                  autoComplete="new-password"
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg auth-submit"
                disabled={loading}
                id="register-submit"
              >
                {loading ? (
                  <div className="auth-btn-spinner" />
                ) : (
                  <>
                    <UserPlus size={16} /> Create account
                  </>
                )}
              </button>
            </form>

            <div className="auth-footer">
              Already keeping a diary? <Link to="/login">Sign in</Link>.
            </div>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
