import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

// Icons for different toast types
const ToastIcons = {
  success: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  info: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  warning: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
};

const ToastIconsRender = ({ type }) => {
  const Icon = ToastIcons[type] || ToastIcons.info;
  return <Icon />;
};

const ToastColors = {
  success: 'bg-emerald-500 text-white ring-1 ring-emerald-400/40 shadow-lg shadow-emerald-500/20',
  error: 'bg-red-500 text-white ring-1 ring-red-400/40 shadow-lg shadow-red-500/20',
  info: 'bg-slate-800 text-white ring-1 ring-slate-700/50 shadow-lg shadow-slate-900/30',
  warning: 'bg-amber-500 text-white ring-1 ring-amber-400/40 shadow-lg shadow-amber-500/20',
};

export const ToastProvider = ({ children }) => {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success', duration = 3000) => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => {
      setToast(null);
    }, duration);
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      {/* Toast Notification */}
      {toast && (
        <div 
          className={`fixed bottom-6 right-6 px-6 py-4 rounded-xl shadow-lg z-[100] flex items-center gap-3 animate-slide-up ${ToastColors[toast.type] || ToastColors.info}`}
          role="alert"
        >
          <ToastIconsRender type={toast.type} />
          <span className="font-medium">{toast.message}</span>
          <button 
            onClick={hideToast}
            className="ml-2 hover:opacity-80 transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
};

export default ToastProvider;
