import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { createRun, addEvent, setRunStatus } from '@/lib/runs';
import { createClaudeStreamHandler } from '@/lib/claude-stream';
import { getEnvConfig } from '@/lib/env';
import { ChatRequest, ChatResponse } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { message, cwd, model } = body;

    if (!message?.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const config = getEnvConfig();

    // Check if CLI exists
    try {
      const testProcess = spawn(config.claudeBin, ['--version']);
      await new Promise((resolve, reject) => {
        testProcess.on('close', (code) => {
          if (code === 0) resolve(undefined);
          else reject(new Error('CLI not found'));
        });
        testProcess.on('error', reject);
      });
    } catch {
      return NextResponse.json(
        { error: `Claude CLI not found at ${config.claudeBin}. Please install it or set CLAUDE_BIN environment variable.` },
        { status: 500 }
      );
    }

    const runId = randomUUID();
    const run = createRun(runId);
    const workingDir = cwd || config.defaultCwd;

    // Build Claude CLI arguments
    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--cwd', workingDir,
    ];

    if (model) {
      args.push('--model', model);
    }

    // Spawn Claude CLI process
    const child = spawn(config.claudeBin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
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
      addEvent(run, { type: 'error', message: err.message });
      setRunStatus(run, 'failed');
    });

    // Write prompt to stdin
    if (child.stdin) {
      const userMessage = JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: message }],
        },
      });
      child.stdin.write(`${userMessage}\n`, 'utf8');
      run.stdinOpen = true;
    }

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
