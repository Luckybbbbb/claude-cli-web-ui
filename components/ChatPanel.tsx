'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { AgentEvent, ChatResponse } from '@/lib/types';
import { MessageList } from './MessageList';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  events?: AgentEvent[];
  status?: string;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messageCounter, setMessageCounter] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Cleanup EventSource on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

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

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isLoading) return;

    // Generate unique IDs using counter to avoid Date.now() collisions
    const userMessageId = `user-${messageCounter}`;
    const assistantMessageId = `assistant-${messageCounter + 1}`;
    setMessageCounter(prev => prev + 2);

    const userMessage: Message = {
      id: userMessageId,
      role: 'user',
      content: input.trim(),
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
    setIsLoading(true);

    try {
      // Start the chat run
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage.content }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to start chat`);
      }

      const { runId }: ChatResponse = await response.json();

      // Use fetch to read SSE stream (more reliable than EventSource)
      const sseResponse = await fetch(`/api/runs/${runId}/events`);
      const reader = sseResponse.body!.getReader();
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
                    updateLastAssistantMessage((msg) => ({
                      ...msg,
                      events: [...(msg.events || []), data],
                      status: data.type === 'turn_end'
                        ? 'succeeded'
                        : data.type === 'error'
                          ? 'failed'
                          : msg.status
                    }));
                  } else if (currentEvent === 'status') {
                    updateLastAssistantMessage((msg) => ({
                      ...msg,
                      status: data.status
                    }));

                    if (data.status === 'succeeded' || data.status === 'failed' || data.status === 'canceled') {
                      reader.cancel();
                      setIsLoading(false);
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
        } finally {
          setIsLoading(false);
        }
      };

      processStream();
    } catch (error) {
      console.error('Chat error:', error);
      setIsLoading(false);

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
  }, [input, isLoading, messageCounter, updateLastAssistantMessage]);

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900">
      <MessageList messages={messages} />

      {error && (
        <div className="mb-4 p-4 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg mx-4">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="border-t border-gray-200 dark:border-gray-700 p-4"
      >
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={isLoading}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
