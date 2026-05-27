import { NextResponse } from 'next/server';

interface Command {
  name: string;
  description: string;
  type: 'frontend' | 'cli';
  args?: string[];
}

const commands: Command[] = [
  { name: '/clear', description: '清除对话历史', type: 'frontend' },
  { name: '/help', description: '显示帮助信息', type: 'frontend' },
  { name: '/compact', description: '压缩对话上下文', type: 'cli' },
  { name: '/model', description: '切换模型', type: 'cli', args: ['sonnet', 'opus', 'haiku'] },
  { name: '/config', description: '查看/修改配置', type: 'cli' },
];

export async function GET() {
  return NextResponse.json({ commands });
}
