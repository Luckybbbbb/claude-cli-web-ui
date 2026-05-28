import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomBytes } from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  events?: any[];
  status?: string;
}

export interface Session {
  id: string;
  projectId: string;
  title: string;
  cwd: string;
  claudeSessionId: string | null;
  messages: SessionMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  status?: 'running' | 'idle';  // 前端状态，不需要持久化
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSessionsDir(projectId: string): string {
  return join(process.cwd(), 'data', 'sessions', projectId);
}

async function ensureSessionsDir(projectId: string): Promise<string> {
  const dir = getSessionsDir(projectId);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

function getSessionPath(projectId: string, sessionId: string): string {
  return join(getSessionsDir(projectId), `${sessionId}.json`);
}

function generateId(): string {
  return randomBytes(4).toString('hex');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function listSessionsMeta(projectId: string): Promise<SessionMeta[]> {
  const dir = getSessionsDir(projectId);
  if (!existsSync(dir)) {
    return [];
  }

  const files = await readdir(dir);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  const sessions: SessionMeta[] = [];
  for (const file of jsonFiles) {
    try {
      const content = await readFile(join(dir, file), 'utf-8');
      const session: Session = JSON.parse(content);
      sessions.push({
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages.length,
      });
    } catch {
      // skip corrupted files
    }
  }

  sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return sessions;
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const sessionsRoot = join(process.cwd(), 'data', 'sessions');
  if (!existsSync(sessionsRoot)) {
    return null;
  }

  const projectDirs = await readdir(sessionsRoot);
  for (const projectId of projectDirs) {
    const filePath = join(sessionsRoot, projectId, `${sessionId}.json`);
    if (existsSync(filePath)) {
      try {
        const content = await readFile(filePath, 'utf-8');
        return JSON.parse(content) as Session;
      } catch {
        return null;
      }
    }
  }

  return null;
}

export async function createSession(projectId: string, cwd: string): Promise<Session> {
  await ensureSessionsDir(projectId);

  const now = new Date().toISOString();
  const session: Session = {
    id: generateId(),
    projectId,
    title: 'New Session',
    cwd,
    claudeSessionId: null,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  const filePath = getSessionPath(projectId, session.id);
  await writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');

  await evictOldSessions(projectId);

  return session;
}

export async function updateSession(
  sessionId: string,
  updates: { messages?: SessionMessage[]; title?: string; claudeSessionId?: string },
): Promise<Session> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const updated: Session = {
    ...session,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  const filePath = getSessionPath(updated.projectId, sessionId);
  await writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');

  return updated;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const filePath = getSessionPath(session.projectId, sessionId);
  await unlink(filePath);
}

export async function evictOldSessions(projectId: string, maxSessions = 20): Promise<void> {
  const dir = getSessionsDir(projectId);
  if (!existsSync(dir)) {
    return;
  }

  const files = await readdir(dir);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  if (jsonFiles.length <= maxSessions) {
    return;
  }

  const sessions: { filePath: string; updatedAt: string }[] = [];
  for (const file of jsonFiles) {
    try {
      const content = await readFile(join(dir, file), 'utf-8');
      const session: Session = JSON.parse(content);
      sessions.push({ filePath: join(dir, file), updatedAt: session.updatedAt });
    } catch {
      // skip corrupted files
    }
  }

  sessions.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());

  const toDelete = sessions.slice(0, sessions.length - maxSessions);
  await Promise.all(toDelete.map((s) => unlink(s.filePath)));
}

// ---------------------------------------------------------------------------
// CLI Session Discovery Helpers
// ---------------------------------------------------------------------------

/**
 * Find a session by its claudeSessionId (the CLI-assigned session identifier).
 * Scans all project directories under data/sessions/ and returns the first match.
 */
export async function findSessionByClaudeSessionId(claudeSessionId: string): Promise<Session | null> {
  const sessionsRoot = join(process.cwd(), 'data', 'sessions');
  if (!existsSync(sessionsRoot)) {
    return null;
  }

  const projectDirs = await readdir(sessionsRoot);
  for (const projectId of projectDirs) {
    const projectDir = join(sessionsRoot, projectId);
    let files: string[];
    try {
      files = await readdir(projectDir);
    } catch {
      continue;
    }

    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    for (const file of jsonFiles) {
      try {
        const content = await readFile(join(projectDir, file), 'utf-8');
        const session: Session = JSON.parse(content);
        if (session.claudeSessionId === claudeSessionId) {
          return session;
        }
      } catch {
        // skip corrupted files
      }
    }
  }

  return null;
}

/**
 * Create a new session pre-populated with a CLI-discovered claudeSessionId and title.
 * Follows the same pattern as createSession() and runs eviction afterwards.
 */
export async function createSessionFromCli(
  projectId: string,
  cwd: string,
  claudeSessionId: string,
  title: string,
): Promise<Session> {
  await ensureSessionsDir(projectId);

  const now = new Date().toISOString();
  const session: Session = {
    id: generateId(),
    projectId,
    title,
    cwd,
    claudeSessionId,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  const filePath = getSessionPath(projectId, session.id);
  await writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');

  await evictOldSessions(projectId);

  return session;
}

/**
 * Update only the messages (and updatedAt) of an existing session.
 * Delegates to updateSession() internally so the rest of the fields stay untouched.
 */
export async function updateSessionMessages(
  sessionId: string,
  messages: SessionMessage[],
): Promise<Session> {
  return updateSession(sessionId, { messages });
}
