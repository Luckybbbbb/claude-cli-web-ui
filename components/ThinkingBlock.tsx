'use client';

import { useState, useId } from 'react';

interface ThinkingBlockProps {
  content: string;
}

/**
 * Displays a collapsible thinking block with a light yellow background.
 * Default collapsed, showing "思考中... (N 字)".
 * Arrow toggle with rotation animation.
 * Expanded: pre/code style with monospace font.
 */
export function ThinkingBlock({ content }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();

  return (
    <div
      className="my-2 overflow-hidden"
      style={{
        backgroundColor: '#fefce8',
        borderRadius: '12px',
        border: '1px solid #fde68a',
      }}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className="w-full px-4 py-2.5 text-left text-sm flex items-center justify-between transition-colors duration-150 hover:bg-yellow-50"
      >
        <span className="flex items-center">
          {/* Thinking icon */}
          <svg
            className="w-4 h-4 mr-2 flex-shrink-0"
            fill="none"
            stroke="#a16207"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <span className="font-medium" style={{ color: '#92400e' }}>
            思考中... ({content.length} 字)
          </span>
        </span>
        {/* Expand/collapse arrow */}
        <svg
          className="w-4 h-4 transition-transform duration-200"
          style={{
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            color: '#a16207',
          }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Expandable content */}
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
          style={{ borderTop: '1px solid #fde68a' }}
        >
          <pre className="text-sm whitespace-pre-wrap font-mono" style={{ color: '#78350f' }}>
            <code>{content}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
