'use client';

import { useState } from 'react';
import type { Project } from '@/lib/projects';
import type { SessionMeta } from '@/lib/sessions';

function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

interface MobileHistoryViewProps {
  projects: Project[];
  selectedProjectId: string | null;
  sessions: SessionMeta[];
  selectedSessionId: string | null;
  onSelectProject: (id: string) => void;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
}

export function MobileHistoryView({
  projects,
  selectedProjectId,
  sessions,
  selectedSessionId,
  onSelectProject,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: MobileHistoryViewProps) {
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  const currentProject = projects.find(p => p.id === selectedProjectId);

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <div
        className="shrink-0 flex items-center justify-between px-4"
        style={{
          height: '48px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <button
          onClick={() => setShowProjectPicker(!showProjectPicker)}
          className="flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          {currentProject?.name || '选择项目'}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <button
          onClick={onNewSession}
          className="text-xs px-2.5 py-1 rounded-lg"
          style={{ color: '#6495ed', backgroundColor: 'rgba(100,149,237,0.1)' }}
        >
          + 新会话
        </button>
      </div>

      {/* Project picker dropdown */}
      {showProjectPicker && (
        <div
          className="shrink-0"
          style={{
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => { onSelectProject(p.id); setShowProjectPicker(false); }}
              className="w-full text-left px-4 py-3 text-sm flex items-center gap-2 active:bg-black/5"
              style={{
                color: p.id === selectedProjectId ? '#6495ed' : 'var(--text-primary)',
                backgroundColor: p.id === selectedProjectId ? 'rgba(100,149,237,0.06)' : 'transparent',
              }}
            >
              {p.id === selectedProjectId && (
                <span className="text-[10px]">●</span>
              )}
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-xs" style={{ color: 'var(--text-secondary)' }}>
            暂无会话
          </div>
        ) : (
          sessions.map(session => {
            const isActive = session.id === selectedSessionId;
            const isRunning = session.status === 'running';
            return (
              <div
                key={session.id}
                className="flex items-center gap-3 px-4 py-3 active:bg-black/5"
                style={{
                  borderBottom: '1px solid var(--border)',
                  backgroundColor: isActive ? 'rgba(100,149,237,0.06)' : 'transparent',
                }}
                onClick={() => onSelectSession(session.id)}
              >
                {/* Status dot */}
                {isRunning ? (
                  <span
                    className="shrink-0"
                    style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: '#22c55e', animation: 'pulse 2s infinite', display: 'inline-block',
                    }}
                  />
                ) : (
                  <span
                    className="shrink-0"
                    style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      border: isActive ? '2px solid #6495ed' : '1.5px solid var(--text-secondary)',
                      opacity: isActive ? 1 : 0.4,
                    }}
                  />
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm truncate"
                    style={{
                      color: isRunning ? '#22c55e' : isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: isActive ? 500 : 400,
                    }}
                  >
                    {session.title}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {isRunning && (
                      <span className="text-[10px]" style={{ color: '#22c55e', background: 'rgba(34,197,94,0.15)', padding: '0 4px', borderRadius: '3px' }}>
                        运行中
                      </span>
                    )}
                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                      {relativeTime(session.updatedAt)}
                    </span>
                  </div>
                </div>

                {/* Delete button — always visible on mobile */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const confirmed = window.confirm(`确定删除会话「${session.title}」吗？`);
                    if (confirmed) onDeleteSession(session.id);
                  }}
                  className="shrink-0 p-1.5 rounded-lg active:bg-black/10"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
