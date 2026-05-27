'use client';

interface QuickActionProps {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
}

export function QuickAction({ icon, title, description, onClick }: QuickActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="
        flex flex-col items-start gap-2 p-4
        rounded-xl cursor-pointer
        transition-shadow duration-200 ease-out
        focus:outline-none focus-visible:ring-2
        text-left
      "
      style={{
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        /* focus-visible ring uses accent */
        /* @ts-expect-error CSS custom property */
        '--tw-ring-color': 'var(--accent)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow =
          '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow =
          '0 1px 2px rgba(0,0,0,0.04)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Icon */}
      <span className="text-2xl leading-none select-none" role="img" aria-hidden="true">
        {icon}
      </span>

      {/* Title */}
      <span
        className="font-medium text-sm"
        style={{ color: 'var(--text-primary)' }}
      >
        {title}
      </span>

      {/* Description */}
      <span
        className="text-xs leading-relaxed"
        style={{ color: 'var(--text-secondary)' }}
      >
        {description}
      </span>
    </button>
  );
}
