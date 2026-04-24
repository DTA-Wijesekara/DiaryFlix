import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Diary from './pages/Diary';
import LogWatch from './pages/LogWatch';
import Library from './pages/Library';
import MovieDetail from './pages/MovieDetail';
import SmartRewatch from './pages/SmartRewatch';
import Statistics from './pages/Statistics';
import Settings from './pages/Settings';
import AdminDashboard from './pages/AdminDashboard';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-spinner" />
        <p>Loading CineLog...</p>
      </div>
    );
  }

  // Unauthenticated routes
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Authenticated routes
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          } />
          <Route path="/diary" element={
            <ProtectedRoute><Diary /></ProtectedRoute>
          } />
          <Route path="/log" element={
            <ProtectedRoute><LogWatch /></ProtectedRoute>
          } />
          <Route path="/library" element={
            <ProtectedRoute><Library /></ProtectedRoute>
          } />
          <Route path="/movie/:id" element={
            <ProtectedRoute><MovieDetail /></ProtectedRoute>
          } />
          <Route path="/rewatch" element={
            <ProtectedRoute><SmartRewatch /></ProtectedRoute>
          } />
          <Route path="/stats" element={
            <ProtectedRoute><Statistics /></ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute><Settings /></ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute requireAdmin><AdminDashboard /></ProtectedRoute>
          } />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/register" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}
