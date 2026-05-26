'use client';

import { useState, useId } from 'react';

/** Supported tool names for icon and summary mapping */
type ToolName = 'Read' | 'Write' | 'Edit' | 'Bash' | 'Glob' | 'Grep' | 'WebFetch' | 'WebSearch';

/** Tool input parameters keyed by tool name */
interface ToolInputMap {
  Read: { file_path?: string };
  Write: { file_path?: string };
  Edit: { file_path?: string };
  Bash: { command?: string };
  Glob: { pattern?: string };
  Grep: { pattern?: string };
  WebFetch: { url?: string };
  WebSearch: { query?: string };
}

/** Constant mapping of tool names to their display icons */
const TOOL_ICONS: Record<ToolName, string> = {
  Read: '📄',
  Write: '✏️',
  Edit: '🔧',
  Bash: '💻',
  Glob: '🔍',
  Grep: '🔎',
  WebFetch: '🌐',
  WebSearch: '🔍',
};

/** Default icon for unknown tool names */
const DEFAULT_ICON = '🛠️';

interface ToolCall {
  id: string;
  name: string;
  input: unknown;
  result?: string;
  isError?: boolean;
}

interface ToolCardProps {
  tool: ToolCall;
}

/**
 * Displays a collapsible card for a tool call with input/result details.
 *
 * Features accessible expand/collapse with proper ARIA attributes,
 * keyboard navigation, and screen reader support.
 *
 * @example
 * ```tsx
 * <ToolCard tool={{ id: '1', name: 'Read', input: { file_path: '/path' } }} />
 * ```
 */
export function ToolCard({ tool }: ToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();

  const getToolIcon = (name: string): string => {
    if (name in TOOL_ICONS) {
      return TOOL_ICONS[name as ToolName];
    }
    return DEFAULT_ICON;
  };

  const getToolSummary = (name: string, input: unknown): string => {
    if (typeof input !== 'object' || input === null) return name;

    const inputObj = input as Record<string, unknown>;

    switch (name) {
      case 'Read':
        return `Read ${(inputObj as ToolInputMap['Read']).file_path || 'file'}`;
      case 'Write':
        return `Write ${(inputObj as ToolInputMap['Write']).file_path || 'file'}`;
      case 'Edit':
        return `Edit ${(inputObj as ToolInputMap['Edit']).file_path || 'file'}`;
      case 'Bash':
        return `Run: ${(inputObj as ToolInputMap['Bash']).command || 'command'}`;
      case 'Glob':
        return `Find: ${(inputObj as ToolInputMap['Glob']).pattern || 'pattern'}`;
      case 'Grep':
        return `Search: ${(inputObj as ToolInputMap['Grep']).pattern || 'pattern'}`;
      default:
        return name;
    }
  };

  return (
    <div className="my-2 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-between"
      >
        <span className="flex items-center">
          <span className="mr-2">{getToolIcon(tool.name)}</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {getToolSummary(tool.name, tool.input)}
          </span>
        </span>
        <span className="flex items-center">
          {tool.result && (
            <span className={`text-xs px-2 py-0.5 rounded ${tool.isError ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'}`}>
              {tool.isError ? 'Error' : 'Done'}
            </span>
          )}
          <svg
            className={`w-4 h-4 ml-2 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </button>
      {isExpanded && (
        <div
          id={contentId}
          className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700"
        >
          <div className="mb-2">
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Input
            </h4>
            <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono bg-white dark:bg-gray-900 p-2 rounded">
              {JSON.stringify(tool.input, null, 2)}
            </pre>
          </div>
          {tool.result && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Result
              </h4>
              <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono bg-white dark:bg-gray-900 p-2 rounded">
                {tool.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
