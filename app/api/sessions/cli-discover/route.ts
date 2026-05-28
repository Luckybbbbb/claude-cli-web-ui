import { NextRequest, NextResponse } from 'next/server';
import { listCliSessions } from '@/lib/claude-session-reader';
import { listSessionsMeta, findSessionByClaudeSessionId, createSessionFromCli } from '@/lib/sessions';
import { listProjects } from '@/lib/projects';

// ---------------------------------------------------------------------------
// GET /api/sessions/cli-discover?projectId=<id>
//
// Discover CLI sessions not yet tracked in the web UI and import them.
// Returns { discovered: number, sessions: SessionMeta[] }.
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

    // Resolve project to get cwd
    const projects = await listProjects();
    const project = projects.find((p) => p.id === projectId);

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 },
      );
    }

    // Get CLI sessions from filesystem
    const cliSessions = await listCliSessions(project.path);

    // Get existing web sessions to check for duplicates
    const existingSessions = await listSessionsMeta(projectId);

    // Collect claudeSessionIds already tracked in the web UI.
    // We need to read full session data to access claudeSessionId, so we
    // check via findSessionByClaudeSessionId for each CLI session.
    let discovered = 0;

    for (const cliSession of cliSessions) {
      const existing = await findSessionByClaudeSessionId(cliSession.sessionId);
      if (!existing) {
        await createSessionFromCli(
          projectId,
          project.path,
          cliSession.sessionId,
          cliSession.title,
        );
        discovered++;
      }
    }

    // Re-fetch the merged session list
    const sessions = await listSessionsMeta(projectId);

    return NextResponse.json({ discovered, sessions });
  } catch (error) {
    console.error('GET /api/sessions/cli-discover error:', error);
    return NextResponse.json(
      { error: 'Failed to discover CLI sessions' },
      { status: 500 },
    );
  }
}
