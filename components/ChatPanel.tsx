'use client';

import { useState, useCallback, useRef, useEffect, KeyboardEvent } from 'react';
import { MessageList } from './MessageList';
import { CommandPalette } from './CommandPalette';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { AddProjectModal } from './AddProjectModal';
import { EmptyState } from './EmptyState';
import { parseTrigger } from '@/lib/commands';
import { useChatSession } from '@/hooks/useChatSession';
import type { BackgroundRun } from '@/hooks/useChatSession';
import { useProjectList } from '@/hooks/useProjectList';
import { useSessionList } from '@/hooks/useSessionList';

export type { BackgroundRun, Message } from '@/hooks/useChatSession';

export function ChatPanel() {
  // ── Background runs (shared across hooks) ──
  const backgroundRunsRef = useRef<Map<string, BackgroundRun>>(new Map());
  const [bgVersion, setBgVersion] = useState(0);
  const bumpBg = useCallback(() => setBgVersion(v => v + 1), []);

  // ── Hooks ──
  const projectList = useProjectList({
    backgroundRunsRef,
    onBgVersionBump: bumpBg,
    onCancelStream: () => chat.cancelStream(),
    onResetMessages: () => chat.resetConversation(),
  });

  const sessionList = useSessionList({
    backgroundRunsRef,
    onBgVersionBump: bumpBg,
  });

  const chat = useChatSession({
    backgroundRunsRef,
    bgVersion,
    onBgVersionBump: bumpBg,
    onSessionsRefresh: sessionList.refreshSessions,
  });

  // ── UI-only state ──
  const [input, setInput] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [paletteVisible, setPaletteVisible] = useState(false);

  // ── DOM refs ──
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputBarRef = useRef<HTMLDivElement>(null);

  // ── Stable refs for effect deps ──
  const setSessionsRef = useRef(sessionList.setSessions);
  const setSelectedSessionIdRef = useRef(chat.setSelectedSessionId);
  const setMessagesRef = useRef(chat.setMessages);
  const syncBgStatusRef = useRef(sessionList.syncBgStatus);
  setSessionsRef.current = sessionList.setSessions;
  setSelectedSessionIdRef.current = chat.setSelectedSessionId;
  setMessagesRef.current = chat.setMessages;
  syncBgStatusRef.current = sessionList.syncBgStatus;

  // ── Load sessions when project changes ──
  useEffect(() => {
    const pid = projectList.selectedProjectId;
    if (!pid) {
      setSessionsRef.current([]);
      setSelectedSessionIdRef.current(null);
      return;
    }
    fetch(`/api/sessions?projectId=${pid}`)
      .then(r => r.ok ? r.json() : { sessions: [] })
      .then(data => {
        setSessionsRef.current(data.sessions || []);
        if (data.sessions?.length > 0) {
          setSelectedSessionIdRef.current(data.sessions[0].id);
          fetch(`/api/sessions/${data.sessions[0].id}`)
            .then(r => r.ok ? r.json() : null)
            .then(sData => {
              if (sData?.session?.messages) {
                setMessagesRef.current(sData.session.messages);
              }
            });
        } else {
          setSelectedSessionIdRef.current(null);
        }
      });
  }, [projectList.selectedProjectId]);

  // ── Sync bg status to sessions ──
  useEffect(() => {
    syncBgStatusRef.current();
  }, [bgVersion]);

  // ── Auto-resize textarea ──
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = 120;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    if (!input && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.overflowY = 'hidden';
    }
  }, [input]);

  // ── Visual viewport for virtual keyboard ──
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

  // ── Project handlers (delegating to hooks) ──
  const handleSelectProject = useCallback((id: string) => {
    chat.moveCurrentToBackground(
      chat.selectedSessionId,
      projectList.selectedProjectId,
      chat.claudeSessionId,
    );
    chat.setMessages([]);
    chat.setIsLoading(false);
    chat.setClaudeSessionId(null);
    chat.setSelectedSessionId(null);
    projectList.selectProject(id);
  }, [chat, projectList]);

  const handleSelectSession = useCallback((sessionId: string) => {
    chat.selectSession(sessionId, chat.selectedSessionId, projectList.selectedProjectId);
  }, [chat, projectList]);

  const handleNewSession = useCallback(async () => {
    const pid = projectList.selectedProjectId;
    if (!pid) return;
    const sid = await sessionList.createSession(pid);
    if (sid) {
      chat.setSelectedSessionId(sid);
      chat.setMessages([]);
    }
  }, [projectList, sessionList, chat]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    const pid = projectList.selectedProjectId;
    if (!pid) return;
    await sessionList.deleteSession(sessionId, pid);
    chat.deleteSessionCleanup(sessionId);
  }, [projectList, sessionList, chat]);

  // ── Submit ──
  const handleSubmit = useCallback(async (eOrText: React.FormEvent | string) => {
    if (typeof eOrText !== 'string') {
      eOrText.preventDefault();
    }
    const text = typeof eOrText === 'string' ? eOrText : input.trim();
    if (!text) return;

    setInput('');
    setPaletteVisible(false);

    await chat.sendMessage(
      text,
      projectList.selectedProject?.path,
      chat.selectedSessionId,
      projectList.selectedProjectId,
      async () => {
        const pid = projectList.selectedProjectId;
        if (!pid) return null;
        const sid = await sessionList.createSession(pid);
        if (sid) chat.setSelectedSessionId(sid);
        return sid;
      },
    );
  }, [input, chat, projectList, sessionList]);

  // ── Quick action ──
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
        className={`sidebar-panel shrink-0 ${projectList.sidebarCollapsed ? 'sidebar-collapsed' : ''}`}
        style={{
          width: projectList.sidebarCollapsed ? '0px' : '280px',
          overflow: 'hidden',
        }}
      >
        <Sidebar
          projects={projectList.projects}
          selectedId={projectList.selectedProjectId}
          sessions={sessionList.sessions}
          selectedSessionId={chat.selectedSessionId}
          onSelectProject={handleSelectProject}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onAddProject={projectList.addProject}
          onEditProject={projectList.editProject}
          onDeleteProject={projectList.deleteProject}
        />
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-col flex-1 min-w-0">
        <Header
          projectName={projectList.selectedProject?.name || ''}
          connected={chat.connected}
          model="Claude"
          onToggleSidebar={projectList.toggleSidebar}
        />

        {chat.error && (
          <div className="px-4 py-2 shrink-0">
            <div
              className="p-3 rounded-xl text-sm"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#dc2626',
                border: '1px solid rgba(239, 68, 68, 0.2)',
              }}
            >
              {chat.error}
              <button
                onClick={() => chat.setError(null)}
                className="ml-2 underline opacity-70 hover:opacity-100 transition-opacity"
              >
                关闭
              </button>
            </div>
          </div>
        )}

        {chat.messages.length === 0 ? (
          <EmptyState onQuickAction={handleQuickAction} />
        ) : (
          <MessageList messages={chat.messages} onSelectAnswer={chat.handleAnswer} />
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
              {paletteVisible && (
                <CommandPalette
                  input={input}
                  cursorPos={cursorPos}
                  cwd={projectList.selectedProject?.path}
                  onSelect={(replacement: string) => {
                    const trigger = parseTrigger(input, cursorPos);
                    if (trigger.type === null || trigger.triggerStart < 0) {
                      setPaletteVisible(false);
                      return;
                    }

                    const newText =
                      input.slice(0, trigger.triggerStart) +
                      replacement +
                      input.slice(cursorPos);

                    setInput(newText);
                    setPaletteVisible(false);

                    requestAnimationFrame(() => {
                      const textarea = textareaRef.current;
                      if (textarea) {
                        const newCursorPos = trigger.triggerStart + replacement.length;
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
                    if (paletteVisible) return;
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder="输入消息，或使用 / 触发命令..."
                disabled={chat.isLoading}
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

              <button
                type="submit"
                disabled={chat.isLoading || !input.trim()}
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
                  backgroundColor: (chat.isLoading || !input.trim()) ? 'var(--bg-secondary)' : 'var(--bg-user-bubble)',
                  /* @ts-expect-error CSS custom property */
                  '--tw-ring-color': 'var(--accent)',
                }}
                aria-label="发送消息"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={chat.isLoading || !input.trim() ? 'var(--text-secondary)' : '#ffffff'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            </div>

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
        open={projectList.modalOpen}
        project={projectList.editingProject}
        onClose={projectList.closeModal}
        onSave={projectList.saveProject}
      />
    </div>
  );
}
