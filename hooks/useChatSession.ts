'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { AgentEvent, ChatResponse } from '@/lib/types';

// ── Types ──

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  events?: AgentEvent[];
  status?: string;
}

export interface StreamContext {
  isBackground: boolean;
  activeSessionId: string;
  selectedProjectId: string | null;
}

export interface BackgroundRun {
  sessionId: string;
  projectId: string;
  runId: string;
  reader: ReadableStreamDefaultReader;
  messages: Message[];
  claudeSessionId: string | null;
  abortController: AbortController;
  streamContext: StreamContext;
}

interface UseChatSessionOptions {
  backgroundRunsRef: React.MutableRefObject<Map<string, BackgroundRun>>;
  bgVersion: number;
  onBgVersionBump: () => void;
  onSessionsRefresh: (projectId: string) => void;
}

// ── Hook ──

export function useChatSession(opts: UseChatSessionOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [messageCounter, setMessageCounter] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(null);

  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const currentRunIdRef = useRef<string | null>(null);
  const streamContextRef = useRef<StreamContext | null>(null);

  // Sync messagesRef
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (readerRef.current) {
        readerRef.current.cancel().catch(() => {});
      }
      opts.backgroundRunsRef.current.forEach((bgRun) => {
        bgRun.reader.cancel().catch(() => {});
        bgRun.abortController.abort();
      });
      opts.backgroundRunsRef.current.clear();
    };
  }, []);

  // Sync bg status
  useEffect(() => {
    const version = opts.bgVersion;
    void version;
    // Delegate to useSessionList.syncBgStatus via callback
  }, [opts.bgVersion]);

  // ── Message update helpers ──

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

  const updateBgMessage = useCallback((sessionId: string, updater: (msg: Message) => Message) => {
    const bgRun = opts.backgroundRunsRef.current.get(sessionId);
    if (!bgRun) return;
    const msgs = bgRun.messages;
    const lastIndex = msgs.length - 1;
    if (lastIndex >= 0 && msgs[lastIndex].role === 'assistant') {
      bgRun.messages = msgs.map((m, i) => i === lastIndex ? updater(m) : m);
    }
  }, [opts]);

  // ── Stream management ──

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

  const resetConversation = useCallback(() => {
    cancelStream();
    setMessages([]);
    setIsLoading(false);
  }, [cancelStream]);

  // ── Send message ──

  const sendMessage = useCallback(async (
    text: string,
    cwd: string | undefined,
    activeSessionId: string | null,
    selectedProjectId: string | null,
    ensureSession: () => Promise<string | null>,
  ) => {
    if (!text || isLoading) return null;

    let sessionId = activeSessionId;
    if (!sessionId && selectedProjectId) {
      sessionId = await ensureSession();
    }
    if (!sessionId) return null;

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
    setIsLoading(true);
    setConnected(true);

    try {
      const requestBody: { message: string; cwd?: string; claudeSessionId?: string } = {
        message: userMessage.content,
      };
      if (cwd) requestBody.cwd = cwd;
      if (claudeSessionId) requestBody.claudeSessionId = claudeSessionId;

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

      currentRunIdRef.current = runId;
      const streamContext: StreamContext = {
        isBackground: false,
        activeSessionId: sessionId,
        selectedProjectId,
      };
      streamContextRef.current = streamContext;

      // Start SSE stream
      const sseResponse = await fetch(`/api/runs/${runId}/events`);
      const reader = sseResponse.body!.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';
      let agentEventCount = 0;

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
                    agentEventCount++;

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

                    // Incremental persistence: save every 10 agent events
                    if (agentEventCount % 10 === 0 && sessionId) {
                      fetch('/api/sessions', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: sessionId, messages: messagesRef.current }),
                      }).catch(() => {});
                    }

                    if (data.sessionId) {
                      setClaudeSessionId(data.sessionId);
                      if (sessionId) {
                        fetch('/api/sessions', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: sessionId, claudeSessionId: data.sessionId }),
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
            const bgRun = opts.backgroundRunsRef.current.get(streamContext.activeSessionId);
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
              opts.backgroundRunsRef.current.delete(streamContext.activeSessionId);
              opts.onBgVersionBump();
            }
          } else {
            readerRef.current = null;
            setIsLoading(false);
            const currentMsgs = messagesRef.current;
            const title = currentMsgs.length > 0 && currentMsgs[0].role === 'user'
              ? currentMsgs[0].content.slice(0, 50)
              : undefined;
            fetch('/api/sessions', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: sessionId, title }),
            }).catch(() => {});
            if (selectedProjectId) {
              opts.onSessionsRefresh(selectedProjectId);
            }
          }
        }
      };

      processStream();
      return { runId, sessionId };
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
      return null;
    }
  }, [isLoading, messageCounter, claudeSessionId, updateLastAssistantMessage, updateBgMessage, opts]);

  // ── Select session ──

  const selectSession = useCallback(async (sessionId: string, currentSelectedSessionId: string | null, currentSelectedProjectId: string | null) => {
    if (sessionId === currentSelectedSessionId) return;

    // Check if this session has a background run -> restore to foreground
    const bgRun = opts.backgroundRunsRef.current.get(sessionId);
    if (bgRun) {
      if (readerRef.current) {
        readerRef.current.cancel().catch(() => {});
      }
      opts.backgroundRunsRef.current.delete(sessionId);
      bgRun.streamContext.isBackground = false;
      setSelectedSessionId(sessionId);
      setClaudeSessionId(bgRun.claudeSessionId);
      setMessages(bgRun.messages);
      readerRef.current = bgRun.reader;
      currentRunIdRef.current = bgRun.runId;
      streamContextRef.current = bgRun.streamContext;
      setIsLoading(true);
      opts.onBgVersionBump();
      return;
    }

    cancelStream();
    try {
      const res = await fetch(`/api/sessions/${sessionId}/history`);
      if (!res.ok) return;
      const { messages: historyMessages } = await res.json();
      setSelectedSessionId(sessionId);
      setMessages(historyMessages || []);
      // Load claudeSessionId from session metadata
      const metaRes = await fetch(`/api/sessions/${sessionId}`);
      if (metaRes.ok) {
        const { session } = await metaRes.json();
        setClaudeSessionId(session.claudeSessionId || null);
      }
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  }, [opts, cancelStream]);

  // ── Move current run to background when switching project ──

  const moveCurrentToBackground = useCallback((currentSelectedSessionId: string | null, currentSelectedProjectId: string | null, currentClaudeSessionId: string | null) => {
    if (readerRef.current && currentSelectedSessionId) {
      const streamCtx = streamContextRef.current;
      if (streamCtx) {
        streamCtx.isBackground = true;
      }
      opts.backgroundRunsRef.current.set(currentSelectedSessionId, {
        sessionId: currentSelectedSessionId,
        projectId: currentSelectedProjectId!,
        runId: currentRunIdRef.current || '',
        reader: readerRef.current,
        messages: [...messagesRef.current],
        claudeSessionId: currentClaudeSessionId,
        abortController: new AbortController(),
        streamContext: streamCtx!,
      });
      readerRef.current = null;
      currentRunIdRef.current = null;
      opts.onBgVersionBump();
    } else {
      cancelStream();
    }
  }, [opts, cancelStream]);

  // ── Handle AskUserQuestion answer ──

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

  // ── Delete session cleanup ──

  const deleteSessionCleanup = useCallback((sessionId: string) => {
    if (sessionId === selectedSessionId) {
      setMessages([]);
      setSelectedSessionId(null);
      setClaudeSessionId(null);
    }
  }, [selectedSessionId]);

  return {
    // State
    messages,
    setMessages,
    isLoading,
    setIsLoading,
    messageCounter,
    error,
    setError,
    connected,
    selectedSessionId,
    setSelectedSessionId,
    claudeSessionId,
    setClaudeSessionId,

    // Refs (exposed for cross-Hook coordination)
    readerRef,
    messagesRef,
    currentRunIdRef,
    streamContextRef,
    backgroundRunsRef: opts.backgroundRunsRef,

    // Actions
    sendMessage,
    selectSession,
    deleteSessionCleanup,
    moveCurrentToBackground,
    cancelStream,
    resetConversation,
    handleAnswer,
    updateLastAssistantMessage,
  };
}
