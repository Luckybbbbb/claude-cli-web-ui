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
