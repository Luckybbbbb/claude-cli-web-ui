'use client';

import { useState, useCallback } from 'react';
import type { SessionMeta } from '@/lib/sessions';
import type { BackgroundRun } from '@/hooks/useChatSession';

interface UseSessionListOptions {
  backgroundRunsRef: React.MutableRefObject<Map<string, BackgroundRun>>;
  onBgVersionBump: () => void;
}

export function useSessionList(opts: UseSessionListOptions) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);

  const loadSessions = useCallback((projectId: string) => {
    fetch(`/api/sessions?projectId=${projectId}`)
      .then(r => r.ok ? r.json() : { sessions: [] })
      .then(data => setSessions(data.sessions || []))
      .catch(() => setSessions([]));
  }, []);

  const createSession = useCallback(async (projectId: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) return null;
      const { session } = await res.json();
      // Refresh list
      loadSessions(projectId);
      return session.id;
    } catch (err) {
      console.error('Failed to create session:', err);
      return null;
    }
  }, [loadSessions]);

  const refreshSessions = useCallback((projectId: string) => {
    loadSessions(projectId);
  }, [loadSessions]);

  const deleteSession = useCallback(async (sessionId: string, projectId: string) => {
    // Clean up background run if exists
    const bgRun = opts.backgroundRunsRef.current.get(sessionId);
    if (bgRun) {
      bgRun.reader.cancel().catch(() => {});
      bgRun.abortController.abort();
      if (bgRun.runId) {
        fetch(`/api/runs/${bgRun.runId}/cancel`, { method: 'POST' }).catch(() => {});
      }
      opts.backgroundRunsRef.current.delete(sessionId);
      opts.onBgVersionBump();
    }

    try {
      const res = await fetch('/api/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId }),
      });
      if (!res.ok) return false;
      loadSessions(projectId);
      return true;
    } catch (err) {
      console.error('Failed to delete session:', err);
      return false;
    }
  }, [opts, loadSessions]);

  const syncBgStatus = useCallback(() => {
    setSessions(prev => prev.map(s => {
      const isRunning = opts.backgroundRunsRef.current.has(s.id);
      return { ...s, status: isRunning ? 'running' as const : 'idle' as const };
    }));
  }, [opts]);

  return {
    sessions,
    setSessions,
    loadSessions,
    createSession,
    refreshSessions,
    deleteSession,
    syncBgStatus,
  };
}
