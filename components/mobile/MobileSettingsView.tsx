'use client';

import { useState } from 'react';
import type { Project } from '@/lib/projects';

interface MobileSettingsViewProps {
  projects: Project[];
  onAddProject: () => void;
  onDeleteProject: (id: string) => void;
  onSaveProject: (data: { name: string; path: string }) => void;
  editingProject: Project | undefined;
}

export function MobileSettingsView({
  projects,
  onAddProject,
  onDeleteProject,
}: MobileSettingsViewProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <div
        className="shrink-0 flex items-center justify-center px-4"
        style={{
          height: '48px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          设置
        </span>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              项目列表
            </span>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="text-xs px-2.5 py-1 rounded-lg"
              style={{ color: '#6495ed', backgroundColor: 'rgba(100,149,237,0.1)' }}
            >
              {showAddForm ? '取消' : '+ 添加'}
            </button>
          </div>

          {/* Add form */}
          {showAddForm && (
            <div
              className="mb-3 p-3 rounded-xl"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="项目名称"
                className="w-full text-sm px-3 py-2 rounded-lg mb-2 outline-none"
                style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
              <input
                value={newPath}
                onChange={e => setNewPath(e.target.value)}
                placeholder="项目路径"
                className="w-full text-sm px-3 py-2 rounded-lg mb-2 outline-none"
                style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
              <button
                onClick={() => {
                  if (newName.trim() && newPath.trim()) {
                    onAddProject();
                    // Use AddProjectModal flow instead for consistency
                    setNewName('');
                    setNewPath('');
                    setShowAddForm(false);
                  }
                }}
                className="w-full py-2 rounded-lg text-sm font-medium text-white"
                style={{ backgroundColor: '#6495ed' }}
              >
                添加项目
              </button>
            </div>
          )}

          {/* Projects */}
          {projects.map(p => (
            <div
              key={p.id}
              className="flex items-center gap-3 py-3"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {p.name}
                </div>
                <div className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {p.path}
                </div>
              </div>
              <button
                onClick={() => {
                  const confirmed = window.confirm(`确定删除项目「${p.name}」吗？`);
                  if (confirmed) onDeleteProject(p.id);
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
          ))}

          {projects.length === 0 && (
            <div className="text-center py-8 text-xs" style={{ color: 'var(--text-secondary)' }}>
              暂无项目
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
