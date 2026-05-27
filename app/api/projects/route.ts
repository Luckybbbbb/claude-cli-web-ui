import { NextRequest, NextResponse } from 'next/server';
import { access } from 'fs/promises';
import {
  listProjects,
  addProject,
  updateProject,
  deleteProject,
} from '@/lib/projects';

// ---------------------------------------------------------------------------
// GET /api/projects — Return all projects
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const projects = await listProjects();
    return NextResponse.json(projects);
  } catch (error) {
    console.error('GET /api/projects error:', error);
    return NextResponse.json(
      { error: 'Failed to list projects' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/projects — Add a new project
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, path } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 },
      );
    }

    if (!path?.trim()) {
      return NextResponse.json(
        { error: 'Project path is required' },
        { status: 400 },
      );
    }

    // Validate that the path exists
    try {
      await access(path.trim());
    } catch {
      return NextResponse.json(
        { error: 'The specified path does not exist' },
        { status: 400 },
      );
    }

    const project = await addProject(name.trim(), path.trim());
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add project';

    if (message.includes('already exists')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    console.error('POST /api/projects error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PUT /api/projects — Update a project
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, path } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Project id is required' },
        { status: 400 },
      );
    }

    // If path is being updated, validate it exists
    if (path !== undefined && path.trim()) {
      try {
        await access(path.trim());
      } catch {
        return NextResponse.json(
          { error: 'The specified path does not exist' },
          { status: 400 },
        );
      }
    }

    const updates: { name?: string; path?: string } = {};
    if (name !== undefined) updates.name = name.trim();
    if (path !== undefined) updates.path = path.trim();

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'At least one of name or path must be provided' },
        { status: 400 },
      );
    }

    const project = await updateProject(id, updates);
    return NextResponse.json(project);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update project';

    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (message.includes('already exists')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    console.error('PUT /api/projects error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/projects — Delete a project
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Project id is required' },
        { status: 400 },
      );
    }

    await deleteProject(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete project';

    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    console.error('DELETE /api/projects error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
