import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Send, CheckCircle2 } from 'lucide-react';
import { forgotPassword } from '../services/auth';
import Toast from '../components/Toast';
import AuthAside from '../components/AuthAside';
import './Auth.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [toast, setToast] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await forgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      setToast({ message: err.message || 'Could not send reset email', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page" id="forgot-password-page">
      <AuthAside
        headline={<>A small <em>break</em> in routine.</>}
        caption="We'll send you a link to choose a new password."
      />

      <div className="auth-main">
        <div className="auth-container fade-in">
          <div className="auth-card">
            {submitted ? (
              <>
                <div className="auth-card-header">
                  <h2>Check your inbox</h2>
                  <p>
                    If an account exists for <strong>{email}</strong>, we've sent a link to reset your password.
                    The link expires in 60 minutes.
                  </p>
                </div>
                <div className="auth-success-block">
                  <CheckCircle2 size={40} strokeWidth={1.6} />
                  <p>Didn't get the email? Check your spam folder, then try again with the same address.</p>
                </div>
                <div className="auth-footer">
                  <Link to="/login">Back to sign in</Link>
                </div>
              </>
            ) : (
              <>
                <div className="auth-card-header">
                  <h2>Forgot your password?</h2>
                  <p>Enter the email you used to register and we'll send you a reset link.</p>
                </div>

                <form className="auth-form" onSubmit={handleSubmit} noValidate>
                  <div className="auth-input-group">
                    <label htmlFor="forgot-email">Email</label>
                    <span className="auth-input-icon"><Mail size={15} /></span>
                    <input
                      type="email"
                      className="input auth-input"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      id="forgot-email"
                      autoComplete="email"
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary btn-lg auth-submit"
                    disabled={loading || !email}
                  >
                    {loading ? <div className="auth-btn-spinner" /> : <><Send size={16} /> Send reset link</>}
                  </button>
                </form>

                <div className="auth-footer">
                  Remembered it? <Link to="/login">Sign in</Link>.
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
