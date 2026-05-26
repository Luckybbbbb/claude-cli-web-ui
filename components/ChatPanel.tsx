'use client';

import { useState, useCallback } from 'react';
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

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    const assistantMessage: Message = {
      id: `assistant-${Date.now()}`,
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
        throw new Error('Failed to start chat');
      }

      const { runId }: ChatResponse = await response.json();

      // Connect to SSE stream
      const eventSource = new EventSource(`/api/runs/${runId}/events`);

      eventSource.addEventListener('agent', (event) => {
        const agentEvent: AgentEvent = JSON.parse(event.data);

        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];

          if (lastMessage.role === 'assistant') {
            lastMessage.events = [...(lastMessage.events || []), agentEvent];

            // Update status based on event
            if (agentEvent.type === 'turn_end') {
              lastMessage.status = 'succeeded';
            } else if (agentEvent.type === 'error') {
              lastMessage.status = 'failed';
            }
          }

          return newMessages;
        });
      });

      eventSource.addEventListener('status', (event) => {
        const { status } = JSON.parse(event.data);

        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];

          if (lastMessage.role === 'assistant') {
            lastMessage.status = status;
          }

          return newMessages;
        });

        if (status === 'succeeded' || status === 'failed' || status === 'canceled') {
          eventSource.close();
          setIsLoading(false);
        }
      });

      eventSource.onerror = () => {
        eventSource.close();
        setIsLoading(false);

        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];

          if (lastMessage.role === 'assistant' && lastMessage.status === 'running') {
            lastMessage.status = 'failed';
            lastMessage.events = [
              ...(lastMessage.events || []),
              { type: 'error', message: 'Connection lost' },
            ];
          }

          return newMessages;
        });
      };
    } catch (error) {
      console.error('Chat error:', error);
      setIsLoading(false);

      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];

        if (lastMessage.role === 'assistant') {
          lastMessage.status = 'failed';
          lastMessage.events = [
            ...(lastMessage.events || []),
            { type: 'error', message: 'Failed to start chat' },
          ];
        }

        return newMessages;
      });
    }
  }, [input, isLoading]);

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900">
      <MessageList messages={messages} />

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
