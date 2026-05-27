import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { readFileSync, statSync, readdirSync } from 'fs';
import { join, isAbsolute, relative } from 'path';
import { createRun, addEvent, setRunStatus, getRunCount } from '@/lib/runs';
import { createClaudeStreamHandler } from '@/lib/claude-stream';
import { getEnvConfig } from '@/lib/env';
import { ChatRequest, ChatResponse } from '@/lib/types';

const MAX_FILE_SIZE = 50 * 1024; // 50KB
const MAX_TOTAL_DIR_SIZE = 200 * 1024; // 200KB
const MAX_DIR_DEPTH = 5;
const IGNORED_DIRS = new Set(['node_modules', '.git', '.next', '.superpowers']);

/**
 * Recursively collect all file paths under a directory.
 */
function scanDirectoryFiles(dirPath: string, rootDir: string, depth = 0): string[] {
  if (depth > MAX_DIR_DEPTH) return [];

  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      files.push(...scanDirectoryFiles(fullPath, rootDir, depth + 1));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Parse @file and @url references in message and append their content.
 */
async function resolveReferences(message: string, workingDir: string): Promise<string> {
  const fileRefs: { path: string }[] = [];
  const urlRefs: { url: string }[] = [];

  // Match @file <path> and @url <url> patterns
  const fileRegex = /@file\s+(\S+)/g;
  const urlRegex = /@url\s+(\S+)/g;

  let match;
  while ((match = fileRegex.exec(message)) !== null) {
    fileRefs.push({ path: match[1] });
  }
  while ((match = urlRegex.exec(message)) !== null) {
    urlRefs.push({ url: match[1] });
  }

  if (fileRefs.length === 0 && urlRefs.length === 0) {
    return message;
  }

  let appended = '\n\n';

  for (const ref of fileRefs) {
    try {
      const filePath = isAbsolute(ref.path) ? ref.path : join(workingDir, ref.path);
      const stat = statSync(filePath);

      if (stat.isDirectory()) {
        // Directory reference: recursively collect and read files
        const allFiles = scanDirectoryFiles(filePath, filePath);
        let totalSize = 0;

        for (let i = 0; i < allFiles.length; i++) {
          const absPath = allFiles[i];
          try {
            const fileStat = statSync(absPath);
            if (fileStat.size > MAX_FILE_SIZE) continue; // skip oversized individual files
            const relPath = relative(workingDir, absPath);
            let content = readFileSync(absPath, 'utf-8');
            totalSize += content.length;

            if (totalSize > MAX_TOTAL_DIR_SIZE) {
              // Truncate the current file to fit within the budget
              const budget = MAX_TOTAL_DIR_SIZE - (totalSize - content.length);
              if (budget > 0) {
                content = content.slice(0, budget) + '\n[truncated - total directory content exceeds 200KB]';
              } else {
                content = '[skipped - total directory content exceeds 200KB]';
              }
              appended += `<file path="${relPath}">\n${content}\n</file>\n\n`;

              // Count remaining files (including oversized ones that were skipped)
              const omitted = allFiles.length - i - 1;
              if (omitted > 0) {
                appended += `[${omitted} more file(s) omitted - total directory content exceeds 200KB]\n\n`;
              }
              break;
            }

            appended += `<file path="${relPath}">\n${content}\n</file>\n\n`;
          } catch (err) {
            // Skip individual unreadable files silently
            console.error(`[chat] @file dir scan error for ${absPath}:`, err);
          }
        }
      } else {
        // Single file reference (existing logic)
        let content = readFileSync(filePath, 'utf-8');
        if (stat.size > MAX_FILE_SIZE) {
          content = content.slice(0, MAX_FILE_SIZE) + '\n[truncated - file exceeds 50KB]';
        }
        appended += `<file path="${ref.path}">\n${content}\n</file>\n\n`;
      }
    } catch (err) {
      appended += `<file path="${ref.path}">\n[Error: file not found or unreadable]\n</file>\n\n`;
      console.error(`[chat] @file error for ${ref.path}:`, err);
    }
  }

  for (const ref of urlRefs) {
    try {
      const response = await fetch(ref.url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const content = await response.text();
      const truncated = content.length > MAX_FILE_SIZE
        ? content.slice(0, MAX_FILE_SIZE) + '\n[truncated - content exceeds 50KB]'
        : content;
      appended += `<url href="${ref.url}">\n${truncated}\n</url>\n\n`;
    } catch (err) {
      appended += `<url href="${ref.url}">\n[URL 无法访问: ${(err as Error).message}]\n</url>\n\n`;
      console.error(`[chat] @url error for ${ref.url}:`, err);
    }
  }

  return message + appended;
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { message, cwd, model, claudeSessionId } = body;

    if (!message?.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const config = getEnvConfig();
    const workingDir = cwd || config.defaultCwd;

    // Resolve @file and @url references
    const resolvedMessage = await resolveReferences(message, workingDir);

    // Check if CLI exists
    try {
      const testProcess = spawn(config.claudeBin, ['--version'], { shell: true });
      await new Promise((resolve, reject) => {
        testProcess.on('close', (code) => {
          if (code === 0) resolve(undefined);
          else reject(new Error('CLI not found'));
        });
        testProcess.on('error', reject);
      });
    } catch (err) {
      console.error('CLI detection failed:', err);
      return NextResponse.json(
        { error: `Claude CLI not found at ${config.claudeBin}. Please install it or set CLAUDE_BIN environment variable.` },
        { status: 500 }
      );
    }

    const runId = randomUUID();
    const run = createRun(runId);
    console.log(`[chat] Created run ${runId}, total runs: ${getRunCount()}`);
    const effectiveModel = model || config.defaultModel;

    // Build Claude CLI arguments
    // Note: --cwd is not a valid flag, use spawn's cwd option instead
    // --input-format stream-json enables stdin-based multi-turn interaction (AskUserQuestion tool_result round-trip)
    const args = [
      '--print',
      '--verbose',
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--model', effectiveModel,
    ];

    // Resume an existing Claude session if we have a session ID
    if (claudeSessionId) {
      args.push('--resume', claudeSessionId);
    }

    // Resolve working directory to absolute path
    const resolvedCwd = workingDir.startsWith('.')
      ? require('path').resolve(process.cwd(), workingDir)
      : workingDir;

    console.log(`[chat] Spawning claude with args: ${JSON.stringify(args)}, cwd: ${resolvedCwd}`);

    // Spawn Claude CLI process
    const child = spawn(config.claudeBin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,  // Required on Windows for npm global commands (.cmd files)
      cwd: resolvedCwd,
    });

    run.child = child;
    run.status = 'running';

    // Create stream handler
    const handler = createClaudeStreamHandler((event) => {
      addEvent(run, event);
      // Track AskUserQuestion tool calls that need host-side answers
      if (event.type === 'tool_use' && event.name === 'AskUserQuestion' && typeof event.id === 'string') {
        run.pendingHostAnswers.add(event.id);
      }
    });

    // Handle stdout
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      handler.feed(chunk);
    });

    // Handle stderr
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      console.error(`[claude stderr] ${chunk}`);
    });

    // Handle process exit
    child.on('close', (code: number | null) => {
      handler.flush();
      if (code === 0) {
        setRunStatus(run, 'succeeded');
      } else {
        setRunStatus(run, 'failed');
      }
    });

    child.on('error', (err: Error) => {
      console.error(`[chat] Child process error: ${err.message}`);
      addEvent(run, { type: 'error', message: err.message });
      setRunStatus(run, 'failed');
    });

    // Write prompt to stdin as stream-json user message, keep stdin open for tool_result round-trip
    // (AskUserQuestion answers arrive via POST /api/runs/{id}/tool-result)
    const stdinMessage = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: resolvedMessage }],
      },
    }) + '\n';
    child.stdin.write(stdinMessage);
    run.stdinOpen = true;

    const response: ChatResponse = { runId };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
