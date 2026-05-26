'use client';

import { useState } from 'react';

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

export function ToolCard({ tool }: ToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getToolIcon = (name: string) => {
    switch (name) {
      case 'Read':
        return '📄';
      case 'Write':
        return '✏️';
      case 'Edit':
        return '🔧';
      case 'Bash':
        return '💻';
      case 'Glob':
        return '🔍';
      case 'Grep':
        return '🔎';
      case 'WebFetch':
        return '🌐';
      case 'WebSearch':
        return '🔍';
      default:
        return '🛠️';
    }
  };

  const getToolSummary = (name: string, input: unknown) => {
    if (typeof input !== 'object' || input === null) return name;

    const inputObj = input as Record<string, unknown>;

    switch (name) {
      case 'Read':
        return `Read ${inputObj.file_path || 'file'}`;
      case 'Write':
        return `Write ${inputObj.file_path || 'file'}`;
      case 'Edit':
        return `Edit ${inputObj.file_path || 'file'}`;
      case 'Bash':
        return `Run: ${inputObj.command || 'command'}`;
      case 'Glob':
        return `Find: ${inputObj.pattern || 'pattern'}`;
      case 'Grep':
        return `Search: ${inputObj.pattern || 'pattern'}`;
      default:
        return name;
    }
  };

  return (
    <div className="my-2 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
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
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </button>
      {isExpanded && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
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
