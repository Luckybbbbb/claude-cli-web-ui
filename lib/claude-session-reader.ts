/**
 * Reads Claude CLI's persisted JSONL session files from
 * ~/.claude/projects/{encoded-cwd}/{sessionId}.jsonl and converts them into
 * the web UI's Message[] format (compatible with hooks/useChatSession.ts).
 *
 * The JSONL format produced by `claude --output-format stream-json --verbose`
 * contains one JSON object per line. Relevant types:
 *
 *   - { type: "user",    message: { content: string | {type,text}[] } }
 *   - { type: "assistant", message: { content: [{type,...}], stop_reason? } }
 *   - { type: "result",  ... }
 *   - { type: "system", "queue-operation", "attachment", ... }  (skipped)
 */

import { readdir, stat, open } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import * as os from 'os';

import { AgentEvent } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JsonlMessage {
  role: 'user' | 'assistant';
  content: string;
  events?: AgentEvent[];
  status?: string;
}

export interface CliSessionInfo {
  sessionId: string;
  title: string;
  lastModified: string;
  messageCount: number;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Encode a working-directory path the same way Claude CLI encodes it into a
 * directory name under ~/.claude/projects/.
 *
 * Rules (reverse-engineered from Claude CLI behaviour):
 *   - ':'  → '-'
 *   - '\'  → '-'
 *   - '/'  → '-'
 *
 * Examples:
 *   "E:\AIDemos\superpower-claude-plus" → "E--AIDemos-superpower-claude-plus"
 *   "C:\Users\admin\Desktop"            → "C--Users-admin-Desktop"
 */
export function encodeCwd(cwd: string): string {
  return cwd
    .replace(/:/g, '-')
    .replace(/\\/g, '-')
    .replace(/\//g, '-');
}

/**
 * Return the directory Claude CLI uses to store sessions for a given cwd.
 *
 *   ~/.claude/projects/{encoded-cwd}/
 */
export function getClaudeProjectDir(cwd: string): string {
  return join(os.homedir(), '.claude', 'projects', encodeCwd(cwd));
}

// ---------------------------------------------------------------------------
// JSONL line helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Extract the text payload from a user message's `content` field.
 *
 * `content` can be:
 *   - a plain string
 *   - an array of content blocks like [{ type: "text", text: "..." }, ...]
 */
function extractUserText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((c): c is Record<string, unknown> => isRecord(c) && c.type === 'text')
      .map((c) => String(c.text ?? ''))
      .join('\n');
  }
  return '';
}

/**
 * Extract text and tool_use events from an assistant message's content blocks.
 *
 * content is an array of blocks:
 *   - { type: "text",    text: string }
 *   - { type: "thinking", thinking: string }
 *   - { type: "tool_use", id, name, input }
 */
function extractAssistantParts(
  content: unknown[],
): { text: string; events: AgentEvent[] } {
  let text = '';
  const events: AgentEvent[] = [];

  for (const block of content) {
    if (!isRecord(block)) continue;

    if (block.type === 'text' && typeof block.text === 'string') {
      text += block.text;
    } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
      events.push({ type: 'thinking_delta', delta: block.thinking });
    } else if (block.type === 'tool_use') {
      events.push({
        type: 'tool_use',
        id: String(block.id ?? ''),
        name: String(block.name ?? ''),
        input: block.input ?? null,
      });
    }
  }

  return { text, events };
}

// ---------------------------------------------------------------------------
// Core reader
// ---------------------------------------------------------------------------

/**
 * Read a single Claude CLI JSONL session file and convert it to an array of
 * JsonlMessage objects compatible with the web UI's Message type.
 *
 * Returns `null` if the file does not exist.
 *
 * Uses line-by-line streaming to handle large files without loading the
 * entire content into memory at once.
 */
export async function readJsonlSession(
  cwd: string,
  claudeSessionId: string,
): Promise<JsonlMessage[] | null> {
  const dir = getClaudeProjectDir(cwd);
  const filePath = join(dir, `${claudeSessionId}.jsonl`);

  if (!existsSync(filePath)) return null;

  const messages: JsonlMessage[] = [];
  let pendingAssistant: JsonlMessage | null = null;

  /**
   * Flush the currently-accumulated assistant message (if any) into the
   * messages array.
   */
  function flushAssistant(status?: string): void {
    if (!pendingAssistant) return;
    if (status) pendingAssistant.status = status;
    messages.push(pendingAssistant);
    pendingAssistant = null;
  }

  const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      // skip malformed lines
      continue;
    }

    if (!isRecord(obj)) continue;

    // --- Skip non-essential types ---
    if (
      obj.type === 'system' ||
      obj.type === 'queue-operation' ||
      obj.type === 'attachment'
    ) {
      continue;
    }

    // --- User message ---
    if (obj.type === 'user') {
      flushAssistant();
      const text = extractUserText(
        isRecord(obj.message) ? obj.message.content : undefined,
      );
      messages.push({ role: 'user', content: text });
      continue;
    }

    // --- Assistant message (may arrive multiple times per turn) ---
    if (
      obj.type === 'assistant' &&
      isRecord(obj.message) &&
      Array.isArray(obj.message.content)
    ) {
      if (!pendingAssistant) {
        pendingAssistant = { role: 'assistant', content: '', events: [] };
      }

      const { text, events } = extractAssistantParts(
        obj.message.content as unknown[],
      );
      pendingAssistant.content += text;
      if (events.length > 0) {
        pendingAssistant.events = [
          ...(pendingAssistant.events ?? []),
          ...events,
        ];
      }

      // If stop_reason is present this is the final assistant chunk for the
      // turn — flush immediately so the message order stays correct.
      if (typeof obj.message.stop_reason === 'string') {
        flushAssistant();
      }
      continue;
    }

    // --- Result (finalises the conversation turn) ---
    if (obj.type === 'result') {
      const status =
        typeof obj.result === 'boolean'
          ? obj.result
            ? 'succeeded'
            : 'failed'
          : typeof obj.subtype === 'string'
            ? obj.subtype === 'success'
              ? 'succeeded'
              : 'failed'
            : 'succeeded';

      flushAssistant(status);
      continue;
    }
  }

  // Flush any trailing assistant message that was not closed by a result.
  flushAssistant();

  return messages;
}

// ---------------------------------------------------------------------------
// Session listing
// ---------------------------------------------------------------------------

/**
 * List all Claude CLI sessions for a given working directory.
 *
 * Scans `~/.claude/projects/{encoded-cwd}/*.jsonl`, reads the first user
 * message from each file to use as the title, and returns them sorted by
 * most recently modified first.
 */
export async function listCliSessions(
  cwd: string,
): Promise<CliSessionInfo[]> {
  const dir = getClaudeProjectDir(cwd);

  if (!existsSync(dir)) return [];

  const entries = await readdir(dir);
  const jsonlFiles = entries.filter((f) => f.endsWith('.jsonl'));

  const results: CliSessionInfo[] = [];

  for (const file of jsonlFiles) {
    const filePath = join(dir, file);
    const sessionId = file.slice(0, -'.jsonl'.length);

    try {
      const fileStat = await stat(filePath);
      const lastModified = fileStat.mtime.toISOString();

      // Stream-parse only until we find the first user message for the title
      // and count total user/assistant messages.
      let title = 'New Session';
      let messageCount = 0;

      const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
      const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let obj: unknown;
        try {
          obj = JSON.parse(trimmed);
        } catch {
          continue;
        }

        if (!isRecord(obj)) continue;

        if (obj.type === 'user') {
          messageCount++;
          if (title === 'New Session') {
            const text = extractUserText(
              isRecord(obj.message) ? obj.message.content : undefined,
            );
            if (text) {
              title = text.slice(0, 30).replace(/\n/g, ' ');
            }
          }
        } else if (obj.type === 'assistant') {
          messageCount++;
        } else if (obj.type === 'result') {
          // Keep counting, result does not map 1:1 to a message
        }
      }

      results.push({ sessionId, title, lastModified, messageCount });
    } catch {
      // Skip unreadable files
    }
  }

  // Sort by most recent first
  results.sort(
    (a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime(),
  );

  return results;
}
