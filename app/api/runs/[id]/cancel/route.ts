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
