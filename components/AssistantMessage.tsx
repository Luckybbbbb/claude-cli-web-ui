'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AgentEvent } from '@/lib/types';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCard } from './ToolCard';
import { QuestionCard } from './QuestionCard';

interface AssistantMessageProps {
  events: AgentEvent[];
  onSelectAnswer?: (toolUseId: string, answer: string) => void;
}

interface Block {
  type: 'text' | 'thinking' | 'tool';
  content?: string;
  tool?: {
    id: string;
    name: string;
    input: unknown;
    result?: string;
    isError?: boolean;
  };
}

export function AssistantMessage({ events, onSelectAnswer }: AssistantMessageProps) {
  const blocks = useMemo(() => {
    const result: Block[] = [];
    let currentText = '';
    let currentThinking = '';

    // Build tool results map
    const toolResults = new Map<string, { content: string; isError: boolean }>();
    for (const event of events) {
      if (event.type === 'tool_result') {
        toolResults.set(event.toolUseId, {
          content: event.content,
          isError: event.isError,
        });
      }
    }

    for (const event of events) {
      switch (event.type) {
        case 'text_delta':
          currentText += event.delta;
          break;

        case 'thinking_delta':
          // Flush current text if any
          if (currentText) {
            result.push({ type: 'text', content: currentText });
            currentText = '';
          }
          currentThinking += event.delta;
          break;

        case 'tool_use':
          // Flush current text and thinking
          if (currentText) {
            result.push({ type: 'text', content: currentText });
            currentText = '';
          }
          if (currentThinking) {
            result.push({ type: 'thinking', content: currentThinking });
            currentThinking = '';
          }

          // Add tool block
          const toolResult = toolResults.get(event.id);
          result.push({
            type: 'tool',
            tool: {
              id: event.id,
              name: event.name,
              input: event.input,
              result: toolResult?.content,
              isError: toolResult?.isError,
            },
          });
          break;

        case 'turn_end':
          // Flush remaining text and thinking
          if (currentText) {
            result.push({ type: 'text', content: currentText });
            currentText = '';
          }
          if (currentThinking) {
            result.push({ type: 'thinking', content: currentThinking });
            currentThinking = '';
          }
          break;
      }
    }

    // Flush any remaining content
    if (currentText) {
      result.push({ type: 'text', content: currentText });
    }
    if (currentThinking) {
      result.push({ type: 'thinking', content: currentThinking });
    }

    return result;
  }, [events]);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'text':
            return (
              <div key={index} className="markdown-body text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {block.content || ''}
                </ReactMarkdown>
              </div>
            );

          case 'thinking':
            return (
              <ThinkingBlock key={index} content={block.content || ''} />
            );

          case 'tool':
            if (!block.tool) return null;
            if (block.tool.name === 'AskUserQuestion' && onSelectAnswer) {
              const input = block.tool.input as { questions?: Array<{ question: string; header?: string; options: Array<{ label: string; description?: string }>; multiSelect?: boolean }> } | null;
              if (input?.questions) {
                return (
                  <QuestionCard
                    key={index}
                    toolUseId={block.tool.id}
                    questions={input.questions}
                    result={block.tool.result}
                    isError={block.tool.isError}
                    onSelect={onSelectAnswer}
                  />
                );
              }
            }
            return <ToolCard key={index} tool={block.tool} />;

          default:
            return null;
        }
      })}
    </div>
  );
}
