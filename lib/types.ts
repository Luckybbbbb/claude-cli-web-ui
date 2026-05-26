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
