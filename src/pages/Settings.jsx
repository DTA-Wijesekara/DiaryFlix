import React, { useState, useRef } from 'react';
import { Key, Upload, Download, Trash2, Database, Info, CheckCircle } from 'lucide-react';
import { setTMDBKey, getTMDBKey, hasTMDBKey, isGlobalKey } from '../services/tmdb';
import { getAllLogs, importFromCSV, exportToJSON } from '../services/storage';
import Toast from '../components/Toast';
import './Settings.css';

export default function Settings() {
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef(null);

  const handleExport = () => {
    const json = exportToJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cinelog_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast({ message: 'Data exported successfully!', type: 'success' });
  };

  const handleImportCSV = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const imported = importFromCSV(evt.target.result);
        setToast({ message: `Imported ${imported.length} movies from CSV!`, type: 'success' });
      } catch (err) {
        setToast({ message: 'Failed to import CSV. Check the file format.', type: 'error' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (data.logs && Array.isArray(data.logs)) {
          localStorage.setItem('cinelog_watch_log', JSON.stringify(data.logs));
          if (data.profile) {
            localStorage.setItem('cinelog_user_profile', JSON.stringify(data.profile));
          }
          setToast({ message: `Restored ${data.logs.length} movies from backup!`, type: 'success' });
        } else {
          setToast({ message: 'Invalid backup file format.', type: 'error' });
        }
      } catch {
        setToast({ message: 'Failed to parse JSON backup.', type: 'error' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClearAll = () => {
    if (window.confirm('⚠️ This will DELETE all your cinema diary data permanently. Are you sure?')) {
      if (window.confirm('Really? This cannot be undone. Export your data first!')) {
        localStorage.removeItem('cinelog_watch_log');
        localStorage.removeItem('cinelog_user_profile');
        localStorage.removeItem('cinelog_tmdb_cache');
        setToast({ message: 'All data cleared.', type: 'success' });
      }
    }
  };

  const totalLogs = getAllLogs().length;

  return (
    <div className="settings fade-in" id="settings-page">
      <div className="page-header">
        <h1>Settings ⚙️</h1>
        <p>Configure your DiaryFLIX experience.</p>
      </div>


      {/* Data Management */}
      <div className="settings-section glass-card-static">
        <div className="settings-section-header">
          <Database size={20} />
          <div>
            <h3>Data Management</h3>
            <p>Your data is stored locally in your browser. Currently {totalLogs} movies logged.</p>
          </div>
        </div>

        <div className="settings-data-actions">
          <div className="settings-data-card">
            <h4><Upload size={16} /> Import from CSV</h4>
            <p>Import your existing spreadsheet. Expected columns: Film, Date watched, actor, actress, category, rating</p>
            <input
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleImportCSV}
              style={{ display: 'none' }}
              id="csv-import-input"
            />
            <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
              Choose CSV File
            </button>
          </div>

          <div className="settings-data-card">
            <h4><Upload size={16} /> Restore Backup</h4>
            <p>Restore from a previously exported JSON backup.</p>
            <input
              type="file"
              accept=".json"
              onChange={handleImportJSON}
              style={{ display: 'none' }}
              id="json-import-input"
            />
            <button className="btn btn-secondary" onClick={() => document.getElementById('json-import-input').click()}>
              Choose JSON File
            </button>
          </div>

          <div className="settings-data-card">
            <h4><Download size={16} /> Export Data</h4>
            <p>Download all your cinema diary data as a JSON backup file.</p>
            <button className="btn btn-secondary" onClick={handleExport}>
              Export to JSON
            </button>
          </div>

          <div className="settings-data-card settings-danger-zone">
            <h4><Trash2 size={16} /> Clear All Data</h4>
            <p>Permanently delete all your logged movies. This cannot be undone!</p>
            <button className="btn btn-danger" onClick={handleClearAll}>
              Delete Everything
            </button>
          </div>
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
            <span>🏭 Industry Tabs</span>
            <span>✨ Smart Rewatch</span>
            <span>📊 Statistics</span>
            <span>🎵 Favourite Songs</span>
            <span>💬 Favourite Quotes</span>
            <span>📥 CSV Import</span>
          </div>
          <p className="settings-about-tech">
            Built with React + Vite • Data stored locally • TMDB API for metadata • Zero cost
          </p>
        </div>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
