import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/sessions';
import { readJsonlSession } from '@/lib/claude-session-reader';

// ---------------------------------------------------------------------------
// GET /api/sessions/:id/history — Session message history
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

    // Try to read from the Claude CLI JSONL file when a claudeSessionId exists
    if (session.claudeSessionId) {
      const jsonlMessages = await readJsonlSession(
        session.cwd,
        session.claudeSessionId,
      );

      if (jsonlMessages) {
        // Add ids for React keys
        const messagesWithIds = jsonlMessages.map((msg, i) => ({
          id: `jsonl-${i}`,
          ...msg,
        }));
        return NextResponse.json({
          messages: messagesWithIds,
          source: 'jsonl',
        });
      }
    }

    // Fall back to locally stored messages
    return NextResponse.json({
      messages: session.messages,
      source: 'local',
    });
  } catch (error) {
    console.error('GET /api/sessions/[id]/history error:', error);
    return NextResponse.json(
      { error: 'Failed to get session history' },
      { status: 500 },
    );
  }
}
