import { useState } from 'react';
import { User, Lock, Download, Database, Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { updateProfile as apiUpdateProfile, changePassword } from '../services/auth';
import { getAllLogs, exportToCSV } from '../services/storage';
import Toast from '../components/Toast';
import GoogleSignInButton from '../components/GoogleSignInButton';
import { linkGoogle } from '../services/auth';
import './Settings.css';

export default function Settings() {
  const { user, refreshSession } = useAuth();
  const [toast, setToast] = useState(null);
  const show = (message, type = 'success') => setToast({ message, type });

  // ── Account ──
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [savingName, setSavingName] = useState(false);

  const handleSaveName = async (e) => {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) return show('Display name cannot be empty.', 'error');
    if (name === user?.displayName) return show('That is already your name.', 'error');
    setSavingName(true);
    try {
      await apiUpdateProfile({ displayName: name });
      refreshSession();
      show('Profile updated.');
    } catch (err) {
      show(err.message || 'Could not update profile.', 'error');
    } finally {
      setSavingName(false);
    }
  };

  // ── Password ──
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pw.next.length < 6) return show('New password must be at least 6 characters.', 'error');
    if (pw.next !== pw.confirm) return show('New passwords do not match.', 'error');
    setSavingPw(true);
    try {
      await changePassword(pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      show('Password changed.');
    } catch (err) {
      show(err.message || 'Could not change password.', 'error');
    } finally {
      setSavingPw(false);
    }
  };

  // ── Data ──
  const totalLogs = getAllLogs().length;

  const handleExport = () => {
    const csv = exportToCSV();
    // Prepend a UTF-8 BOM so Excel detects encoding correctly.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diaryflix_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    show('Spreadsheet exported.');
  };

  return (
    <div className="settings fade-in" id="settings-page">
      <div className="page-header">
        <h1>Settings ⚙️</h1>
        <p>Configure your DiaryFLIX experience.</p>
      </div>

      {/* Account */}
      <div className="settings-section glass-card-static">
        <div className="settings-section-header">
          <User size={20} />
          <div>
            <h3>Account</h3>
            <p>Signed in as {user?.email}.</p>
          </div>
        </div>

        <form className="settings-form" onSubmit={handleSaveName}>
          <label className="settings-field">
            <span className="settings-field-label">Display name</span>
            <input
              className="input"
              type="text"
              value={displayName}
              maxLength={80}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={savingName}>
            <Save size={16} /> {savingName ? 'Saving…' : 'Save name'}
          </button>
        </form>
      </div>

      <section className="settings-section glass-card-static">
        <h3>Link Google</h3>
        <p>Enter your current password below, then select the Google account matching your email.</p>
        <input className="input" type="password" autoComplete="current-password" aria-label="Current password for Google linking" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} />
        <GoogleSignInButton onCredential={async credential => {
          try { await linkGoogle(credential, pw.current); setPw({ ...pw, current: '' }); show('Google account linked.'); }
          catch (err) { show(err.message, 'error'); }
        }} onError={err => show(err.message, 'error')} />
      </section>
      {/* Password */}
      <div className="settings-section glass-card-static">
        <div className="settings-section-header">
          <Lock size={20} />
          <div>
            <h3>Change Password</h3>
            <p>Use at least 6 characters. Google-only accounts can't set a password here.</p>
          </div>
        </div>

        <form className="settings-form" onSubmit={handleChangePassword}>
          <label className="settings-field">
            <span className="settings-field-label">Current password</span>
            <input
              className="input" type="password" autoComplete="current-password"
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
            />
          </label>
          <div className="settings-field-row">
            <label className="settings-field">
              <span className="settings-field-label">New password</span>
              <input
                className="input" type="password" autoComplete="new-password"
                value={pw.next}
                onChange={(e) => setPw({ ...pw, next: e.target.value })}
              />
            </label>
            <label className="settings-field">
              <span className="settings-field-label">Confirm new password</span>
              <input
                className="input" type="password" autoComplete="new-password"
                value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              />
            </label>
          </div>
          <button className="btn btn-primary" type="submit" disabled={savingPw}>
            <Lock size={16} /> {savingPw ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>

      {/* Export */}
      <div className="settings-section glass-card-static">
        <div className="settings-section-header">
          <Database size={20} />
          <div>
            <h3>Export Data</h3>
            <p>Your data is securely stored and synced to your account. {totalLogs} {totalLogs === 1 ? 'film' : 'films'} logged.</p>
          </div>
        </div>

        <div className="settings-data-card">
          <h4><Download size={16} /> Export to Excel</h4>
          <p>Download your full cinema diary as a spreadsheet (.csv) — opens directly in Excel, Google Sheets, or Numbers.</p>
          <button className="btn btn-secondary" onClick={handleExport} disabled={totalLogs === 0}>
            Export Spreadsheet
          </button>
        </div>
      </div>

      {/* About */}
      <div className="settings-section glass-card-static">
        <div className="settings-about">
          <h3>About DiaryFLIX</h3>
          <p>A personalized cinema diary that tracks your movies, moods, and memories.</p>
          <div className="settings-about-features">
            <span>🎬 Movie Logging</span>
            <span>🎭 Mood Tracking</span>
            <span>🧭 Discover</span>
            <span>✨ Smart Rewatch</span>
            <span>📊 Statistics</span>
            <span>🎵 Favourite Songs</span>
            <span>💬 Favourite Quotes</span>
            <span>📥 CSV Import</span>
          </div>
          <p className="settings-about-tech">
            Built with React + Express + PostgreSQL • TMDB API for metadata
          </p>
        </div>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
