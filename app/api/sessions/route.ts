import { NextRequest, NextResponse } from 'next/server';
import {
  listSessionsMeta,
  createSession,
  updateSession,
  deleteSession,
} from '@/lib/sessions';
import { listProjects } from '@/lib/projects';

// ---------------------------------------------------------------------------
// GET /api/sessions — List sessions for a project
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 },
      );
    }

    const sessions = await listSessionsMeta(projectId);
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('GET /api/sessions error:', error);
    return NextResponse.json(
      { error: 'Failed to list sessions' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/sessions — Create a new session
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 },
      );
    }

    // Validate that the project exists
    const projects = await listProjects();
    const project = projects.find((p) => p.id === projectId);

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 },
      );
    }

    const session = await createSession(projectId, project.path);
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create session';
    console.error('POST /api/sessions error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PUT /api/sessions — Update a session
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, messages, title, claudeSessionId } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Session id is required' },
        { status: 400 },
      );
    }

    const updates: { messages?: any[]; title?: string; claudeSessionId?: string } = {};
    if (messages !== undefined) updates.messages = messages;
    if (title !== undefined) updates.title = title;
    if (claudeSessionId !== undefined) updates.claudeSessionId = claudeSessionId;

    const session = await updateSession(id, updates);
    return NextResponse.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update session';

    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    console.error('PUT /api/sessions error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/sessions — Delete a session
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Session id is required' },
        { status: 400 },
      );
    }

    await deleteSession(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete session';

    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    console.error('DELETE /api/sessions error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
