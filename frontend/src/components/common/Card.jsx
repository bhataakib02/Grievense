import React from 'react';

export function Card({
  children,
  className = '',
  title,
  subtitle,
  headerAction,
  action,
  footer,
}) {
  const resolvedAction = headerAction || action;

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300/80 transition-colors overflow-hidden ${className}`}
    >
      {(title || subtitle || resolvedAction) && (
        <div className="px-4 sm:px-6 py-3.5 sm:py-4.5 border-b border-slate-100/90 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 bg-slate-50/40">
          <div className="min-w-0 flex-1">
            {title && (
              <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-snug">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
          {resolvedAction && <div className="shrink-0">{resolvedAction}</div>}
        </div>
      )}
      <div className="p-4 sm:p-6">{children}</div>
      {footer && (
        <div className="px-4 sm:px-6 py-3 sm:py-3.5 bg-slate-50/60 border-t border-slate-100 text-xs text-slate-600">
          {footer}
        </div>
      )}
    </div>
  );
}
