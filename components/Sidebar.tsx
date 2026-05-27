'use client';

import { useState, useEffect } from 'react';
import type { Project } from '@/lib/projects';
import type { SessionMeta } from '@/lib/sessions';

interface SidebarProps {
  projects: Project[];
  selectedId: string | null;
  onSelectProject: (id: string) => void;
  onAddProject: () => void;
  onEditProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  sessions: SessionMeta[];
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 150ms ease',
      }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function truncatePath(path: string, maxLen: number = 32): string {
  if (path.length <= maxLen) return path;
  const sep = path.includes('/') ? '/' : '\\';
  const parts = path.split(sep);
  // Show first and last 2 segments
  if (parts.length > 3) {
    return '...' + sep + parts.slice(-2).join(sep);
  }
  return '...' + path.slice(path.length - maxLen + 3);
}

function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  return days + 'd ago';
}

export function Sidebar({
  projects,
  selectedId,
  onSelectProject,
  onAddProject,
  onEditProject,
  onDeleteProject,
  sessions,
  selectedSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: SidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);

  // Auto-expand the selected project
  useEffect(() => {
    if (selectedId) {
      setExpandedProjectId(selectedId);
    }
  }, [selectedId]);

  const handleProjectClick = (id: string) => {
    // Toggle expansion
    if (expandedProjectId === id) {
      // If clicking the already-expanded project, keep it expanded (selected project stays open)
      // but still notify parent
      onSelectProject(id);
    } else {
      setExpandedProjectId(id);
      onSelectProject(id);
    }
  };

  return (
    <aside
      className="sidebar-panel flex flex-col h-full shrink-0 overflow-hidden"
      style={{
        width: '280px',
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="h-[60px] flex items-center px-4 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span
          className="text-sm font-semibold select-none"
          style={{ color: 'var(--text-primary)' }}
        >
          Projects
        </span>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto py-1">
        {projects.map((project) => {
          const isSelected = project.id === selectedId;
          const isHovered = project.id === hoveredId;
          const isExpanded = expandedProjectId === project.id;
          const projectSessions = isExpanded ? sessions : [];

          return (
            <div key={project.id}>
              {/* Project row */}
              <div
                className="group relative flex items-center gap-2 px-3 py-2.5 mx-1.5 rounded-lg cursor-pointer transition-colors duration-100"
                style={{
                  backgroundColor: isSelected
                    ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                    : isHovered
                      ? 'color-mix(in srgb, var(--accent) 6%, transparent)'
                      : 'transparent',
                }}
                onClick={() => handleProjectClick(project.id)}
                onMouseEnter={() => setHoveredId(project.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Chevron */}
                <div
                  className="shrink-0 flex items-center justify-center"
                  style={{
                    color: 'var(--text-secondary)',
                    width: '16px',
                    height: '16px',
                  }}
                >
                  <ChevronIcon expanded={isExpanded} />
                </div>

                {/* Project info */}
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-medium truncate"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {project.name}
                  </div>
                  <div
                    className="text-xs truncate mt-0.5"
                    style={{ color: 'var(--text-secondary)' }}
                    title={project.path}
                  >
                    {truncatePath(project.path)}
                  </div>
                </div>

                {/* Action buttons (visible on hover) */}
                {(isHovered || isSelected) && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditProject(project.id);
                      }}
                      className="p-1 rounded transition-colors duration-100 hover:bg-black/10 dark:hover:bg-white/10"
                      style={{ color: 'var(--text-secondary)' }}
                      title="Edit project"
                    >
                      <GearIcon />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteProject(project.id);
                      }}
                      className="p-1 rounded transition-colors duration-100 hover:bg-black/10 dark:hover:bg-white/10"
                      style={{ color: 'var(--text-secondary)' }}
                      title="Delete project"
                    >
                      <XIcon />
                    </button>
                  </div>
                )}
              </div>

              {/* Session list (when expanded) */}
              {isExpanded && (
                <div
                  style={{
                    marginLeft: '16px',
                    borderLeft: '2px solid var(--border)',
                  }}
                >
                  {projectSessions.map((session) => {
                    const isCurrentSession = session.id === selectedSessionId;
                    const isSessionHovered = session.id === hoveredSessionId;
                    const isRunning = session.status === 'running';

                    return (
                      <div
                        key={session.id}
                        className="relative flex items-center gap-2 cursor-pointer transition-colors duration-100"
                        style={{
                          padding: '8px 12px',
                          fontSize: '12px',
                          backgroundColor: isRunning
                            ? 'rgba(34,197,94,0.06)'
                            : isCurrentSession
                              ? 'color-mix(in srgb, #6495ed 12%, transparent)'
                              : isSessionHovered
                                ? 'color-mix(in srgb, var(--accent) 4%, transparent)'
                                : 'transparent',
                        }}
                        onClick={() => onSelectSession(session.id)}
                        onMouseEnter={() => setHoveredSessionId(session.id)}
                        onMouseLeave={() => setHoveredSessionId(null)}
                      >
                        {/* Session dot indicator */}
                        {isRunning ? (
                          <span
                            className="shrink-0"
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: '#22c55e',
                              animation: 'pulse 2s infinite',
                              display: 'inline-block',
                            }}
                          />
                        ) : (
                          <span
                            className="shrink-0 text-[10px] leading-none"
                            style={{
                              color: isCurrentSession ? '#6495ed' : 'var(--text-secondary)',
                              opacity: isCurrentSession ? 1 : 0.5,
                            }}
                          >
                            {isCurrentSession ? '●' : '○'}
                          </span>
                        )}

                        {/* Session title + running tag + time */}
                        <div className="flex-1 min-w-0 flex items-center gap-1.5">
                          <span
                            className="truncate"
                            style={{
                              color: isRunning
                                ? '#22c55e'
                                : isCurrentSession
                                  ? 'var(--text-primary)'
                                  : 'var(--text-secondary)',
                              fontWeight: isCurrentSession ? 500 : 400,
                            }}
                          >
                            {session.title}
                          </span>
                          {isRunning && (
                            <span
                              className="shrink-0"
                              style={{
                                fontSize: '10px',
                                color: '#22c55e',
                                background: 'rgba(34,197,94,0.15)',
                                padding: '1px 6px',
                                borderRadius: '4px',
                              }}
                            >
                              运行中
                            </span>
                          )}
                          {!isRunning && (
                            <span
                              className="shrink-0 text-[11px]"
                              style={{
                                color: 'var(--text-secondary)',
                                opacity: 0.6,
                              }}
                            >
                              {relativeTime(session.updatedAt)}
                            </span>
                          )}
                        </div>

                        {/* Delete button (visible on hover) */}
                        {isSessionHovered && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const confirmed = window.confirm(
                                `确定删除会话「${session.title}」吗？此操作不可撤销。`
                              );
                              if (confirmed) {
                                onDeleteSession(session.id);
                              }
                            }}
                            className="p-0.5 rounded transition-colors duration-100 hover:bg-black/10 dark:hover:bg-white/10 shrink-0"
                            style={{ color: 'var(--text-secondary)' }}
                            title="Delete session"
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Empty sessions state */}
                  {projectSessions.length === 0 && (
                    <div
                      className="text-xs text-center py-3 px-3"
                      style={{ color: 'var(--text-secondary)', opacity: 0.6, fontSize: '11px' }}
                    >
                      No sessions yet
                    </div>
                  )}

                  {/* New Session button */}
                  <div className="px-3 py-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNewSession();
                      }}
                      className="
                        w-full flex items-center justify-center gap-1
                        py-1.5 px-2 rounded-md text-xs
                        transition-colors duration-100
                        hover:bg-black/5 dark:hover:bg-white/5
                      "
                      style={{
                        color: '#6495ed',
                        border: '1px dashed var(--border)',
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      New Session
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {projects.length === 0 && (
          <div
            className="text-xs text-center py-8 px-4"
            style={{ color: 'var(--text-secondary)' }}
          >
            No projects yet. Add one below.
          </div>
        )}
      </div>

      {/* Add project button */}
      <div
        className="p-3 shrink-0"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <button
          onClick={onAddProject}
          className="
            w-full flex items-center justify-center gap-1.5
            py-2 px-3 rounded-lg text-sm font-medium
            transition-colors duration-100
            hover:bg-black/5 dark:hover:bg-white/5
          "
          style={{
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Project
        </button>
      </div>
    </aside>
  );
}
