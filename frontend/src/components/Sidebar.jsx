import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  PlusCircle,
  Library as LibraryIcon,
  RefreshCw,
  BarChart3,
  Settings,
  Shield,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './Sidebar.css';

const navItems = [
  { path: '/',        icon: LayoutDashboard, label: 'Overview' },
  { path: '/diary',   icon: BookOpen,        label: 'Diary' },
  { path: '/log',     icon: PlusCircle,      label: 'New Entry' },
  { path: '/library', icon: LibraryIcon,     label: 'Library' },
  { path: '/rewatch', icon: RefreshCw,       label: 'Rewatch' },
  { path: '/stats',   icon: BarChart3,       label: 'Statistics' },
  { path: '/settings',icon: Settings,        label: 'Settings' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isAdminUser = user?.role === 'admin';

  const initials = (user?.displayName || 'C')
    .split(' ')
    .map(s => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="3" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M1 7H21" stroke="currentColor" strokeWidth="1.6"/>
              <circle cx="5" cy="5" r="0.8" fill="currentColor"/>
              <circle cx="8" cy="5" r="0.8" fill="currentColor"/>
              <circle cx="11" cy="5" r="0.8" fill="currentColor"/>
              <path d="M6 11L9 13L6 15V11Z" fill="currentColor"/>
            </svg>
          </div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">DiaryFLIX</span>
            <span className="sidebar-brand-tagline">A cinema diary</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <item.icon size={17} strokeWidth={1.8} />
              <span>{item.label}</span>
            </NavLink>
          ))}

          {isAdminUser && (
            <>
              <div className="sidebar-divider" />
              <NavLink
                to="/admin"
                className={({ isActive }) => `sidebar-link sidebar-link-admin ${isActive ? 'active' : ''}`}
              >
                <Shield size={17} strokeWidth={1.8} />
                <span>Admin</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-user">
          <div className="sidebar-user-avatar" aria-hidden="true">{initials}</div>
          <div className="sidebar-user-details">
            <span className="sidebar-user-name">{user?.displayName || 'User'}</span>
            <span className="sidebar-user-role">
              {user?.role === 'admin' ? 'Admin' : 'Member'}
            </span>
          </div>
          <button
            className="sidebar-logout-btn"
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={15} strokeWidth={1.8} />
          </button>
        </div>
      </aside>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {[navItems[0], navItems[1], navItems[2], navItems[3]].map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
          >
            <item.icon size={19} strokeWidth={1.7} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button className="mobile-nav-link" onClick={handleLogout}>
          <LogOut size={19} strokeWidth={1.7} />
          <span>Exit</span>
        </button>
      </nav>
    </>
  );
}
