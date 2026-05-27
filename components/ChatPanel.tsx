'use client';

import { useState, useCallback, useRef, useEffect, KeyboardEvent } from 'react';
import { AgentEvent, ChatResponse } from '@/lib/types';
import { MessageList } from './MessageList';
import { CommandPalette } from './CommandPalette';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { AddProjectModal } from './AddProjectModal';
import { EmptyState } from './EmptyState';
import { parseTrigger } from '@/lib/commands';
import type { Project } from '@/lib/projects';
import type { SessionMeta } from '@/lib/sessions';

interface SessionData {
  id: string;
  projectId: string;
  title: string;
  cwd: string;
  claudeSessionId: string | null;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  events?: AgentEvent[];
  status?: string;
}

interface StreamContext {
  isBackground: boolean;
  activeSessionId: string;
  selectedProjectId: string | null;
}

interface BackgroundRun {
  sessionId: string;
  projectId: string;
  runId: string;
  reader: ReadableStreamDefaultReader;
  messages: Message[];
  claudeSessionId: string | null;
  abortController: AbortController;
  streamContext: StreamContext;
}

export function ChatPanel() {
  // ── Chat state ──
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messageCounter, setMessageCounter] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState(0);
  const [paletteVisible, setPaletteVisible] = useState(false);
  const [connected, setConnected] = useState(true);

  // ── Project state ──
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });

  // ── Session state ──
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(null);

  // ── AddProjectModal state ──
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | undefined>(undefined);

  // ── Refs ──
  const eventSourceRef = useRef<EventSource | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputBarRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);
  const projectsLoadedRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const currentRunIdRef = useRef<string | null>(null);
  const streamContextRef = useRef<StreamContext | null>(null);

  // ── Background runs ──
  const backgroundRunsRef = useRef<Map<string, BackgroundRun>>(new Map());
  const [bgVersion, setBgVersion] = useState(0);

  // ── Derived: selected project ──
  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;

  // ── Keep messagesRef in sync ──
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // ── Fetch projects on mount ──
  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      try {
        const res = await fetch('/api/projects');
        if (!res.ok) return;
        const data: Project[] = await res.json();

        if (cancelled) return;

        setProjects(data);

        // Restore selected project from localStorage
        const storedId = localStorage.getItem('selectedProjectId');

        if (storedId && data.some((p) => p.id === storedId)) {
          setSelectedProjectId(storedId);
        } else if (data.length > 0) {
          // Auto-select first project
          setSelectedProjectId(data[0].id);
          localStorage.setItem('selectedProjectId', data[0].id);
        }

        projectsLoadedRef.current = true;
      } catch (err) {
        console.error('Failed to load projects:', err);
        projectsLoadedRef.current = true;
      }
    }

    loadProjects();
    return () => { cancelled = true; };
  }, []);

  // ── Persist sidebar collapsed state ──
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // ── Persist selected project id ──
  useEffect(() => {
    if (selectedProjectId) {
      localStorage.setItem('selectedProjectId', selectedProjectId);
    }
  }, [selectedProjectId]);

  // ── Load sessions when project changes ──
  useEffect(() => {
    if (!selectedProjectId) { setSessions([]); setSelectedSessionId(null); return; }
    fetch(`/api/sessions?projectId=${selectedProjectId}`)
      .then(r => r.ok ? r.json() : { sessions: [] })
      .then(data => {
        setSessions(data.sessions || []);
        // Auto-select newest session
        if (data.sessions?.length > 0) {
          setSelectedSessionId(data.sessions[0].id);
          // Load full session data
          fetch(`/api/sessions/${data.sessions[0].id}`)
            .then(r => r.ok ? r.json() : null)
            .then(sData => {
              if (sData?.session?.messages) {
                setMessages(sData.session.messages);
                setClaudeSessionId(sData.session.claudeSessionId || null);
              }
            });
        }
      })
      .catch(() => setSessions([]));
  }, [selectedProjectId]);

  // ── Auto-resize textarea ──
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = 120;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    if (textarea.scrollHeight > maxHeight) {
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.overflowY = 'hidden';
    }
  }, []);

  // Reset textarea height when input is cleared
  useEffect(() => {
    if (!input) {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.overflowY = 'hidden';
      }
    }
  }, [input]);

  // visualViewport listener for virtual keyboard
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const onResize = () => {
      if (inputBarRef.current) {
        inputBarRef.current.style.bottom = `${window.innerHeight - vv.height - vv.offsetTop}px`;
      }
    };

    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, []);

  // Cleanup reader on unmount
  useEffect(() => {
    return () => {
      if (readerRef.current) {
        readerRef.current.cancel().catch(() => {});
      }
      // Cancel all background runs on unmount
      backgroundRunsRef.current.forEach((bgRun) => {
        bgRun.reader.cancel().catch(() => {});
        bgRun.abortController.abort();
      });
      backgroundRunsRef.current.clear();
    };
  }, []);

  // ── Sync background run status to sessions list ──
  useEffect(() => {
    // bgVersion is the trigger — reading it ensures this effect re-runs
    const version = bgVersion;
    void version;

    setSessions(prev => prev.map(s => {
      const isRunning = backgroundRunsRef.current.has(s.id);
      return { ...s, status: isRunning ? 'running' as const : 'idle' as const };
    }));
  }, [bgVersion]);

  // Helper to update the last assistant message immutably
  const updateLastAssistantMessage = useCallback((updater: (msg: Message) => Message) => {
    setMessages((prev) => {
      const newMessages = prev.map(msg => ({ ...msg }));
      const lastIndex = newMessages.length - 1;
      const lastMessage = newMessages[lastIndex];

      if (lastMessage && lastMessage.role === 'assistant') {
        newMessages[lastIndex] = updater(lastMessage);
      }

      return newMessages;
    });
  }, []);

  // Helper to update a background run's last assistant message
  const updateBgMessage = useCallback((sessionId: string, updater: (msg: Message) => Message) => {
    const bgRun = backgroundRunsRef.current.get(sessionId);
    if (!bgRun) return;
    const msgs = bgRun.messages;
    const lastIndex = msgs.length - 1;
    if (lastIndex >= 0 && msgs[lastIndex].role === 'assistant') {
      bgRun.messages = msgs.map((m, i) => i === lastIndex ? updater(m) : m);
    }
  }, []);

  // ── Cancel any running SSE stream ──
  const cancelStream = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.cancel().catch(() => {});
      readerRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // ── Reset conversation (clear messages + cancel stream) ──
  const resetConversation = useCallback(() => {
    cancelStream();
    setMessages([]);
    setIsLoading(false);
  }, [cancelStream]);

  // ── Project CRUD handlers ──

  const handleSelectProject = useCallback((id: string) => {
    if (id === selectedProjectId) return;

    // Move current running process to background if active
    if (readerRef.current && selectedSessionId) {
      const streamCtx = streamContextRef.current;
      if (streamCtx) {
        streamCtx.isBackground = true;
      }
      backgroundRunsRef.current.set(selectedSessionId, {
        sessionId: selectedSessionId,
        projectId: selectedProjectId!,
        runId: currentRunIdRef.current || '',
        reader: readerRef.current,
        messages: [...messagesRef.current],
        claudeSessionId,
        abortController: new AbortController(),
        streamContext: streamCtx!,
      });
      readerRef.current = null;
      currentRunIdRef.current = null;
      setBgVersion(v => v + 1);
    } else {
      cancelStream();
    }

    setMessages([]);
    setIsLoading(false);
    setSelectedProjectId(id);
    localStorage.setItem('selectedProjectId', id);
  }, [selectedProjectId, selectedSessionId, claudeSessionId, cancelStream]);

  const handleAddProject = useCallback(() => {
    setEditingProject(undefined);
    setModalOpen(true);
  }, []);

  const handleEditProject = useCallback((id: string) => {
    const project = projects.find((p) => p.id === id);
    setEditingProject(project);
    setModalOpen(true);
  }, [projects]);

  const handleDeleteProject = useCallback(async (id: string) => {
    try {
      // Clean up all background runs for this project
      const entriesToDelete: string[] = [];
      backgroundRunsRef.current.forEach((bgRun, sessionId) => {
        if (bgRun.projectId === id) {
          bgRun.reader.cancel().catch(() => {});
          bgRun.abortController.abort();
          if (bgRun.runId) {
            fetch(`/api/runs/${bgRun.runId}/cancel`, { method: 'POST' }).catch(() => {});
          }
          entriesToDelete.push(sessionId);
        }
      });
      entriesToDelete.forEach(sid => backgroundRunsRef.current.delete(sid));
      setBgVersion(v => v + 1);

      const res = await fetch('/api/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('Delete project error:', err.error);
        return;
      }

      setProjects((prev) => prev.filter((p) => p.id !== id));

      // If deleted the selected project, select another or clear
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
        resetConversation();
      }
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  }, [selectedProjectId, projects, resetConversation]);

  const handleModalSave = useCallback(async (data: { name: string; path: string }) => {
    if (editingProject) {
      // Update existing project
      try {
        const res = await fetch('/api/projects', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingProject.id, name: data.name, path: data.path }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error('Update project error:', err.error);
          return;
        }
        const updated: Project = await res.json();
        setProjects((prev) => prev.map((p) => p.id === updated.id ? updated : p));
      } catch (err) {
        console.error('Failed to update project:', err);
      }
    } else {
      // Add new project
      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: data.name, path: data.path }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error('Add project error:', err.error);
          return;
        }
        const newProject: Project = await res.json();
        setProjects((prev) => [...prev, newProject]);

        // Auto-select the newly added project
        setSelectedProjectId(newProject.id);
        localStorage.setItem('selectedProjectId', newProject.id);
        resetConversation();
      } catch (err) {
        console.error('Failed to add project:', err);
      }
    }
    setModalOpen(false);
    setEditingProject(undefined);
  }, [editingProject, resetConversation]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  // ── Session CRUD handlers ──

  const handleNewSession = useCallback(async () => {
    if (!selectedProjectId) return;
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProjectId }),
      });
      if (!res.ok) return;
      const { session } = await res.json();
      setSelectedSessionId(session.id);
      setClaudeSessionId(null);
      setMessages([]);
      // Refresh sessions list
      const listRes = await fetch(`/api/sessions?projectId=${selectedProjectId}`);
      if (listRes.ok) {
        const listData = await listRes.json();
        setSessions(listData.sessions || []);
      }
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  }, [selectedProjectId]);

  const handleSelectSession = useCallback(async (sessionId: string) => {
    if (sessionId === selectedSessionId) return;

    // Check if this session has a background run -> restore to foreground
    const bgRun = backgroundRunsRef.current.get(sessionId);
    if (bgRun) {
      // Cancel current foreground stream if any
      if (readerRef.current) {
        readerRef.current.cancel().catch(() => {});
      }
      // Restore background run to foreground
      backgroundRunsRef.current.delete(sessionId);
      bgRun.streamContext.isBackground = false;
      setSelectedSessionId(sessionId);
      setClaudeSessionId(bgRun.claudeSessionId);
      setMessages(bgRun.messages);
      readerRef.current = bgRun.reader;
      currentRunIdRef.current = bgRun.runId;
      streamContextRef.current = bgRun.streamContext;
      setIsLoading(true);
      setBgVersion(v => v + 1);
      return;
    }

    // Normal session load (existing logic)
    cancelStream();
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok) return;
      const { session } = await res.json();
      setSelectedSessionId(sessionId);
      setClaudeSessionId(session.claudeSessionId || null);
      setMessages(session.messages || []);
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  }, [selectedSessionId, cancelStream]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    // Clean up background run if exists
    const bgRun = backgroundRunsRef.current.get(sessionId);
    if (bgRun) {
      bgRun.reader.cancel().catch(() => {});
      bgRun.abortController.abort();
      if (bgRun.runId) {
        fetch(`/api/runs/${bgRun.runId}/cancel`, { method: 'POST' }).catch(() => {});
      }
      backgroundRunsRef.current.delete(sessionId);
      setBgVersion(v => v + 1);
    }

    try {
      const res = await fetch('/api/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId }),
      });
      if (!res.ok) return;
      // If deleted current session, clear messages
      if (sessionId === selectedSessionId) {
        setMessages([]);
        setSelectedSessionId(null);
        setClaudeSessionId(null);
      }
      // Refresh list
      if (selectedProjectId) {
        const listRes = await fetch(`/api/sessions?projectId=${selectedProjectId}`);
        if (listRes.ok) {
          const listData = await listRes.json();
          setSessions(listData.sessions || []);
        }
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  }, [selectedSessionId, selectedProjectId]);

  // ── Submit handler ──
  const handleSubmit = useCallback(async (eOrText: React.FormEvent | string) => {
    if (typeof eOrText !== 'string') {
      eOrText.preventDefault();
    }
    const text = typeof eOrText === 'string' ? eOrText : input.trim();
    if (!text || isLoading) return;

    // Auto-create session if none selected but project exists
    let activeSessionId = selectedSessionId;
    if (!activeSessionId && selectedProjectId) {
      try {
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: selectedProjectId }),
        });
        if (res.ok) {
          const { session } = await res.json();
          activeSessionId = session.id;
          setSelectedSessionId(session.id);
          // Refresh sessions list
          const listRes = await fetch(`/api/sessions?projectId=${selectedProjectId}`);
          if (listRes.ok) {
            const listData = await listRes.json();
            setSessions(listData.sessions || []);
          }
        }
      } catch (err) {
        console.error('Failed to auto-create session:', err);
      }
    }

    // Generate unique IDs using counter to avoid Date.now() collisions
    const userMessageId = `user-${messageCounter}`;
    const assistantMessageId = `assistant-${messageCounter + 1}`;
    setMessageCounter(prev => prev + 2);

    const userMessage: Message = {
      id: userMessageId,
      role: 'user',
      content: text,
    };

    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      events: [],
      status: 'running',
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput('');
    setPaletteVisible(false);
    setIsLoading(true);
    setConnected(true);

    try {
      // Build request body with cwd from selected project
      const requestBody: { message: string; cwd?: string; claudeSessionId?: string } = {
        message: userMessage.content,
      };
      if (selectedProject?.path) {
        requestBody.cwd = selectedProject.path;
      }
      if (claudeSessionId) {
        requestBody.claudeSessionId = claudeSessionId;
      }

      // Start the chat run
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to start chat`);
      }

      const { runId }: ChatResponse = await response.json();

      // Track current run and stream context for background run support
      currentRunIdRef.current = runId;
      const streamContext: StreamContext = {
        isBackground: false,
        activeSessionId: activeSessionId!,
        selectedProjectId,
      };
      streamContextRef.current = streamContext;

      // Use fetch to read SSE stream (more reliable than EventSource)
      const sseResponse = await fetch(`/api/runs/${runId}/events`);
      const reader = sseResponse.body!.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            let currentEvent = '';
            for (const line of lines) {
              if (line.startsWith('event:')) {
                currentEvent = line.substring(6).trim();
              } else if (line.startsWith('data:')) {
                try {
                  const data = JSON.parse(line.substring(5).trim());

                  if (currentEvent === 'agent') {
                    const agentUpdater = (msg: Message) => ({
                      ...msg,
                      events: [...(msg.events || []), data],
                      status: data.type === 'turn_end'
                        ? 'succeeded'
                        : data.type === 'error'
                          ? 'failed'
                          : msg.status
                    });

                    if (streamContext.isBackground && streamContext.activeSessionId) {
                      updateBgMessage(streamContext.activeSessionId, agentUpdater);
                    } else {
                      updateLastAssistantMessage(agentUpdater);
                    }
                    // Capture Claude session ID from agent events
                    if (data.sessionId) {
                      setClaudeSessionId(data.sessionId);
                      if (activeSessionId) {
                        fetch('/api/sessions', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: activeSessionId, claudeSessionId: data.sessionId }),
                        }).catch(() => {});
                      }
                    }
                  } else if (currentEvent === 'status') {
                    const statusUpdater = (msg: Message) => ({
                      ...msg,
                      status: data.status
                    });

                    if (streamContext.isBackground && streamContext.activeSessionId) {
                      updateBgMessage(streamContext.activeSessionId, statusUpdater);
                    } else {
                      updateLastAssistantMessage(statusUpdater);
                    }

                    if (data.status === 'succeeded' || data.status === 'failed' || data.status === 'canceled') {
                      reader.cancel();
                      if (!streamContext.isBackground) {
                        readerRef.current = null;
                        setIsLoading(false);
                      }
                      return;
                    }
                  }
                } catch (e) {
                  console.error('Failed to parse SSE data:', e);
                }
              }
            }
          }
        } catch (error) {
          console.error('SSE stream error:', error);
          if (!streamContext.isBackground) {
            setConnected(false);
          }
        } finally {
          if (streamContext.isBackground) {
            // Background mode: persist from background run messages
            const bgRun = backgroundRunsRef.current.get(streamContext.activeSessionId);
            if (bgRun) {
              const msgs = bgRun.messages;
              const title = msgs.length > 0 && msgs[0].role === 'user'
                ? msgs[0].content.slice(0, 50)
                : undefined;
              fetch('/api/sessions', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: streamContext.activeSessionId, messages: msgs, title }),
              }).catch(() => {});
              // Remove from background runs
              backgroundRunsRef.current.delete(streamContext.activeSessionId);
              setBgVersion(v => v + 1);
            }
          } else {
            // Foreground mode: existing logic
            readerRef.current = null;
            setIsLoading(false);
            if (activeSessionId) {
              const currentMsgs = messagesRef.current;
              const title = currentMsgs.length > 0 && currentMsgs[0].role === 'user'
                ? currentMsgs[0].content.slice(0, 50)
                : undefined;
              fetch('/api/sessions', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: activeSessionId, messages: currentMsgs, title }),
              }).catch(() => {});
              // Refresh session list
              if (selectedProjectId) {
                fetch(`/api/sessions?projectId=${selectedProjectId}`)
                  .then(r => r.ok ? r.json() : { sessions: [] })
                  .then(d => setSessions(d.sessions || []))
                  .catch(() => {});
              }
            }
          }
        }
      };

      processStream();
    } catch (error) {
      console.error('Chat error:', error);
      setIsLoading(false);
      setConnected(false);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(errorMessage);

      updateLastAssistantMessage((msg) => ({
        ...msg,
        status: 'failed',
        events: [
          ...(msg.events || []),
          { type: 'error', message: `Failed to start chat: ${errorMessage}` } as AgentEvent,
        ]
      }));
    }
  }, [input, isLoading, messageCounter, updateLastAssistantMessage, updateBgMessage, selectedProject, selectedSessionId, selectedProjectId, claudeSessionId]);

  // Handle AskUserQuestion answer: send tool_result via stdin round-trip
  const handleAnswer = useCallback(async (toolUseId: string, answer: string) => {
    const runId = currentRunIdRef.current;
    if (!runId) return;
    try {
      await fetch(`/api/runs/${runId}/tool-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolUseId, content: answer }),
      });
    } catch (err) {
      console.error('Failed to submit answer:', err);
    }
  }, []);

  // Quick action handler: fill input with preset prompt
  const handleQuickAction = useCallback((prompt: string) => {
    setInput(prompt);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(prompt.length, prompt.length);
        adjustTextareaHeight();
      }
    });
  }, [adjustTextareaHeight]);

  return (
    <div
      className="flex h-screen"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* ── Sidebar ── */}
      <div
        className={`sidebar-panel shrink-0 ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}
        style={{
          width: sidebarCollapsed ? '0px' : '280px',
          overflow: 'hidden',
        }}
      >
        <Sidebar
          projects={projects}
          selectedId={selectedProjectId}
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          onSelectProject={handleSelectProject}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onAddProject={handleAddProject}
          onEditProject={handleEditProject}
          onDeleteProject={handleDeleteProject}
        />
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <Header
          projectName={selectedProject?.name || ''}
          connected={connected}
          model="Claude"
          onToggleSidebar={handleToggleSidebar}
        />

        {/* Error banner */}
        {error && (
          <div className="px-4 py-2 shrink-0">
            <div
              className="p-3 rounded-xl text-sm"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#dc2626',
                border: '1px solid rgba(239, 68, 68, 0.2)',
              }}
            >
              {error}
              <button
                onClick={() => setError(null)}
                className="ml-2 underline opacity-70 hover:opacity-100 transition-opacity"
              >
                关闭
              </button>
            </div>
          </div>
        )}

        {/* Content area: EmptyState or MessageList */}
        {messages.length === 0 ? (
          <EmptyState onQuickAction={handleQuickAction} />
        ) : (
          <MessageList messages={messages} onSelectAnswer={handleAnswer} />
        )}

        {/* Input bar */}
        <div
          ref={inputBarRef}
          className="sticky bottom-0 shrink-0 input-bar-safe"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <form
            onSubmit={handleSubmit}
            className="max-w-3xl mx-auto px-4 py-3 sm:py-4"
          >
            <div className="relative flex items-end">
              {/* Command palette popover */}
              {paletteVisible && (
                <CommandPalette
                  input={input}
                  cursorPos={cursorPos}
                  cwd={selectedProject?.path}
                  onSelect={(replacement: string) => {
                    const trigger = parseTrigger(input, cursorPos);
                    if (trigger.type === null) {
                      setPaletteVisible(false);
                      return;
                    }
                    // Find the start of the trigger in the text before cursor
                    const textBeforeCursor = input.slice(0, cursorPos);
                    const lastNewline = textBeforeCursor.lastIndexOf('\n');
                    const lineBeforeCursor = textBeforeCursor.slice(lastNewline + 1);

                    let triggerStartInLine = -1;
                    if (trigger.type === 'command') {
                      if (lineBeforeCursor.startsWith('/')) {
                        triggerStartInLine = 0;
                      } else {
                        const lastSlash = lineBeforeCursor.lastIndexOf('/');
                        if (lastSlash > 0 && lineBeforeCursor[lastSlash - 1] === ' ') {
                          triggerStartInLine = lastSlash;
                        }
                      }
                    } else if (trigger.type === 'file' || trigger.type === 'url') {
                      const atIndex = lineBeforeCursor.lastIndexOf('@');
                      if (atIndex >= 0) {
                        triggerStartInLine = atIndex;
                      }
                    }

                    if (triggerStartInLine < 0) {
                      setPaletteVisible(false);
                      return;
                    }

                    const triggerStartInInput = lastNewline + 1 + triggerStartInLine;
                    const newText =
                      input.slice(0, triggerStartInInput) +
                      replacement +
                      input.slice(cursorPos);

                    setInput(newText);
                    setPaletteVisible(false);

                    // Restore focus to textarea
                    requestAnimationFrame(() => {
                      const textarea = textareaRef.current;
                      if (textarea) {
                        const newCursorPos = triggerStartInInput + replacement.length;
                        textarea.focus();
                        textarea.setSelectionRange(newCursorPos, newCursorPos);
                        adjustTextareaHeight();
                      }
                    });
                  }}
                  onClose={() => {
                    setPaletteVisible(false);
                  }}
                />
              )}

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setCursorPos(e.target.selectionStart ?? e.target.value.length);
                  adjustTextareaHeight();
                  const trigger = parseTrigger(e.target.value, e.target.selectionStart ?? e.target.value.length);
                  setPaletteVisible(trigger.type !== null);
                }}
                onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                  if (e.key === 'Escape' && paletteVisible) {
                    e.preventDefault();
                    setPaletteVisible(false);
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    if (paletteVisible) {
                      // Let CommandPalette handle Enter for selection
                      return;
                    }
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder="输入消息，或使用 / 触发命令..."
                disabled={isLoading}
                rows={1}
                className="
                  flex-1 resize-none text-base px-4 py-3
                  rounded-2xl
                  input-focus-ring
                  outline-none
                  disabled:opacity-50
                  overflow-y-hidden
                "
                style={{
                  maxHeight: '120px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />

              {/* Circular send button */}
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="
                  ml-2 shrink-0 w-10 h-10
                  flex items-center justify-center
                  rounded-full
                  transition-all duration-100
                  disabled:opacity-40 disabled:cursor-not-allowed
                  hover:scale-105 active:scale-95
                  focus:outline-none focus-visible:ring-2
                "
                style={{
                  backgroundColor: (isLoading || !input.trim()) ? 'var(--bg-secondary)' : 'var(--bg-user-bubble)',
                  /* @ts-expect-error CSS custom property */
                  '--tw-ring-color': 'var(--accent)',
                }}
                aria-label="发送消息"
              >
                {/* Arrow up icon */}
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={isLoading || !input.trim() ? 'var(--text-secondary)' : '#ffffff'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            </div>

            {/* Hint text */}
            <div
              className="mt-1.5 text-center text-xs"
              style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
            >
              使用 / 触发命令 · 使用 @ 引用文件
            </div>
          </form>
        </div>
      </div>

      {/* ── Add/Edit Project Modal ── */}
      <AddProjectModal
        open={modalOpen}
        project={editingProject}
        onClose={() => {
          setModalOpen(false);
          setEditingProject(undefined);
        }}
        onSave={handleModalSave}
      />
    </div>
  );
}
