# Claude CLI Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Next.js web UI that streams Claude CLI conversations in real-time using the stream-json format.

**Architecture:** Single-process Next.js app with API Routes handling Claude CLI spawning and SSE streaming, frontend components rendering agent events (text, tool calls, thinking).

**Tech Stack:** Next.js 14 App Router, TypeScript, React, Tailwind CSS

---

## File Structure

```
E:\AIDemos\claude-cli-web-ui\
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── .env.local
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   └── api/
│       ├── chat/
│       │   └── route.ts
│       └── runs/
│           └── [id]/
│               ├── events/
│               │   └── route.ts
│               ├── cancel/
│               │   └── route.ts
│               └── tool-result/
│                   └── route.ts
├── lib/
│   ├── claude-stream.ts
│   ├── runs.ts
│   ├── types.ts
│   └── env.ts
├── components/
│   ├── ChatPanel.tsx
│   ├── MessageList.tsx
│   ├── AssistantMessage.tsx
│   ├── ToolCard.tsx
│   └── ThinkingBlock.tsx
└── __tests__/
    └── claude-stream.test.ts
```

---

## Task 1: Initialize Next.js Project

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `.env.local`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "claude-cli-web-ui",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest"
  },
  "dependencies": {
    "next": "14.2.20",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-markdown": "^9.0.1",
    "remark-gfm": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "autoprefixer": "^10.0.1",
    "postcss": "^8",
    "tailwindcss": "^3.3.0",
    "typescript": "^5",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create next.config.ts**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {},
};

export default nextConfig;
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Create postcss.config.js**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: Create .env.local**

```env
CLAUDE_BIN=claude
DEFAULT_MODEL=claude-sonnet-4-6
DEFAULT_CWD=E:\AIDemos
PORT=0
```

- [ ] **Step 7: Install dependencies**

Run: `cd E:\AIDemos\claude-cli-web-ui && pnpm install`
Expected: Dependencies installed successfully

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: initialize Next.js project with TypeScript and Tailwind"
```

---

## Task 2: Create Type Definitions

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: Create types.ts**

```typescript
export type AgentEvent =
  | { type: 'status'; label: string; model?: string; sessionId?: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | { type: 'usage'; usage: Record<string, unknown> | null; costUsd: number | null; durationMs: number | null }
  | { type: 'turn_end'; stopReason: string }
  | { type: 'error'; message: string; raw?: string }
  | { type: 'raw'; line: string };

export interface RunState {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  events: AgentEvent[];
  child?: import('child_process').ChildProcess;
  stdinOpen: boolean;
  pendingHostAnswers: Set<string>;
  clients: Set<SSEClient>;
  createdAt: number;
}

export interface SSEClient {
  controller: ReadableStreamDefaultController;
  send: (event: string, data: unknown, id?: number) => void;
  close: () => void;
}

export interface ChatRequest {
  message: string;
  cwd?: string;
  model?: string;
}

export interface ChatResponse {
  runId: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add type definitions for agent events and run state"
```

---

## Task 3: Create Environment Config

**Files:**
- Create: `lib/env.ts`

- [ ] **Step 1: Create env.ts**

```typescript
export function getEnvConfig() {
  return {
    claudeBin: process.env.CLAUDE_BIN || 'claude',
    defaultModel: process.env.DEFAULT_MODEL || 'claude-sonnet-4-6',
    defaultCwd: process.env.DEFAULT_CWD || process.cwd(),
    port: parseInt(process.env.PORT || '0', 10) || 0,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/env.ts
git commit -m "feat: add environment configuration"
```

---

## Task 4: Create In-Memory Run Store

**Files:**
- Create: `lib/runs.ts`

- [ ] **Step 1: Create runs.ts**

```typescript
import { RunState, SSEClient, AgentEvent } from './types';

const runs = new Map<string, RunState>();

export function createRun(id: string): RunState {
  const run: RunState = {
    id,
    status: 'queued',
    events: [],
    stdinOpen: false,
    pendingHostAnswers: new Set(),
    clients: new Set(),
    createdAt: Date.now(),
  };
  runs.set(id, run);
  return run;
}

export function getRun(id: string): RunState | undefined {
  return runs.get(id);
}

export function addEvent(run: RunState, event: AgentEvent): void {
  run.events.push(event);
  // Broadcast to all connected SSE clients
  for (const client of run.clients) {
    try {
      client.send('agent', event, run.events.length);
    } catch {
      // Client disconnected, remove it
      run.clients.delete(client);
    }
  }
}

export function addClient(run: RunState, client: SSEClient): void {
  run.clients.add(client);
  // Send existing events to new client
  run.events.forEach((event, index) => {
    client.send('agent', event, index + 1);
  });
}

export function removeClient(run: RunState, client: SSEClient): void {
  run.clients.delete(client);
}

export function setRunStatus(run: RunState, status: RunState['status']): void {
  run.status = status;
  // Notify all clients of status change
  for (const client of run.clients) {
    try {
      client.send('status', { status }, run.events.length + 1);
      if (status === 'succeeded' || status === 'failed' || status === 'canceled') {
        client.close();
      }
    } catch {
      run.clients.delete(client);
    }
  }
}

export function cleanupRun(id: string): void {
  const run = runs.get(id);
  if (run) {
    // Close all client connections
    for (const client of run.clients) {
      try {
        client.close();
      } catch {
        // Ignore errors during cleanup
      }
    }
    // Kill child process if still running
    if (run.child && !run.child.killed) {
      run.child.kill('SIGTERM');
    }
    runs.delete(id);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/runs.ts
git commit -m "feat: add in-memory run store with SSE broadcasting"
```

---

## Task 5: Extract Claude Stream Parser

**Files:**
- Create: `lib/claude-stream.ts`
- Create: `__tests__/claude-stream.test.ts`

- [ ] **Step 1: Create claude-stream.ts**

Extract from `E:\AIDemos\open-design\apps\daemon\src\claude-stream.ts`:

```typescript
import { AgentEvent } from './types';

type StreamEvent = Record<string, unknown>;
type EventSink = (event: AgentEvent) => void;
type BlockState = { type?: unknown; name?: unknown; id?: unknown; input: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function createClaudeStreamHandler(onEvent: EventSink) {
  let buffer = '';
  const blocks = new Map<string, BlockState>();
  const streamedToolUseIds = new Set<string>();
  let currentMessageId: string | null = null;
  const textStreamed = new Set<string>();

  function blockKey(index: unknown): string {
    return `${currentMessageId ?? 'anon'}:${index}`;
  }

  function feed(chunk: string) {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        onEvent({ type: 'raw', line });
        continue;
      }
      handleObject(obj);
    }
  }

  function flush() {
    const rem = buffer.trim();
    buffer = '';
    if (!rem) return;
    try {
      handleObject(JSON.parse(rem));
    } catch {
      onEvent({ type: 'raw', line: rem });
    }
  }

  function handleObject(obj: unknown) {
    if (!isRecord(obj)) return;

    if (obj.type === 'system' && obj.subtype === 'init') {
      onEvent({
        type: 'status',
        label: 'initializing',
        model: obj.model ?? null,
        sessionId: obj.session_id ?? null,
      });
      return;
    }

    if (obj.type === 'system' && obj.subtype === 'status') {
      onEvent({ type: 'status', label: obj.status ?? 'working' });
      return;
    }

    if (obj.type === 'stream_event' && isRecord(obj.event)) {
      handleStreamEvent(obj.event);
      return;
    }

    if (obj.type === 'assistant' && isRecord(obj.message) && Array.isArray(obj.message.content)) {
      currentMessageId = typeof obj.message.id === 'string' ? obj.message.id : currentMessageId;
      const msgId = typeof obj.message.id === 'string' ? obj.message.id : null;
      const alreadyStreamed = msgId ? textStreamed.has(msgId) : false;
      const stopReason = typeof obj.message.stop_reason === 'string'
        ? obj.message.stop_reason
        : null;

      for (const block of obj.message.content) {
        if (!isRecord(block)) continue;
        if (block.type === 'tool_use') {
          if (typeof block.id === 'string' && streamedToolUseIds.has(block.id)) {
            streamedToolUseIds.delete(block.id);
            continue;
          }
          onEvent({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input ?? null,
          });
        } else if (
          !alreadyStreamed &&
          block.type === 'text' &&
          typeof block.text === 'string' &&
          block.text.length > 0
        ) {
          onEvent({ type: 'text_delta', delta: block.text });
        } else if (
          !alreadyStreamed &&
          block.type === 'thinking' &&
          typeof block.thinking === 'string' &&
          block.thinking.length > 0
        ) {
          onEvent({ type: 'thinking_delta', delta: block.thinking });
        }
      }

      if (stopReason) {
        onEvent({ type: 'turn_end', stopReason });
      }
      return;
    }

    if (obj.type === 'user' && isRecord(obj.message) && Array.isArray(obj.message.content)) {
      for (const block of obj.message.content) {
        if (!isRecord(block)) continue;
        if (block.type === 'tool_result') {
          onEvent({
            type: 'tool_result',
            toolUseId: block.tool_use_id,
            content: stringifyToolResult(block.content),
            isError: Boolean(block.is_error),
          });
        }
      }
      return;
    }

    if (obj.type === 'result') {
      onEvent({
        type: 'usage',
        usage: obj.usage ?? null,
        costUsd: obj.total_cost_usd ?? null,
        durationMs: obj.duration_ms ?? null,
      });
      return;
    }
  }

  function handleStreamEvent(ev: Record<string, unknown>) {
    if (ev.type === 'message_start') {
      currentMessageId = isRecord(ev.message) && typeof ev.message.id === 'string' ? ev.message.id : null;
      return;
    }

    if (ev.type === 'content_block_start' && isRecord(ev.content_block)) {
      const key = blockKey(ev.index);
      const block = ev.content_block;
      blocks.set(key, { type: block.type, name: block.name, id: block.id, input: '' });
      return;
    }

    if (ev.type === 'content_block_delta' && isRecord(ev.delta)) {
      const state = blocks.get(blockKey(ev.index));
      const delta = ev.delta;

      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        if (currentMessageId) textStreamed.add(currentMessageId);
        onEvent({ type: 'text_delta', delta: delta.text });
        return;
      }
      if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        if (currentMessageId) textStreamed.add(currentMessageId);
        onEvent({ type: 'thinking_delta', delta: delta.thinking });
        return;
      }
      if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
        if (state && state.type === 'tool_use') {
          state.input += delta.partial_json;
        }
        return;
      }
    }

    if (ev.type === 'content_block_stop') {
      const key = blockKey(ev.index);
      const state = blocks.get(key);
      if (state && state.type === 'tool_use' && typeof state.id === 'string' && state.input.trim()) {
        try {
          onEvent({
            type: 'tool_use',
            id: state.id,
            name: state.name,
            input: JSON.parse(state.input),
          });
          streamedToolUseIds.add(state.id);
        } catch {
          // Fall through to the final assistant wrapper's input
        }
      }
      blocks.delete(key);
      return;
    }
  }

  return { feed, flush };
}

function stringifyToolResult(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (isRecord(c) && c.type === 'text' ? String(c.text) : JSON.stringify(c)))
      .join('\n');
  }
  return JSON.stringify(content);
}
```

- [ ] **Step 2: Create test file**

```typescript
import { describe, it, expect } from 'vitest';
import { createClaudeStreamHandler } from '../lib/claude-stream';
import { AgentEvent } from '../lib/types';

describe('createClaudeStreamHandler', () => {
  it('should parse system init event', () => {
    const events: AgentEvent[] = [];
    const handler = createClaudeStreamHandler((event) => events.push(event));

    handler.feed(JSON.stringify({
      type: 'system',
      subtype: 'init',
      model: 'claude-sonnet-4-6',
      session_id: 'test-session',
    }) + '\n');

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'status',
      label: 'initializing',
      model: 'claude-sonnet-4-6',
      sessionId: 'test-session',
    });
  });

  it('should parse text delta from stream_event', () => {
    const events: AgentEvent[] = [];
    const handler = createClaudeStreamHandler((event) => events.push(event));

    handler.feed(JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      },
    }) + '\n');

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'text_delta', delta: 'Hello' });
  });

  it('should parse tool_use from assistant message', () => {
    const events: AgentEvent[] = [];
    const handler = createClaudeStreamHandler((event) => events.push(event));

    handler.feed(JSON.stringify({
      type: 'assistant',
      message: {
        id: 'msg-1',
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'Read',
            input: { file_path: '/test.txt' },
          },
        ],
      },
    }) + '\n');

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'tool_use',
      id: 'tool-1',
      name: 'Read',
      input: { file_path: '/test.txt' },
    });
  });

  it('should handle multiple chunks', () => {
    const events: AgentEvent[] = [];
    const handler = createClaudeStreamHandler((event) => events.push(event));

    const line = JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello World' },
      },
    });

    // Feed in small chunks
    handler.feed(line.slice(0, 10));
    handler.feed(line.slice(10, 20));
    handler.feed(line.slice(20) + '\n');

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'text_delta', delta: 'Hello World' });
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd E:\AIDemos\claude-cli-web-ui && pnpm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add lib/claude-stream.ts __tests__/claude-stream.test.ts
git commit -m "feat: extract Claude stream parser from Open Design with tests"
```

---

## Task 6: Create Chat API Route

**Files:**
- Create: `app/api/chat/route.ts`

- [ ] **Step 1: Create chat route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { createRun, addEvent, setRunStatus } from '@/lib/runs';
import { createClaudeStreamHandler } from '@/lib/claude-stream';
import { getEnvConfig } from '@/lib/env';
import { ChatRequest, ChatResponse } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { message, cwd, model } = body;

    if (!message?.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const config = getEnvConfig();
    const runId = randomUUID();
    const run = createRun(runId);
    const workingDir = cwd || config.defaultCwd;

    // Build Claude CLI arguments
    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--cwd', workingDir,
    ];

    if (model) {
      args.push('--model', model);
    }

    // Spawn Claude CLI process
    const child = spawn(config.claudeBin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    run.child = child;
    run.status = 'running';

    // Create stream handler
    const handler = createClaudeStreamHandler((event) => {
      addEvent(run, event);
    });

    // Handle stdout
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      handler.feed(chunk);
    });

    // Handle stderr
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      console.error(`[claude stderr] ${chunk}`);
    });

    // Handle process exit
    child.on('close', (code: number | null) => {
      handler.flush();
      if (code === 0) {
        setRunStatus(run, 'succeeded');
      } else {
        setRunStatus(run, 'failed');
      }
    });

    child.on('error', (err: Error) => {
      addEvent(run, { type: 'error', message: err.message });
      setRunStatus(run, 'failed');
    });

    // Write prompt to stdin
    if (child.stdin) {
      const userMessage = JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: message }],
        },
      });
      child.stdin.write(`${userMessage}\n`, 'utf8');
      run.stdinOpen = true;
    }

    const response: ChatResponse = { runId };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat: add chat API route to spawn Claude CLI"
```

---

## Task 7: Create SSE Events Route

**Files:**
- Create: `app/api/runs/[id]/events/route.ts`

- [ ] **Step 1: Create events route**

```typescript
import { NextRequest } from 'next/server';
import { getRun, addClient, removeClient } from '@/lib/runs';
import { SSEClient } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const runId = params.id;
  const run = getRun(runId);

  if (!run) {
    return new Response('Run not found', { status: 404 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const client: SSEClient = {
        controller,
        send(event: string, data: unknown, id?: number) {
          const lines = [
            id ? `id: ${id}` : '',
            `event: ${event}`,
            `data: ${JSON.stringify(data)}`,
            '',
          ].join('\n');
          controller.enqueue(new TextEncoder().encode(lines));
        },
        close() {
          controller.close();
        },
      };

      addClient(run, client);

      // Send initial status
      client.send('status', { status: run.status }, 0);

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        removeClient(run, client);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/runs/[id]/events/route.ts
git commit -m "feat: add SSE events route for streaming agent events"
```

---

## Task 8: Create Cancel Route

**Files:**
- Create: `app/api/runs/[id]/cancel/route.ts`

- [ ] **Step 1: Create cancel route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getRun, setRunStatus } from '@/lib/runs';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const runId = params.id;
  const run = getRun(runId);

  if (!run) {
    return NextResponse.json(
      { error: 'Run not found' },
      { status: 404 }
    );
  }

  if (run.status !== 'running' && run.status !== 'queued') {
    return NextResponse.json(
      { error: 'Run is not active' },
      { status: 400 }
    );
  }

  // Kill the child process
  if (run.child && !run.child.killed) {
    run.child.kill('SIGTERM');
  }

  setRunStatus(run, 'canceled');

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/runs/[id]/cancel/route.ts
git commit -m "feat: add cancel route to terminate running CLI processes"
```

---

## Task 9: Create Tool Result Route

**Files:**
- Create: `app/api/runs/[id]/tool-result/route.ts`

- [ ] **Step 1: Create tool-result route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getRun } from '@/lib/runs';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const runId = params.id;
  const run = getRun(runId);

  if (!run) {
    return NextResponse.json(
      { error: 'Run not found' },
      { status: 404 }
    );
  }

  if (run.status !== 'running') {
    return NextResponse.json(
      { error: 'Run is not active' },
      { status: 400 }
    );
  }

  if (!run.stdinOpen) {
    return NextResponse.json(
      { error: 'Run does not support interactive tool results' },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { toolUseId, content, isError } = body;

  if (!toolUseId) {
    return NextResponse.json(
      { error: 'toolUseId is required' },
      { status: 400 }
    );
  }

  // Write tool result to stdin
  if (run.child?.stdin) {
    const userMessage = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: content || '',
            is_error: isError || false,
          },
        ],
      },
    });

    try {
      run.child.stdin.write(`${userMessage}\n`, 'utf8');

      // Remove from pending answers
      run.pendingHostAnswers.delete(toolUseId);

      // If no more pending answers, close stdin
      if (run.pendingHostAnswers.size === 0) {
        run.child.stdin.end();
        run.stdinOpen = false;
      }
    } catch (err) {
      return NextResponse.json(
        { error: 'Failed to write tool result' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/runs/[id]/tool-result/route.ts
git commit -m "feat: add tool-result route for AskUserQuestion support"
```

---

## Task 10: Create Global Styles

**Files:**
- Create: `app/globals.css`

- [ ] **Step 1: Create globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 0, 0, 0;
  --background-start-rgb: 255, 255, 255;
  --background-end-rgb: 255, 255, 255;
}

@media (prefers-color-scheme: dark) {
  :root {
    --foreground-rgb: 255, 255, 255;
    --background-start-rgb: 10, 10, 10;
    --background-end-rgb: 20, 20, 20;
  }
}

body {
  color: rgb(var(--foreground-rgb));
  background: linear-gradient(
      to bottom,
      transparent,
      rgb(var(--background-end-rgb))
    )
    rgb(var(--background-start-rgb));
}

.markdown-body {
  @apply prose dark:prose-invert max-w-none;
}

.markdown-body pre {
  @apply bg-gray-100 dark:bg-gray-800 rounded-lg p-4 overflow-x-auto;
}

.markdown-body code {
  @apply bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm;
}

.markdown-body pre code {
  @apply bg-transparent p-0;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "feat: add global styles with Tailwind and markdown support"
```

---

## Task 11: Create Root Layout

**Files:**
- Create: `app/layout.tsx`

- [ ] **Step 1: Create layout.tsx**

```typescript
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Claude CLI Web UI',
  description: 'Web interface for Claude CLI conversations',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: add root layout with metadata"
```

---

## Task 12: Create ThinkingBlock Component

**Files:**
- Create: `components/ThinkingBlock.tsx`

- [ ] **Step 1: Create ThinkingBlock.tsx**

```typescript
'use client';

import { useState } from 'react';

interface ThinkingBlockProps {
  content: string;
}

export function ThinkingBlock({ content }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="my-2 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2 text-left text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-between"
      >
        <span className="flex items-center">
          <svg
            className={`w-4 h-4 mr-2 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Thinking...
        </span>
        <span className="text-xs text-gray-400">
          {content.length} characters
        </span>
      </button>
      {isExpanded && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ThinkingBlock.tsx
git commit -m "feat: add ThinkingBlock component for collapsible thinking display"
```

---

## Task 13: Create ToolCard Component

**Files:**
- Create: `components/ToolCard.tsx`

- [ ] **Step 1: Create ToolCard.tsx**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add components/ToolCard.tsx
git commit -m "feat: add ToolCard component for tool call display"
```

---

##Task 14: Create AssistantMessage Component

**Files:**
- Create: `components/AssistantMessage.tsx`

- [ ] **Step 1: Create AssistantMessage.tsx**

```typescript
'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AgentEvent } from '@/lib/types';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCard } from './ToolCard';

interface AssistantMessageProps {
  events: AgentEvent[];
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

export function AssistantMessage({ events }: AssistantMessageProps) {
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
    <div className="space-y-2">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'text':
            return (
              <div key={index} className="markdown-body">
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
            return block.tool ? (
              <ToolCard key={index} tool={block.tool} />
            ) : null;

          default:
            return null;
        }
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/AssistantMessage.tsx
git commit -m "feat: add AssistantMessage component for rendering agent events"
```

---

## Task 15: Create MessageList Component

**Files:**
- Create: `components/MessageList.tsx`

- [ ] **Step 1: Create MessageList.tsx**

```typescript
'use client';

import { useEffect, useRef } from 'react';
import { AgentEvent } from '@/lib/types';
import { AssistantMessage } from './AssistantMessage';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  events?: AgentEvent[];
  status?: string;
}

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Claude CLI Web UI</h2>
          <p>Start a conversation by typing a message below.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[80%] rounded-lg px-4 py-2 ${
              message.role === 'user'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800'
            }`}
          >
            {message.role === 'user' ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <>
                <AssistantMessage events={message.events || []} />
                {message.status === 'running' && (
                  <div className="mt-2 flex items-center text-sm text-gray-500">
                    <div className="animate-pulse mr-2">●</div>
                    Thinking...
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/MessageList.tsx
git commit -m "feat: add MessageList component for displaying conversation"
```

---

## Task 16: Create ChatPanel Component

**Files:**
- Create: `components/ChatPanel.tsx`

- [ ] **Step 1: Create ChatPanel.tsx**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add components/ChatPanel.tsx
git commit -m "feat: add ChatPanel component with SSE streaming"
```

---

## Task 17: Create Main Page

**Files:**
- Create: `app/page.tsx`

- [ ] **Step 1: Create page.tsx**

```typescript
import { ChatPanel } from '@/components/ChatPanel';

export default function Home() {
  return <ChatPanel />;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add main page with ChatPanel"
```

---

## Task 18: Test End-to-End Flow

**Files:**
- None (manual testing)

- [ ] **Step 1: Start development server**

Run: `cd E:\AIDemos\claude-cli-web-ui && pnpm dev`
Expected: Server starts on random port

- [ ] **Step 2: Open browser**

Open the URL shown in the terminal (e.g., `http://localhost:3000`)

- [ ] **Step 3: Test basic conversation**

1. Type "Hello, how are you?" in the input box
2. Click "Send"
3. Verify that:
   - User message appears on the right
   - Assistant message appears on the left
   - Text streams in real-time
   - Status shows "Thinking..." while running
   - Status changes to "Done" when complete

- [ ] **Step 4: Test tool calls**

1. Type "Read the file package.json"
2. Verify that:
   - Tool call card appears
   - Card shows tool name and input
   - Card can be expanded to show details

- [ ] **Step 5: Test thinking display**

1. Type a complex question that triggers thinking
2. Verify that:
   - Thinking block appears
   - Block can be expanded/collapsed

- [ ] **Step 6: Test cancellation**

1. Start a long-running task
2. Click "Cancel" (if implemented) or refresh the page
3. Verify that the process is terminated

- [ ] **Step 7: Commit final state**

```bash
git add .
git commit -m "feat: complete end-to-end implementation of Claude CLI Web UI"
```

---

## Task 19: Add Error Handling

**Files:**
- Modify: `components/ChatPanel.tsx`
- Modify: `app/api/chat/route.ts`

- [ ] **Step 1: Add error display to ChatPanel**

In `components/ChatPanel.tsx`, add error state and display:

```typescript
// Add to component state
const [error, setError] = useState<string | null>(null);

// Add error display in JSX
{error && (
  <div className="mb-4 p-4 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg">
    {error}
    <button
      onClick={() => setError(null)}
      className="ml-2 underline"
    >
      Dismiss
    </button>
  </div>
)}
```

- [ ] **Step 2: Improve error handling in API route**

In `app/api/chat/route.ts`, add better error messages:

```typescript
// Add CLI detection
const config = getEnvConfig();

// Check if CLI exists
try {
  const testProcess = spawn(config.claudeBin, ['--version']);
  await new Promise((resolve, reject) => {
    testProcess.on('close', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error('CLI not found'));
    });
    testProcess.on('error', reject);
  });
} catch {
  return NextResponse.json(
    { error: `Claude CLI not found at ${config.claudeBin}. Please install it or set CLAUDE_BIN environment variable.` },
    { status: 500 }
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/ChatPanel.tsx app/api/chat/route.ts
git commit -m "feat: add comprehensive error handling"
```

---

## Task 20: Final Integration Test

**Files:**
- None (manual testing)

- [ ] **Step 1: Run all tests**

Run: `cd E:\AIDemos\claude-cli-web-ui && pnpm test`
Expected: All tests pass

- [ ] **Step 2: Build production version**

Run: `cd E:\AIDemos\claude-cli-web-ui && pnpm build`
Expected: Build succeeds without errors

- [ ] **Step 3: Test production build**

Run: `cd E:\AIDemos\claude-cli-web-ui && pnpm start`
Expected: Production server starts and works correctly

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "chore: final integration test and cleanup"
```

---

## Summary

This plan implements a complete Claude CLI Web UI with:

1. **Next.js App Router** setup with TypeScript and Tailwind
2. **Claude stream parser** extracted from Open Design
3. **API Routes** for chat, SSE streaming, cancellation, and tool results
4. **React components** for message display, tool calls, and thinking blocks
5. **Real-time streaming** via Server-Sent Events
6. **Error handling** and edge cases

The implementation follows TDD principles with tests for the stream parser and manual testing for the UI. Each task is self-contained and can be committed independently.
