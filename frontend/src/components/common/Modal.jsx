import React, { useEffect } from 'react';

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'max-w-lg',
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && onClose) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div
        className={`relative w-full max-w-[calc(100vw-1.5rem)] sm:max-w-lg md:${maxWidth} max-h-[calc(100vh-2rem)] flex flex-col bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden z-10 animate-modal my-auto sm:my-8 text-left`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || subtitle) && (
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/70 shrink-0">
            <div className="min-w-0 flex-1">
              {title && (
                <h3 className="text-sm sm:text-base md:text-lg font-bold text-slate-900 leading-snug break-words">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed break-words">
                  {subtitle}
                </p>
              )}
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg p-1.5 transition-colors cursor-pointer shrink-0"
                aria-label="Close dialog"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Content Body */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto flex-1 text-xs sm:text-sm">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-4 sm:px-6 py-3 sm:py-3.5 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
