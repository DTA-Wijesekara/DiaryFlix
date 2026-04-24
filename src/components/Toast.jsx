import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';
import './Toast.css';

export default function Toast({ message, type = 'success', duration = 3000, onClose }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(onClose, 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const handleClose = () => {
    setExiting(true);
    setTimeout(onClose, 300);
  };

  return (
    <div className={`toast ${exiting ? 'toast-exit' : ''} toast-${type}`}>
      {type === 'success' ? (
        <CheckCircle size={18} className="toast-icon toast-icon-success" />
      ) : (
        <AlertCircle size={18} className="toast-icon toast-icon-error" />
      )}
      <span className="toast-message">{message}</span>
      <button className="toast-close" onClick={handleClose}>
        <X size={14} />
      </button>
    </div>
  );
}
