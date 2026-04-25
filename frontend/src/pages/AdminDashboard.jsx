import React, { useCallback, useEffect, useState } from 'react';
import {
  Users, UserCheck, UserX, ChevronDown, ChevronUp, Trash2, Crown, User,
  Activity, Film, Star, AlertTriangle
} from 'lucide-react';
import {
  adminGetAllUsers, adminToggleUserActive, adminChangeRole,
  adminDeleteUser, adminGetUserStats,
} from '../services/auth';
import Toast from '../components/Toast';
import './AdminDashboard.css';

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [expandedUser, setExpandedUser] = useState(null);
  const [userStats, setUserStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // tracks which user is being mutated
  const [toast, setToast] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await adminGetAllUsers();
      setUsers(list);
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleExpand = async (userId) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      return;
    }
    setExpandedUser(userId);
    if (!userStats[userId]) {
      try {
        const stats = await adminGetUserStats(userId);
        setUserStats(prev => ({ ...prev, [userId]: stats }));
      } catch (err) {
        setToast({ message: err.message, type: 'error' });
      }
    }
  };

  const handleChangeRole = async (userId, newRole) => {
    setBusy(userId);
    try {
      await adminChangeRole(userId, newRole);
      await loadUsers();
      setToast({ message: `Role changed to ${newRole}`, type: 'success' });
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const handleToggleActive = async (userId, currentlyActive) => {
    setBusy(userId);
    try {
      await adminToggleUserActive(userId, !currentlyActive);
      await loadUsers();
      setToast({ message: currentlyActive ? 'User deactivated' : 'User activated', type: 'success' });
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (userId, displayName) => {
    if (!window.confirm(`Delete user "${displayName}" and all their diary entries? This cannot be undone.`)) return;
    setBusy(userId);
    try {
      await adminDeleteUser(userId);
      await loadUsers();
      setToast({ message: 'User deleted', type: 'success' });
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.isActive).length;
  const adminCount = users.filter(u => u.role === 'admin').length;

  return (
    <div className="admin-dashboard fade-in" id="admin-dashboard-page">
      <header className="page-header">
        <span className="eyebrow">Administration</span>
        <h1>Membership</h1>
        <p>Manage accounts, roles, and diary ownership across DiaryFLIX.</p>
      </header>

      <div className="admin-stats-grid">
        <StatTile icon={<Users size={18} />} value={totalUsers} label="Total accounts" />
        <StatTile icon={<UserCheck size={18} />} value={activeUsers} label="Active" />
        <StatTile icon={<Crown size={18} />} value={adminCount} label="Administrators" />
        <StatTile icon={<UserX size={18} />} value={totalUsers - activeUsers} label="Deactivated" />
      </div>

      <section className="admin-users-section">
        <h3 className="admin-section-title">
          <Users size={16} /> Accounts
        </h3>

        {loading ? (
          <div className="empty-state"><p>Loading…</p></div>
        ) : users.length === 0 ? (
          <div className="empty-state"><p>No users yet.</p></div>
        ) : (
          <div className="admin-users-list">
            <div className="admin-users-header">
              <span>User</span>
              <span>Role</span>
              <span>Status</span>
              <span>Joined</span>
              <span>Last sign-in</span>
              <span>Entries</span>
              <span aria-hidden="true" />
            </div>

            {users.map(u => {
              const isOpen = expandedUser === u.id;
              return (
                <div key={u.id} className="admin-user-item">
                  <div
                    className="admin-user-row"
                    onClick={() => handleExpand(u.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleExpand(u.id); } }}
                  >
                    <div className="admin-user-info">
                      <span className="admin-user-avatar">{(u.avatar || u.displayName?.[0] || 'C').toUpperCase()}</span>
                      <div>
                        <span className="admin-user-name">{u.displayName}</span>
                        <span className="admin-user-email">{u.email}</span>
                      </div>
                    </div>

                    <div className="admin-user-role">
                      <span className={`admin-role-badge ${u.role}`}>
                        {u.role === 'admin' ? <Crown size={12} /> : <User size={12} />}
                        {u.role}
                      </span>
                    </div>

                    <div className="admin-user-status">
                      <span className={`admin-status-dot ${u.isActive ? 'active' : 'inactive'}`} />
                      <span>{u.isActive ? 'Active' : 'Inactive'}</span>
                    </div>

                    <div className="admin-user-date mono">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                    </div>

                    <div className="admin-user-date mono">
                      {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'}
                    </div>

                    <div className="mono">{u.logsCount ?? 0}</div>

                    <div className="admin-user-expand">
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="admin-user-expanded slide-up">
                      {userStats[u.id] && (
                        <div className="admin-user-stats">
                          <div className="admin-user-stat-item">
                            <Film size={14} />
                            <span>{userStats[u.id].totalWatched} films</span>
                          </div>
                          <div className="admin-user-stat-item">
                            <Star size={14} />
                            <span>Avg {userStats[u.id].avgRating}/10</span>
                          </div>
                          <div className="admin-user-stat-item">
                            <Activity size={14} />
                            <span>
                              Last entry: {userStats[u.id].lastActivity
                                ? new Date(userStats[u.id].lastActivity).toLocaleDateString()
                                : '—'}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="admin-user-actions">
                        <div className="admin-action-group">
                          <label>Role</label>
                          <select
                            className="select admin-role-select"
                            value={u.role}
                            onChange={(e) => handleChangeRole(u.id, e.target.value)}
                            disabled={busy === u.id}
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>

                        <button
                          className={`btn ${u.isActive ? 'btn-secondary' : 'btn-accent'}`}
                          onClick={() => handleToggleActive(u.id, u.isActive)}
                          disabled={busy === u.id}
                        >
                          {u.isActive ? <><UserX size={14} /> Deactivate</> : <><UserCheck size={14} /> Activate</>}
                        </button>

                        <button
                          className="btn btn-danger"
                          onClick={() => handleDelete(u.id, u.displayName)}
                          disabled={busy === u.id}
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>

                      {u.role === 'admin' && (
                        <div className="admin-protect-note">
                          <AlertTriangle size={13} />
                          <span>Admin accounts have full system access. The last admin cannot be demoted or deleted.</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function StatTile({ icon, value, label }) {
  return (
    <div className="admin-stat">
      <div className="admin-stat-icon">{icon}</div>
      <div className="admin-stat-info">
        <span className="admin-stat-value mono">{value}</span>
        <span className="admin-stat-label">{label}</span>
      </div>
    </div>
  );
}
