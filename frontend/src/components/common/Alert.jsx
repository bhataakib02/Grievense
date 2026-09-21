import React from 'react';

export function Alert({ title, children, variant = 'info', className = '', onClose }) {
  const variantStyles = {
    info: {
      container: 'bg-blue-50 border-blue-200 text-blue-900',
      icon: 'text-blue-600',
    },
    warning: {
      container: 'bg-amber-50 border-amber-200 text-amber-900',
      icon: 'text-amber-600',
    },
    danger: {
      container: 'bg-rose-50 border-rose-200 text-rose-900',
      icon: 'text-rose-600',
    },
    success: {
      container: 'bg-emerald-50 border-emerald-200 text-emerald-900',
      icon: 'text-emerald-600',
    },
  };

  const style = variantStyles[variant] || variantStyles.info;

  return (
    <div className={`p-4 rounded-lg border text-sm flex gap-3 items-start ${style.container} ${className}`} role="alert">
      <div className="flex-1">
        {title && <h4 className="font-semibold mb-1 text-sm">{title}</h4>}
        <div className="leading-relaxed">{children}</div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          type="button"
          className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors"
          aria-label="Close"
        >
          ✕
        </button>
      )}
    </div>
  );
}
