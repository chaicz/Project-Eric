import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox } from 'lucide-react';

/**
 * EmptyState
 * A friendly, reusable empty-list component. Shows an icon, title,
 * description, optional primary CTA, and optional secondary actions.
 *
 *   <EmptyState
 *     icon={ScanSearch}
 *     title="No vulnerabilities to fix"
 *     description="Once you run your first scan, findings will appear here with remediation steps."
 *     primaryCta={{ label: "Run a scan", onClick: handleScan }}
 *     secondaryCta={{ label: "Import project", href: "/integrations" }}
 *   />
 */
const EmptyState = ({
  icon: Icon = Inbox,
  iconColor = 'from-blue-500 to-cyan-500',
  iconBg = 'bg-blue-50',
  title,
  description,
  primaryCta = null,
  secondaryCta = null,
  size = 'md',
  className = '',
}) => {
  const navigate = useNavigate();
  const padding = size === 'sm' ? 'p-6' : 'p-10 sm:p-12';
  const iconSize = size === 'sm' ? 'w-10 h-10' : 'w-14 h-14';
  const iconInner = size === 'sm' ? 'w-5 h-5' : 'w-7 h-7';

  return (
    <div className={`flex flex-col items-center justify-center text-center ${padding} ${className}`}>
      <div className={`relative mb-5`}>
        <div className={`absolute inset-0 blur-2xl opacity-40 bg-gradient-to-br ${iconColor} rounded-full`} />
        <div className={`relative ${iconSize} rounded-2xl bg-gradient-to-br ${iconColor} flex items-center justify-center shadow-lg`}>
          <Icon className={`${iconInner} text-white`} />
        </div>
      </div>
      <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-slate-500 max-w-md leading-relaxed">{description}</p>
      )}
      {(primaryCta || secondaryCta) && (
        <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
          {primaryCta && (
            <button
              onClick={() => {
                if (primaryCta.onClick) primaryCta.onClick();
                else if (primaryCta.href) navigate(primaryCta.href);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-all shadow-sm hover:-translate-y-0.5"
            >
              {primaryCta.label}
            </button>
          )}
          {secondaryCta && (
            <button
              onClick={() => {
                if (secondaryCta.onClick) secondaryCta.onClick();
                else if (secondaryCta.href) navigate(secondaryCta.href);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-all"
            >
              {secondaryCta.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
