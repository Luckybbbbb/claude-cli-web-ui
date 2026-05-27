'use client';

import { useState, useId } from 'react';

/** Supported tool names for icon mapping */
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

/** SVG icon paths for each tool type */
const TOOL_SVG_ICONS: Record<ToolName, { path: string; viewBox?: string }> = {
  Read: { path: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  Write: { path: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
  Edit: { path: 'M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z' },
  Bash: { path: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  Glob: { path: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  Grep: { path: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7' },
  WebFetch: { path: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  WebSearch: { path: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
};

/** Default icon path for unknown tools */
const DEFAULT_SVG_ICON = { path: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' };

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
 * Features a colored side bar (green for success, red for error),
 * SVG tool icon, and smooth expand/collapse animation.
 */
export function ToolCard({ tool }: ToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();

  const getToolSvgIcon = (name: string) => {
    if (name in TOOL_SVG_ICONS) {
      return TOOL_SVG_ICONS[name as ToolName];
    }
    return DEFAULT_SVG_ICON;
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

  /** Determine side bar color based on tool result status */
  const sideBarColor = tool.isError
    ? '#ef4444'
    : tool.result
      ? '#22c55e'
      : 'var(--accent)';

  return (
    <div
      className="my-2 overflow-hidden card-shadow"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${sideBarColor}`,
      }}
    >
      {/* Title bar */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className="w-full px-4 py-2.5 text-left text-sm flex items-center justify-between transition-colors duration-150 hover:opacity-90"
      >
        <span className="flex items-center min-w-0">
          {/* Tool SVG icon */}
          <svg
            className="w-4 h-4 mr-2 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            style={{ color: 'var(--text-secondary)' }}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d={getToolSvgIcon(tool.name).path}
            />
          </svg>
          {/* Tool name + summary */}
          <span
            className="font-medium truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {getToolSummary(tool.name, tool.input)}
          </span>
        </span>
        <span className="flex items-center flex-shrink-0 ml-2">
          {/* Status badge */}
          {tool.result && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={
                tool.isError
                  ? { backgroundColor: '#fef2f2', color: '#dc2626' }
                  : { backgroundColor: '#f0fdf4', color: '#16a34a' }
              }
            >
              {tool.isError ? 'Error' : 'Done'}
            </span>
          )}
          {/* Expand/collapse arrow */}
          <svg
            className="w-4 h-4 ml-2 transition-transform duration-200"
            style={{
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              color: 'var(--text-secondary)',
            }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </button>

      {/* Expandable content area */}
      <div
        id={contentId}
        role="region"
        style={{
          maxHeight: isExpanded ? '2000px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 200ms ease-out',
        }}
      >
        <div
          className="px-4 py-3"
          style={{
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          {/* Input section */}
          <div className="mb-2">
            <h4
              className="text-xs font-semibold uppercase mb-1 tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              Input
            </h4>
            <pre
              className="text-sm whitespace-pre-wrap font-mono p-3 rounded-lg overflow-x-auto"
              style={{
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            >
              {JSON.stringify(tool.input, null, 2)}
            </pre>
          </div>
          {/* Result section */}
          {tool.result && (
            <div>
              <h4
                className="text-xs font-semibold uppercase mb-1 tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                Result
              </h4>
              <pre
                className="text-sm whitespace-pre-wrap font-mono p-3 rounded-lg overflow-x-auto"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                }}
              >
                {tool.result}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
