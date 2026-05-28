'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Project } from '@/lib/projects';
import type { BackgroundRun } from '@/hooks/useChatSession';

interface UseProjectListOptions {
  backgroundRunsRef: React.MutableRefObject<Map<string, BackgroundRun>>;
  onBgVersionBump: () => void;
  onCancelStream: () => void;
  onResetMessages: () => void;
}

export function useProjectList(opts: UseProjectListOptions) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | undefined>(undefined);
  const projectsLoadedRef = useRef(false);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;

  // Load projects on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/projects');
        if (!res.ok) return;
        const data: Project[] = await res.json();
        if (cancelled) return;
        setProjects(data);
        const storedId = localStorage.getItem('selectedProjectId');
        if (storedId && data.some((p) => p.id === storedId)) {
          setSelectedProjectId(storedId);
        } else if (data.length > 0) {
          setSelectedProjectId(data[0].id);
          localStorage.setItem('selectedProjectId', data[0].id);
        }
        projectsLoadedRef.current = true;
      } catch {
        projectsLoadedRef.current = true;
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Persist sidebar collapsed
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Persist selected project
  useEffect(() => {
    if (selectedProjectId) {
      localStorage.setItem('selectedProjectId', selectedProjectId);
    }
  }, [selectedProjectId]);

  const selectProject = useCallback((id: string) => {
    if (id === selectedProjectId) return;
    setSelectedProjectId(id);
    localStorage.setItem('selectedProjectId', id);
  }, [selectedProjectId]);

  const addProject = useCallback(() => {
    setEditingProject(undefined);
    setModalOpen(true);
  }, []);

  const editProject = useCallback((id: string) => {
    const project = projects.find((p) => p.id === id);
    setEditingProject(project);
    setModalOpen(true);
  }, [projects]);

  const deleteProject = useCallback(async (id: string) => {
    try {
      // Clean up background runs for this project
      const toDelete: string[] = [];
      opts.backgroundRunsRef.current.forEach((bgRun, sessionId) => {
        if (bgRun.projectId === id) {
          bgRun.reader.cancel().catch(() => {});
          bgRun.abortController.abort();
          if (bgRun.runId) {
            fetch(`/api/runs/${bgRun.runId}/cancel`, { method: 'POST' }).catch(() => {});
          }
          toDelete.push(sessionId);
        }
      });
      toDelete.forEach(sid => opts.backgroundRunsRef.current.delete(sid));
      opts.onBgVersionBump();

      const res = await fetch('/api/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) return;

      setProjects((prev) => prev.filter((p) => p.id !== id));

      if (id === selectedProjectId) {
        const remaining = projects.filter((p) => p.id !== id);
        if (remaining.length > 0) {
          const nextId = remaining[0].id;
          setSelectedProjectId(nextId);
          localStorage.setItem('selectedProjectId', nextId);
        } else {
          setSelectedProjectId(null);
          localStorage.removeItem('selectedProjectId');
        }
        opts.onResetMessages();
      }
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  }, [selectedProjectId, projects, opts]);

  const saveProject = useCallback(async (data: { name: string; path: string }) => {
    if (editingProject) {
      try {
        const res = await fetch('/api/projects', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingProject.id, name: data.name, path: data.path }),
        });
        if (!res.ok) return;
        const updated: Project = await res.json();
        setProjects((prev) => prev.map((p) => p.id === updated.id ? updated : p));
      } catch (err) {
        console.error('Failed to update project:', err);
      }
    } else {
      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: data.name, path: data.path }),
        });
        if (!res.ok) return;
        const newProject: Project = await res.json();
        setProjects((prev) => [...prev, newProject]);
        setSelectedProjectId(newProject.id);
        localStorage.setItem('selectedProjectId', newProject.id);
        opts.onResetMessages();
      } catch (err) {
        console.error('Failed to add project:', err);
      }
    }
    setModalOpen(false);
    setEditingProject(undefined);
  }, [editingProject, opts]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  return {
    projects,
    selectedProjectId,
    selectedProject,
    sidebarCollapsed,
    modalOpen,
    editingProject,
    projectsLoadedRef,
    selectProject,
    addProject,
    editProject,
    deleteProject,
    saveProject,
    toggleSidebar,
    closeModal: () => { setModalOpen(false); setEditingProject(undefined); },
  };
}
