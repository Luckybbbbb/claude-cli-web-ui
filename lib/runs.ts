import { RunState } from './types';

// Use globalThis to persist across Next.js module reloads in development
const globalForRuns = globalThis as unknown as {
  runs: Map<string, RunState> | undefined;
};

if (!globalForRuns.runs) {
  globalForRuns.runs = new Map<string, RunState>();
}

const runs = globalForRuns.runs;

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

export function getRunCount(): number {
  return runs.size;
}

export function addEvent(run: RunState, event: import('./types').AgentEvent): void {
  run.events.push(event);
  for (const client of Array.from(run.clients)) {
    try {
      client.send('agent', event, run.events.length);
    } catch {
      run.clients.delete(client);
    }
  }
}

export function addClient(run: RunState, client: import('./types').SSEClient): void {
  run.clients.add(client);
  run.events.forEach((event, index) => {
    client.send('agent', event, index + 1);
  });
}

export function removeClient(run: RunState, client: import('./types').SSEClient): void {
  run.clients.delete(client);
}

export function setRunStatus(run: RunState, status: RunState['status']): void {
  run.status = status;
  for (const client of Array.from(run.clients)) {
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
    for (const client of Array.from(run.clients)) {
      try {
        client.close();
      } catch {
        // Ignore errors during cleanup
      }
    }
    if (run.child && !run.child.killed) {
      run.child.kill('SIGTERM');
    }
    runs.delete(id);
  }
}
