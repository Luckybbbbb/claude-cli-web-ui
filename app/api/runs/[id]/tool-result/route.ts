import { NextRequest, NextResponse } from 'next/server';
import { getRun } from '@/lib/runs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: runId } = await params;
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const { toolUseId, content, isError } = body as Record<string, unknown>;

    if (!toolUseId || typeof toolUseId !== 'string') {
      return NextResponse.json(
        { error: 'toolUseId is required' },
        { status: 400 }
      );
    }

    // Validate optional fields
    if (content !== undefined && typeof content !== 'string') {
      return NextResponse.json(
        { error: 'content must be a string' },
        { status: 400 }
      );
    }
    if (isError !== undefined && typeof isError !== 'boolean') {
      return NextResponse.json(
        { error: 'isError must be a boolean' },
        { status: 400 }
      );
    }

    if (!run.child?.stdin) {
      return NextResponse.json(
        { error: 'Run child process is not available' },
        { status: 500 }
      );
    }

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

    // Remove from pending answers before write so a failed write
    // does not prevent stdin from ever closing
    run.pendingHostAnswers.delete(toolUseId);

    try {
      run.child.stdin.write(`${userMessage}\n`, 'utf8');
    } catch {
      // stdin already removed from pending; if no more pending
      // answers, close stdin so the process can exit
      if (run.pendingHostAnswers.size === 0 && !run.child.stdin.destroyed) {
        run.child.stdin.end();
        run.stdinOpen = false;
      }
      return NextResponse.json(
        { error: 'Failed to write tool result' },
        { status: 500 }
      );
    }

    // If no more pending answers, close stdin
    if (run.pendingHostAnswers.size === 0 && !run.child.stdin.destroyed) {
      run.child.stdin.end();
      run.stdinOpen = false;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Tool result API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
