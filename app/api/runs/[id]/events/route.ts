import { NextRequest } from 'next/server';
import { getRun, addClient, removeClient, getRunCount } from '@/lib/runs';
import { SSEClient } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const runId = params.id;
  const runCount = getRunCount();
  const run = getRun(runId);

  if (!run) {
    console.log(`[events] Run ${runId} not found. Total runs: ${runCount}`);
    return new Response('Run not found', { status: 404 });
  }

  console.log(`[events] Found run ${runId}, status: ${run.status}, events: ${run.events.length}`);

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
