import { NextRequest, NextResponse } from 'next/server';
import { readdirSync } from 'fs';
import { join, relative, normalize, sep } from 'path';
import { getEnvConfig } from '@/lib/env';

interface FileEntry {
  path: string;
  type: 'file' | 'directory';
}

const IGNORED_DIRS = new Set(['node_modules', '.git', '.next', '.superpowers']);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const dir = searchParams.get('dir') || '';

  const cwdParam = searchParams.get('cwd');
  const config = getEnvConfig();
  const rootDir = (cwdParam && cwdParam.length > 0) ? cwdParam : config.defaultCwd;

  // Path traversal prevention: reject if dir contains '..'
  if (dir.includes('..')) {
    return NextResponse.json(
      { error: 'Invalid directory path' },
      { status: 400 }
    );
  }

  const targetDir = dir ? join(rootDir, dir) : rootDir;

  const files: FileEntry[] = [];

  try {
    const entries = readdirSync(targetDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        const fullPath = join(targetDir, entry.name);
        const relativePath = relative(rootDir, fullPath);
        files.push({ path: relativePath, type: 'directory' });
      } else if (entry.isFile()) {
        const fullPath = join(targetDir, entry.name);
        const relativePath = relative(rootDir, fullPath);
        files.push({ path: relativePath, type: 'file' });
      }
    }
  } catch (err) {
    console.error('[files] Error scanning directory:', err);
    return NextResponse.json(
      { error: 'Failed to scan directory' },
      { status: 500 }
    );
  }

  // Sort: directories first (by name), then files (by name)
  files.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.path.localeCompare(b.path);
  });

  return NextResponse.json({ files });
}
