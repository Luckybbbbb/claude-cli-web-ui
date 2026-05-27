'use client';

import { useState, useEffect, useRef } from 'react';
import type { Project } from '@/lib/projects';

interface AddProjectModalProps {
  open: boolean;
  project?: Project; // if provided, edit mode
  onClose: () => void;
  onSave: (data: { name: string; path: string }) => void;
}

export function AddProjectModal({ open, project, onClose, onSave }: AddProjectModalProps) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const isEditMode = !!project;

  // Pre-fill fields when project changes or modal opens
  useEffect(() => {
    if (open) {
      if (project) {
        setName(project.name);
        setPath(project.path);
      } else {
        setName('');
        setPath('');
      }
      setError(null);
      // Focus the name input after render
      requestAnimationFrame(() => {
        nameInputRef.current?.focus();
      });
    }
  }, [open, project]);

  const handleSave = () => {
    setError(null);

    if (!name.trim()) {
      setError('Project name is required.');
      return;
    }
    if (!path.trim()) {
      setError('Working directory path is required.');
      return;
    }

    onSave({ name: name.trim(), path: path.trim() });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md mx-4 rounded-xl overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Modal header */}
        <div
          className="px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2
            className="text-base font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            {isEditMode ? 'Edit Project' : 'Add Project'}
          </h2>
        </div>

        {/* Modal body */}
        <div className="px-5 py-4 space-y-4">
          {/* Project name */}
          <div>
            <label
              htmlFor="project-name"
              className="block text-xs font-medium mb-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              Project Name
            </label>
            <input
              id="project-name"
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-project"
              className="
                w-full px-3 py-2 rounded-lg text-sm
                input-focus-ring outline-none
              "
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Working directory */}
          <div>
            <label
              htmlFor="project-path"
              className="block text-xs font-medium mb-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              Working Directory
            </label>
            <input
              id="project-path"
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/absolute/path/to/project"
              className="
                w-full px-3 py-2 rounded-lg text-sm
                input-focus-ring outline-none
              "
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Error message */}
          {error && (
            <div
              className="text-xs px-3 py-2 rounded-lg"
              style={{
                color: '#dc2626',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.15)',
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-3"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            onClick={onClose}
            className="
              px-4 py-1.5 rounded-lg text-sm font-medium
              transition-colors duration-100
              hover:bg-black/5 dark:hover:bg-white/5
            "
            style={{
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="
              px-4 py-1.5 rounded-lg text-sm font-medium
              transition-colors duration-100
              text-white
              hover:opacity-90
            "
            style={{
              backgroundColor: 'var(--accent)',
            }}
          >
            {isEditMode ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
