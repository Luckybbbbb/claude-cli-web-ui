import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomBytes } from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDataFilePath(): string {
  return join(process.cwd(), 'data', 'projects.json');
}

function generateId(): string {
  return randomBytes(4).toString('hex');
}

async function ensureDataFile(): Promise<string> {
  const filePath = getDataFilePath();
  const dir = join(process.cwd(), 'data');

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  if (!existsSync(filePath)) {
    // Auto-add current project on first access
    const currentPath = process.cwd();
    const currentName = currentPath.split(/[/\\]/).pop() || 'current-project';
    const initial: Project[] = [
      {
        id: generateId(),
        name: currentName,
        path: currentPath,
        createdAt: new Date().toISOString(),
      },
    ];
    await writeFile(filePath, JSON.stringify(initial, null, 2), 'utf-8');
    return filePath;
  }

  return filePath;
}

async function readProjects(): Promise<Project[]> {
  const filePath = await ensureDataFile();
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as Project[];
}

async function writeProjects(projects: Project[]): Promise<void> {
  const filePath = getDataFilePath();
  await writeFile(filePath, JSON.stringify(projects, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function listProjects(): Promise<Project[]> {
  return readProjects();
}

export async function addProject(name: string, path: string): Promise<Project> {
  const projects = await readProjects();

  // Check for duplicate path
  if (projects.some((p) => p.path === path)) {
    throw new Error('A project with this path already exists');
  }

  const project: Project = {
    id: generateId(),
    name,
    path,
    createdAt: new Date().toISOString(),
  };

  projects.push(project);
  await writeProjects(projects);

  return project;
}

export async function updateProject(
  id: string,
  updates: Partial<Pick<Project, 'name' | 'path'>>,
): Promise<Project> {
  const projects = await readProjects();
  const index = projects.findIndex((p) => p.id === id);

  if (index === -1) {
    throw new Error('Project not found');
  }

  // Check for duplicate path if path is being updated
  if (updates.path && projects.some((p) => p.path === updates.path && p.id !== id)) {
    throw new Error('Another project with this path already exists');
  }

  projects[index] = {
    ...projects[index],
    ...updates,
  };

  await writeProjects(projects);

  return projects[index];
}

export async function deleteProject(id: string): Promise<void> {
  const projects = await readProjects();
  const index = projects.findIndex((p) => p.id === id);

  if (index === -1) {
    throw new Error('Project not found');
  }

  projects.splice(index, 1);
  await writeProjects(projects);
}
