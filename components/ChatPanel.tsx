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

      // Connect to SSE stream
      const eventSource = new EventSource(`/api/runs/${runId}/events`);

      // Listen for agent events (text, tool use, etc.)
      eventSource.addEventListener('agent', (event) => {
        try {
          const agentEvent: AgentEvent = JSON.parse(event.data);

          // Update message with new event data
          updateLastAssistantMessage((msg) => ({
            ...msg,
            events: [...(msg.events || []), agentEvent],
            // Update status based on event type
            status: agentEvent.type === 'turn_end'
              ? 'succeeded'
              : agentEvent.type === 'error'
                ? 'failed'
                : msg.status
          }));
        } catch (error) {
          console.error('Failed to parse agent event:', error);
        }
      });

      // Listen for status updates (running, succeeded, failed, canceled)
      eventSource.addEventListener('status', (event) => {
        try {
          const { status } = JSON.parse(event.data);

          updateLastAssistantMessage((msg) => ({
            ...msg,
            status
          }));

          // Close connection on terminal status
          if (status === 'succeeded' || status === 'failed' || status === 'canceled') {
            eventSource.close();
            setIsLoading(false);
          }
        } catch (error) {
          console.error('Failed to parse status event:', error);
        }
      });

      // Handle connection errors
      eventSource.onerror = () => {
        eventSource.close();
        setIsLoading(false);

        updateLastAssistantMessage((msg) => {
          if (msg.status === 'running') {
            return {
              ...msg,
              status: 'failed',
              events: [
                ...(msg.events || []),
                { type: 'error', message: 'Connection lost' } as AgentEvent,
              ]
            };
          }
          return msg;
        });
      };

      // Store reference for cleanup
      eventSourceRef.current = eventSource;
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
