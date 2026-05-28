'use client';

import { useState, useCallback, useRef, useEffect, KeyboardEvent } from 'react';
import { parseTrigger } from '@/lib/commands';
import { useChatSession, BackgroundRun } from '@/hooks/useChatSession';
import { useProjectList } from '@/hooks/useProjectList';
import { useSessionList } from '@/hooks/useSessionList';
import { BottomNavBar } from './BottomNavBar';
import { MobileChatView } from './MobileChatView';
import { MobileHistoryView } from './MobileHistoryView';
import { MobileSettingsView } from './MobileSettingsView';

type Tab = 'chat' | 'history' | 'settings';

export function MobileLayout() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [navBarVisible, setNavBarVisible] = useState(true);

  // ── Shared state ──
  const backgroundRunsRef = useRef<Map<string, BackgroundRun>>(new Map());
  const [bgVersion, setBgVersion] = useState(0);
  const bumpBg = useCallback(() => setBgVersion(v => v + 1), []);

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

  // ── UI state ──
  const [input, setInput] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [paletteVisible, setPaletteVisible] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputBarRef = useRef<HTMLDivElement>(null);

  // ── Stable refs for effect deps ──
  const setSessionsRef = useRef(sessionList.setSessions);
  const setSelectedSessionIdRef = useRef(chat.setSelectedSessionId);
  const setMessagesRef = useRef(chat.setMessages);
  const syncBgStatusRef = useRef(sessionList.syncBgStatus);
  const loadSessionsRef = useRef(sessionList.loadSessions);
  setSessionsRef.current = sessionList.setSessions;
  setSelectedSessionIdRef.current = chat.setSelectedSessionId;
  setMessagesRef.current = chat.setMessages;
  syncBgStatusRef.current = sessionList.syncBgStatus;
  loadSessionsRef.current = sessionList.loadSessions;

  // ── Load sessions when project changes ──
  useEffect(() => {
    const pid = projectList.selectedProjectId;
    if (!pid) {
      setSessionsRef.current([]);
      setSelectedSessionIdRef.current(null);
      return;
    }
    loadSessionsRef.current(pid);
    fetch(`/api/sessions?projectId=${pid}`)
      .then(r => r.ok ? r.json() : { sessions: [] })
      .then(data => {
        if (data.sessions?.length > 0) {
          setSelectedSessionIdRef.current(data.sessions[0].id);
          fetch(`/api/sessions/${data.sessions[0].id}`)
            .then(r => r.ok ? r.json() : null)
            .then(sData => {
              if (sData?.session?.messages) {
                setMessagesRef.current(sData.session.messages);
              }
            });
        }
      });
  }, [projectList.selectedProjectId]);

  // ── Sync bg status ──
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

  // ── Visual viewport ──
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      if (inputBarRef.current) {
        inputBarRef.current.style.bottom = `${window.innerHeight - vv.height - vv.offsetTop}px`;
      }
      setNavBarVisible(window.innerHeight === vv.height);
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, []);

  // ── Handlers ──
  const handleSelectProject = useCallback((id: string) => {
    chat.moveCurrentToBackground(chat.selectedSessionId, projectList.selectedProjectId, chat.claudeSessionId);
    chat.setMessages([]);
    chat.setIsLoading(false);
    projectList.selectProject(id);
  }, [chat, projectList]);

  const handleSelectSession = useCallback((sessionId: string) => {
    chat.selectSession(sessionId, chat.selectedSessionId, projectList.selectedProjectId);
    setActiveTab('chat');
  }, [chat, projectList]);

  const handleNewSession = useCallback(async () => {
    const pid = projectList.selectedProjectId;
    if (!pid) return;
    const sid = await sessionList.createSession(pid);
    if (sid) {
      chat.setSelectedSessionId(sid);
      chat.setMessages([]);
    }
    setActiveTab('chat');
  }, [projectList, sessionList, chat]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    const pid = projectList.selectedProjectId;
    if (!pid) return;
    await sessionList.deleteSession(sessionId, pid);
    chat.deleteSessionCleanup(sessionId);
  }, [projectList, sessionList, chat]);

  const handleSubmit = useCallback(async (eOrText: React.FormEvent | string) => {
    if (typeof eOrText !== 'string') eOrText.preventDefault();
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
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Pages container */}
      <div className="flex-1 min-h-0 relative">
        {/* Chat page — always mounted */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: activeTab === 'chat' ? 1 : 0,
            pointerEvents: activeTab === 'chat' ? 'auto' : 'none',
            transition: 'opacity 200ms ease',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <MobileChatView
            messages={chat.messages}
            isLoading={chat.isLoading}
            error={chat.error}
            connected={chat.connected}
            projectName={projectList.selectedProject?.name || ''}
            onClearError={() => chat.setError(null)}
            onSelectAnswer={chat.handleAnswer}
            onQuickAction={handleQuickAction}
            input={input}
            setInput={setInput}
            cursorPos={cursorPos}
            setCursorPos={setCursorPos}
            paletteVisible={paletteVisible}
            setPaletteVisible={setPaletteVisible}
            textareaRef={textareaRef}
            inputBarRef={inputBarRef}
            onSubmit={handleSubmit}
            adjustTextareaHeight={adjustTextareaHeight}
            selectedProject={projectList.selectedProject}
          />
        </div>

        {/* History page */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: activeTab === 'history' ? 1 : 0,
            pointerEvents: activeTab === 'history' ? 'auto' : 'none',
            transition: 'opacity 200ms ease',
            overflowY: 'auto',
          }}
        >
          <MobileHistoryView
            projects={projectList.projects}
            selectedProjectId={projectList.selectedProjectId}
            sessions={sessionList.sessions}
            selectedSessionId={chat.selectedSessionId}
            onSelectProject={handleSelectProject}
            onSelectSession={handleSelectSession}
            onNewSession={handleNewSession}
            onDeleteSession={handleDeleteSession}
          />
        </div>

        {/* Settings page */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: activeTab === 'settings' ? 1 : 0,
            pointerEvents: activeTab === 'settings' ? 'auto' : 'none',
            transition: 'opacity 200ms ease',
            overflowY: 'auto',
          }}
        >
          <MobileSettingsView
            projects={projectList.projects}
            onAddProject={projectList.addProject}
            onDeleteProject={projectList.deleteProject}
            onSaveProject={projectList.saveProject}
            editingProject={projectList.editingProject}
          />
        </div>
      </div>

      {/* Bottom nav */}
      <BottomNavBar activeTab={activeTab} onTabChange={setActiveTab} visible={navBarVisible} />
    </div>
  );
}
