'use client';

interface HeaderProps {
  projectName: string;
  connected: boolean;
  model: string;
  onToggleSidebar: () => void;
}

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function Header({ projectName, connected, model, onToggleSidebar }: HeaderProps) {
  return (
    <header
      className="h-[60px] flex items-center justify-between px-4 sm:px-6 shrink-0"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-primary) 85%, transparent)',
        borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Left: Hamburger + Project name */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="
            p-1.5 rounded-lg
            transition-colors duration-100
            hover:bg-black/5 dark:hover:bg-white/5
          "
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
        >
          <HamburgerIcon />
        </button>
        <span
          className="font-semibold text-lg select-none"
          style={{ color: 'var(--text-primary)' }}
        >
          {projectName || 'Claude CLI'}
        </span>
      </div>

      {/* Right: Status + Model */}
      <div className="flex items-center gap-3">
        {/* Model chip */}
        <span
          className="text-xs font-medium px-2.5 py-1 rounded-full"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
          }}
        >
          {model}
        </span>

        {/* Connection status dot */}
        <span className="relative flex items-center" title={connected ? 'Connected' : 'Disconnected'}>
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{
              backgroundColor: connected ? '#22c55e' : '#ef4444',
            }}
          />
          {connected && (
            <span
              className="absolute w-2.5 h-2.5 rounded-full animate-ping"
              style={{ backgroundColor: '#22c55e', opacity: 0.4 }}
            />
          )}
        </span>
      </div>
    </header>
  );
}
