'use client';

import { useEffect, useRef } from 'react';
import { AgentEvent } from '@/lib/types';
import { AssistantMessage } from './AssistantMessage';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  events?: AgentEvent[];
  status?: string;
}

interface MessageListProps {
  messages: Message[];
  onSelectAnswer?: (toolUseId: string, answer: string) => void;
}

export function MessageList({ messages, onSelectAnswer }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Claude CLI Web UI</h2>
          <p>Start a conversation by typing a message below.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-message-appear`}
          style={{ gap: '12px' }}
        >
          {/* Assistant avatar */}
          {message.role === 'assistant' && (
            <div
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold mt-1"
              style={{ backgroundColor: 'var(--accent)' }}
              aria-hidden="true"
            >
              C
            </div>
          )}

          {/* Message bubble */}
          <div
            className={`max-w-[90%] sm:max-w-[80%] px-4 py-3 ${
              message.role === 'user'
                ? 'text-white order-1'
                : ''
            }`}
            style={
              message.role === 'user'
                ? {
                    backgroundColor: 'var(--bg-user-bubble)',
                    borderRadius: '16px 16px 4px 16px',
                  }
                : {
                    backgroundColor: 'var(--bg-assistant-bubble)',
                    borderRadius: '16px 16px 16px 4px',
                    color: 'var(--text-primary)',
                  }
            }
          >
            {message.role === 'user' ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {message.content}
              </p>
            ) : (
              <>
                <AssistantMessage events={message.events || []} onSelectAnswer={onSelectAnswer} />
                {message.status === 'running' && (
                  <div className="mt-2 flex items-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <div className="animate-pulse mr-2 h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
                    Thinking...
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
