# Claude CLI Web UI - Design Spec

**Status:** Draft v1.0 · 2026-05-26
**Goal:** Extract core Claude CLI message flow from Open Design into a standalone Next.js app for interactive web-based conversations.

---

## 1. Product in one sentence

> A web UI that starts Claude CLI sessions and streams real-time agent events (text, tool calls, thinking) to the browser.

## 2. Architecture

### Single-process Next.js

```
Next.js App (单进程, 随机端口)
├── API Routes
│   ├── POST /api/chat          → 启动 Claude CLI 运行
│   ├── GET  /api/runs/:id/events → SSE 流式输出
│   └── POST /api/runs/:id/cancel → 取消运行
├── 内存存储
│   └── Map<runId, RunState>
└── 前端页面
    ├── ChatPanel (输入框 + 消息列表)
    └── AssistantMessage (渲染 agent 事件)
```

### Data Flow

1. User types prompt → POST /api/chat → spawn `claude --print --output-format stream-json`
2. CLI stdout → JSONL parser → AgentEvent[] → store in memory RunState
3. Frontend GET /api/runs/:id/events → SSE stream pushes events
4. Frontend renders: text_delta → live markdown, tool_use → card, thinking_delta → collapsible

## 3. Core Modules

### 3.1 Claude CLI Stream Parser (`lib/claude-stream.ts`)

Extracted from `apps/daemon/src/claude-stream.ts` in Open Design.

**Responsibilities:**
- Parse JSONL output from `claude --print --output-format stream-json`
- Handle incremental events: text_delta, thinking_delta, input_json_delta
- Deduplication: streamedToolUseIds, textStreamed
- Emit UI-friendly AgentEvent types

**CLI Invocation:**
```typescript
const child = spawn('claude', [
  '--print',
  '--output-format', 'stream-json',
  '--cwd', workingDir,
  composedPrompt
], {
  stdio: ['pipe', 'pipe', 'pipe'],  // stdin stays open for AskUserQuestion
});
```

### 3.2 Memory Store (`lib/runs.ts`)

```typescript
interface RunState {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  events: AgentEvent[];
  child?: ChildProcess;
  stdinOpen: boolean;
  pendingHostAnswers: Set<string>;
  clients: Set<SSEClient>;
}
```

**No persistence** — runs are lost on restart.

### 3.3 API Routes

| Route | Method | Responsibility |
|---|---|---|
| `/api/chat` | POST | Create Run, spawn CLI, return runId |
| `/api/runs/:id/events` | GET | SSE stream of agent events |
| `/api/runs/:id/cancel` | POST | Cancel run (SIGTERM) |

### 3.4 Frontend Components

| Component | Responsibility |
|---|---|
| `ChatPanel` | Input box + message list container |
| `AssistantMessage` | Render agent events (markdown, tool calls, thinking) |
| `ToolCard` | Render tool calls (Read, Write, Bash, etc.) |
| `ThinkingBlock` | Collapsible thinking display |

## 4. File Structure

```
E:\AIDemos\claude-cli-web-ui\
├── package.json
├── next.config.ts
├── tsconfig.json
├── .env.local                    # CLAUDE_BIN, DEFAULT_MODEL, PORT
├── app/
│   ├── layout.tsx
│   ├── page.tsx                  # Main chat page
│   └── api/
│       ├── chat/route.ts         # POST /api/chat
│       └── runs/
│           └── [id]/
│               ├── events/route.ts  # GET /api/runs/:id/events
│               └── cancel/route.ts  # POST /api/runs/:id/cancel
├── lib/
│   ├── claude-stream.ts          # Claude CLI stream-json parser
│   ├── runs.ts                   # In-memory Run store
│   ├── types.ts                  # AgentEvent types
│   └── env.ts                    # Environment config
├── components/
│   ├── ChatPanel.tsx
│   ├── AssistantMessage.tsx
│   ├── ToolCard.tsx
│   └── ThinkingBlock.tsx
└── styles/
    └── globals.css
```

## 5. Environment Variables

```env
# .env.local
CLAUDE_BIN=claude                    # Claude CLI path
DEFAULT_MODEL=claude-sonnet-4-6      # Default model
DEFAULT_CWD=E:\AIDemos               # Default working directory
PORT=0                               # Random port (0 = auto)
```

**Priority:** env var > default value > hardcoded value

## 6. Error Handling

| Scenario | Handling |
|---|---|
| Claude CLI not installed | Detect at startup, return friendly error |
| CLI process crash | Capture close event, set run.status = 'failed' |
| stdout parse failure | Log raw line, continue processing |
| Client disconnects SSE | Remove from run.clients, cleanup |
| User cancels run | SIGTERM child process, set status = 'canceled' |

## 7. Key Implementation Details

### 7.1 SSE Stream

```typescript
// app/api/runs/[id]/events/route.ts
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const run = runs.get(params.id);
  if (!run) return new Response('Not found', { status: 404 });

  const stream = new ReadableStream({
    start(controller) {
      // Add client to run.clients
      // Send existing events
      // Listen for new events
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

### 7.2 AskUserQuestion Round-trip

1. Claude emits tool_use(AskUserQuestion)
2. Daemon intercepts, records in pendingHostAnswers
3. SSE pushes to web
4. Web renders AskUserQuestionCard
5. User selects answer
6. Web POST /api/runs/:id/tool-result
7. Daemon writes to stdin: JSONL user message with tool_result
8. Claude continues generating

## 8. Testing Strategy

1. **Unit tests**: `claude-stream.ts` parser (extract test cases from Open Design)
2. **Integration tests**: API Routes request/response
3. **Manual testing**: Web UI interaction

## 9. Implementation Steps

1. Initialize Next.js project with TypeScript
2. Extract `claude-stream.ts` and type definitions from Open Design
3. Implement API Routes (chat, events, cancel)
4. Build frontend components (ChatPanel, AssistantMessage, ToolCard)
5. Test end-to-end flow
6. Add error handling and edge cases

## 10. Non-goals

- Multi-session management (single conversation only)
- Persistent storage (runs lost on restart)
- Design system / skill support
- Multiple agent support (Claude CLI only)
- Authentication / authorization
