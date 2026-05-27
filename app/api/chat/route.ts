import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { readFileSync, statSync } from 'fs';
import { join, isAbsolute } from 'path';
import { createRun, addEvent, setRunStatus, getRunCount } from '@/lib/runs';
import { createClaudeStreamHandler } from '@/lib/claude-stream';
import { getEnvConfig } from '@/lib/env';
import { ChatRequest, ChatResponse } from '@/lib/types';

const MAX_FILE_SIZE = 50 * 1024; // 50KB

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
      let content = readFileSync(filePath, 'utf-8');
      if (stat.size > MAX_FILE_SIZE) {
        content = content.slice(0, MAX_FILE_SIZE) + '\n[truncated - file exceeds 50KB]';
      }
      appended += `<file path="${ref.path}">\n${content}\n</file>\n\n`;
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
    // Prompt is passed as the last positional argument
    const args = [
      '--print',
      '--verbose',
      '--output-format', 'stream-json',
      '--model', effectiveModel,
    ];

    // Resume an existing Claude session if we have a session ID
    if (claudeSessionId) {
      args.push('--resume', claudeSessionId);
    }

    // Add prompt as positional argument (required for --print mode)
    args.push(resolvedMessage);

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

    // In --print mode, prompt is passed as argument, no stdin needed
    run.stdinOpen = false;

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
