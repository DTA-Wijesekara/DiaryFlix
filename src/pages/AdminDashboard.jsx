import React, { useState, useEffect } from 'react';
import {
  Shield, Users, Film, Star, Clock, UserCheck, UserX,
  ChevronDown, ChevronUp, Trash2, Crown, User, Activity,
  BarChart3, AlertTriangle
} from 'lucide-react';
import {
  adminGetAllUsers, adminToggleUserActive, adminChangeRole,
  adminDeleteUser, adminGetUserStats
} from '../services/auth';
import Toast from '../components/Toast';
import './AdminDashboard.css';

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [expandedUser, setExpandedUser] = useState(null);
  const [userStats, setUserStats] = useState({});
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = () => {
    try {
      setUsers(adminGetAllUsers());
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const handleToggleActive = (userId) => {
    try {
      adminToggleUserActive(userId);
      loadUsers();
      setToast({ message: 'User status updated', type: 'success' });
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const handleChangeRole = (userId, newRole) => {
    try {
      adminChangeRole(userId, newRole);
      loadUsers();
      setToast({ message: `Role changed to ${newRole}`, type: 'success' });
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const handleDelete = (userId, displayName) => {
    if (window.confirm(`Delete user "${displayName}" and all their data? This cannot be undone.`)) {
      try {
        adminDeleteUser(userId);
        loadUsers();
        setToast({ message: 'User deleted', type: 'success' });
      } catch (err) {
        setToast({ message: err.message, type: 'error' });
      }
    }
  };

  const handleExpand = (userId) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      return;
    }
    setExpandedUser(userId);
    if (!userStats[userId]) {
      try {
        const stats = adminGetUserStats(userId);
        setUserStats(prev => ({ ...prev, [userId]: stats }));
      } catch { }
    }
  };

  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.isActive).length;
  const adminCount = users.filter(u => u.role === 'admin').length;

  return (
    <div className="admin-dashboard fade-in" id="admin-dashboard-page">
      <div className="page-header">
        <h1><Shield size={28} className="admin-shield-icon" /> Admin Panel</h1>
        <p>Manage users, roles, and system overview.</p>
      </div>

      {/* System Stats */}
      <div className="admin-stats-grid">
        <div className="admin-stat glass-card-static slide-up stagger-1">
          <div className="admin-stat-icon" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
            <Users size={22} />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-value">{totalUsers}</span>
            <span className="admin-stat-label">Total Users</span>
          </div>
        </div>

        <div className="admin-stat glass-card-static slide-up stagger-2">
          <div className="admin-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
            <UserCheck size={22} />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-value">{activeUsers}</span>
            <span className="admin-stat-label">Active Users</span>
          </div>
        </div>

        <div className="admin-stat glass-card-static slide-up stagger-3">
          <div className="admin-stat-icon" style={{ background: 'rgba(37, 99, 235, 0.12)', color: '#2563eb' }}>
            <Crown size={22} />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-value">{adminCount}</span>
            <span className="admin-stat-label">Admins</span>
          </div>
        </div>

        <div className="admin-stat glass-card-static slide-up stagger-4">
          <div className="admin-stat-icon" style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' }}>
            <UserX size={22} />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-value">{totalUsers - activeUsers}</span>
            <span className="admin-stat-label">Deactivated</span>
          </div>
        </div>
      </div>

      {/* User List */}
      <div className="admin-users-section">
        <h3 className="admin-section-title">
          <Users size={18} />
          All Users
        </h3>

        <div className="admin-users-list">
          {/* Header */}
          <div className="admin-users-header">
            <span>User</span>
            <span>Role</span>
            <span>Status</span>
            <span>Joined</span>
            <span>Last Login</span>
            <span>Actions</span>
          </div>

          {users.map(user => (
            <div key={user.id} className="admin-user-item">
              <div className="admin-user-row glass-card" onClick={() => handleExpand(user.id)}>
                {/* User Info */}
                <div className="admin-user-info">
                  <span className="admin-user-avatar">{user.avatar || '🎬'}</span>
                  <div>
                    <span className="admin-user-name">{user.displayName}</span>
                    <span className="admin-user-email">{user.email}</span>
                  </div>
                </div>

                {/* Role */}
                <div className="admin-user-role">
                  <span className={`admin-role-badge ${user.role}`}>
                    {user.role === 'admin' ? <Crown size={12} /> : <User size={12} />}
                    {user.role}
                  </span>
                </div>

                {/* Status */}
                <div className="admin-user-status">
                  <span className={`admin-status-dot ${user.isActive ? 'active' : 'inactive'}`} />
                  <span>{user.isActive ? 'Active' : 'Inactive'}</span>
                </div>

                {/* Joined */}
                <div className="admin-user-date">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  }) : '—'}
                </div>

                {/* Last Login */}
                <div className="admin-user-date">
                  {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  }) : 'Never'}
                </div>

                {/* Expand */}
                <div className="admin-user-expand">
                  {expandedUser === user.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>

              {/* Expanded Actions */}
              {expandedUser === user.id && (
                <div className="admin-user-expanded glass-card-static slide-up">
                  {/* User Stats */}
                  {userStats[user.id] && (
                    <div className="admin-user-stats">
                      <div className="admin-user-stat-item">
                        <Film size={14} />
                        <span>{userStats[user.id].totalWatched} movies</span>
                      </div>
                      <div className="admin-user-stat-item">
                        <Star size={14} />
                        <span>Avg {userStats[user.id].avgRating}/10</span>
                      </div>
                      <div className="admin-user-stat-item">
                        <Activity size={14} />
                        <span>
                          Last: {userStats[user.id].lastActivity
                            ? new Date(userStats[user.id].lastActivity).toLocaleDateString()
                            : 'No activity'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="admin-user-actions">
                    <div className="admin-action-group">
                      <label>Role:</label>
                      <select
                        className="select admin-role-select"
                        value={user.role}
                        onChange={(e) => handleChangeRole(user.id, e.target.value)}
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>

                    <button
                      className={`btn ${user.isActive ? 'btn-secondary' : 'btn-primary'}`}
                      onClick={() => handleToggleActive(user.id)}
                    >
                      {user.isActive ? (
                        <><UserX size={14} /> Deactivate</>
                      ) : (
                        <><UserCheck size={14} /> Activate</>
                      )}
                    </button>

                    <button
                      className="btn btn-danger"
                      onClick={() => handleDelete(user.id, user.displayName)}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>

                  {user.role === 'admin' && (
                    <div className="admin-protect-note">
                      <AlertTriangle size={13} />
                      <span>Admin accounts have full system access</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
