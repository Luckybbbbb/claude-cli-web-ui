'use client';

import { KeyboardEvent } from 'react';
import { MessageList } from '../MessageList';
import { EmptyState } from '../EmptyState';
import { CommandPalette } from '../CommandPalette';
import type { Message } from '@/hooks/useChatSession';
import type { Project } from '@/lib/projects';
import { parseTrigger } from '@/lib/commands';

interface MobileChatViewProps {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  connected: boolean;
  projectName: string;
  onClearError: () => void;
  onSelectAnswer: (toolUseId: string, answer: string) => void;
  onQuickAction: (prompt: string) => void;
  input: string;
  setInput: (v: string) => void;
  cursorPos: number;
  setCursorPos: (v: number) => void;
  paletteVisible: boolean;
  setPaletteVisible: (v: boolean) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  inputBarRef: React.RefObject<HTMLDivElement>;
  onSubmit: (e: React.FormEvent | string) => void;
  adjustTextareaHeight: () => void;
  selectedProject: Project | null;
}

export function MobileChatView({
  messages,
  isLoading,
  error,
  connected,
  projectName,
  onClearError,
  onSelectAnswer,
  onQuickAction,
  input,
  setInput,
  cursorPos,
  setCursorPos,
  paletteVisible,
  setPaletteVisible,
  textareaRef,
  inputBarRef,
  onSubmit,
  adjustTextareaHeight,
  selectedProject,
}: MobileChatViewProps) {
  return (
    <>
      {/* Header */}
      <div
        className="shrink-0 flex items-center justify-center px-4"
        style={{
          height: '48px',
          backgroundColor: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span
          className="text-sm font-semibold truncate"
          style={{ color: 'var(--text-primary)' }}
        >
          {projectName}
        </span>
        <span
          className="ml-2 shrink-0 text-[10px] px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: connected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: connected ? '#22c55e' : '#ef4444',
          }}
        >
          {connected ? '●' : '○'}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-1.5 shrink-0">
          <div
            className="p-2 rounded-lg text-xs"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              color: '#dc2626',
              border: '1px solid rgba(239, 68, 68, 0.2)',
            }}
          >
            {error}
            <button onClick={onClearError} className="ml-1 underline opacity-70">关闭</button>
          </div>
        </div>
      )}

      {/* Content */}
      {messages.length === 0 ? (
        <EmptyState onQuickAction={onQuickAction} />
      ) : (
        <MessageList messages={messages} onSelectAnswer={onSelectAnswer} />
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
        <form onSubmit={onSubmit} className="px-3 py-2">
          <div className="relative flex items-end">
            {paletteVisible && (
              <CommandPalette
                input={input}
                cursorPos={cursorPos}
                cwd={selectedProject?.path}
                onSelect={(replacement: string) => {
                  const trigger = parseTrigger(input, cursorPos);
                  if (trigger.type === null || trigger.triggerStart < 0) {
                    setPaletteVisible(false);
                    return;
                  }
                  const newText = input.slice(0, trigger.triggerStart) + replacement + input.slice(cursorPos);
                  setInput(newText);
                  setPaletteVisible(false);
                  requestAnimationFrame(() => {
                    const textarea = textareaRef.current;
                    if (textarea) {
                      const pos = trigger.triggerStart + replacement.length;
                      textarea.focus();
                      textarea.setSelectionRange(pos, pos);
                      adjustTextareaHeight();
                    }
                  });
                }}
                onClose={() => setPaletteVisible(false)}
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
                  onSubmit(e);
                }
              }}
              placeholder="输入消息..."
              disabled={isLoading}
              rows={1}
              className="flex-1 resize-none text-base px-3 py-2.5 rounded-2xl input-focus-ring outline-none disabled:opacity-50 overflow-y-hidden"
              style={{
                maxHeight: '120px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />

            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="ml-1.5 shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 focus:outline-none"
              style={{
                backgroundColor: (isLoading || !input.trim()) ? 'var(--bg-secondary)' : 'var(--bg-user-bubble)',
              }}
              aria-label="发送"
            >
              <svg
                width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke={isLoading || !input.trim() ? 'var(--text-secondary)' : '#fff'}
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
