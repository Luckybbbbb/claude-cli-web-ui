import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/sessions';

// ---------------------------------------------------------------------------
// GET /api/sessions/:id — Get a single session by ID
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getSession(id);

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error('GET /api/sessions/[id] error:', error);
    return NextResponse.json(
      { error: 'Failed to get session' },
      { status: 500 },
    );
  }
}
