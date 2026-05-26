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
  for (const client of Array.from(run.clients)) {
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
    // Close all client connections
    for (const client of Array.from(run.clients)) {
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
