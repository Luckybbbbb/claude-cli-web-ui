'use client';

import { QuickAction } from './QuickAction';

interface EmptyStateProps {
  onQuickAction: (prompt: string) => void;
}

const quickActions = [
  {
    icon: '✏️',
    title: '编写代码',
    description: '帮我编写一个函数...',
    prompt: '帮我编写一个函数',
  },
  {
    icon: '🔧',
    title: '调试问题',
    description: '这段代码有什么问题...',
    prompt: '这段代码有什么问题？',
  },
  {
    icon: '👁‍🔍',
    title: '代码审查',
    description: '请审查这个文件的代码...',
    prompt: '请审查这个文件的代码',
  },
  {
    icon: '🔎',
    title: '深度研究',
    description: '帮我调研一下...',
    prompt: '帮我调研一下',
  },
];

export function EmptyState({ onQuickAction }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-8 max-w-2xl w-full">
        {/* Title area */}
        <div className="text-center">
          <h1
            className="text-3xl font-bold mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            Claude CLI
          </h1>
          <p
            className="text-base"
            style={{ color: 'var(--text-secondary)' }}
          >
            AI 编程助手，随时待命
          </p>
        </div>

        {/* Quick action cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
          {quickActions.map((action) => (
            <QuickAction
              key={action.title}
              icon={action.icon}
              title={action.title}
              description={action.description}
              onClick={() => onQuickAction(action.prompt)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
