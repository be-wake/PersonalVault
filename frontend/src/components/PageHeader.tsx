'use client';

import { useRouter } from 'next/navigation';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: string;
  backLabel?: string;
  onBack?: () => void;
  /** Extra content rendered beside the title row */
  action?: React.ReactNode;
}

/** Navy hero bar used at the top of every vault / detail page. */
export default function PageHeader({ title, subtitle, icon, backLabel = '← Back', onBack, action }: PageHeaderProps) {
  const router = useRouter();
  const handleBack = onBack ?? (() => router.back());

  return (
    <div className="bg-[var(--color-navy)] px-6 pt-[52px] pb-6 mb-6">
      <button
        onClick={handleBack}
        className="bg-transparent border-0 text-white/70 text-[14px] cursor-pointer mb-3 hover:text-white/90 transition-colors"
      >
        {backLabel}
      </button>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon && <span className="text-[28px] leading-none">{icon}</span>}
          <div>
            <h1 className="text-white text-[20px] font-bold leading-tight">{title}</h1>
            {subtitle && <p className="text-white/60 text-[13px] mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action && <div>{action}</div>}
      </div>
    </div>
  );
}
