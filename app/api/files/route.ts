import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { getEnvConfig } from '@/lib/env';

interface FileEntry {
  path: string;
  type: 'file' | 'directory';
}

const IGNORED_DIRS = new Set(['node_modules', '.git', '.next', '.superpowers']);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const prefix = searchParams.get('prefix') || '';
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 100);

  const cwdParam = searchParams.get('cwd');
  const config = getEnvConfig();
  const rootDir = (cwdParam && cwdParam.length > 0) ? cwdParam : config.defaultCwd;

  const files: FileEntry[] = [];

  function scanDir(dir: string) {
    if (files.length >= limit) return;

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= limit) break;

      const fullPath = join(dir, entry.name);
      const relativePath = relative(rootDir, fullPath);

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;

        // Include directory if its relative path starts with prefix
        if (relativePath.startsWith(prefix) || prefix === '') {
          files.push({ path: relativePath, type: 'directory' });
        }

        // Continue scanning if directory path could contain matching entries
        if (relativePath.startsWith(prefix) || prefix.startsWith(relativePath) || prefix === '') {
          scanDir(fullPath);
        }
      } else if (entry.isFile()) {
        if (relativePath.startsWith(prefix) || prefix === '') {
          files.push({ path: relativePath, type: 'file' });
        }
      }
    }
  }

  try {
    scanDir(rootDir);
  } catch (err) {
    console.error('[files] Error scanning directory:', err);
    return NextResponse.json(
      { error: 'Failed to scan directory' },
      { status: 500 }
    );
  }

  files.sort((a, b) => a.path.localeCompare(b.path));

  return NextResponse.json({ files: files.slice(0, limit) });
}
