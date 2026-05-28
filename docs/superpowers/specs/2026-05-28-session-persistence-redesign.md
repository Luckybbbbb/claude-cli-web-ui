# Session Persistence Redesign

Date: 2026-05-28

## Problem Statement

Two related bugs in the session management system:

### Bug 1: Session data loss on switch

When a user has a long conversation and switches to another session (or refreshes the page), the original session's messages disappear. Root causes:

1. **Single-point persistence**: Messages are saved only in the SSE stream's `finally` block via `PUT /api/sessions`. If the stream interrupts (network error, browser backgrounding, process crash), the save may use stale `messagesRef.current`.
2. **Background run overwrite**: When a session moves to background, `bgRun.messages` only contains incremental stream data. The `finally` block saves this incomplete array, overwriting any previously persisted messages.
3. **Race condition**: Switching sessions triggers concurrent reads/writes to the same session JSON file.

### Bug 2: Web/CLI session isolation

Web and CLI maintain independent session systems:
- Web: `data/sessions/{projectId}/{sessionId}.json`
- CLI: `~/.claude/projects/{encoded-cwd}/{claudeSessionId}.jsonl`

Sessions created in CLI are invisible in the web UI, and vice versa (though CLI can resume web sessions via `--resume claudeSessionId`).

## Design

### Core principle

**Claude CLI's JSONL files become the source of truth for message history.** Web's local JSON files serve as metadata cache (title, projectId, timestamps, claudeSessionId mapping).

### Component 1: JSONL Session Reader (`lib/claude-session-reader.ts`)

New module that reads Claude CLI's JSONL session files and converts them to web `Message[]` format.

**CWD encoding**: Claude CLI encodes `E:\AIDemos\superpower-claude-plus` as `E--AIDemos-superpower-claude-plus`. The encoding rule replaces path separators with `--` and removes colons.

**JSONL event parsing**:
- `type: "system"` → skip
- `type: "user"` → extract `message.content` as user Message
- `type: "assistant"` → accumulate into current assistant Message's events array
- `type: "result"` → finalize current assistant message with status

**Output**: Array of `Message` objects compatible with existing rendering pipeline.

**Fallback**: If JSONL file doesn't exist (CLI didn't persist, or was cleaned up), fall back to the local JSON's messages field.

### Component 2: Session History API (`GET /api/sessions/[id]/history`)

New endpoint that returns session messages, preferring JSONL source:

```
Request: GET /api/sessions/{id}/history
Response: { messages: Message[], source: "jsonl" | "local" }

Logic:
1. Load session metadata from local JSON
2. If session has claudeSessionId:
   a. Encode session.cwd → find ~/.claude/projects/{encoded}/{claudeSessionId}.jsonl
   b. Parse JSONL → Message[]
   c. Return with source: "jsonl"
3. Else:
   a. Return session.messages from local JSON
   b. Return with source: "local"
```

### Component 3: CLI Session Discovery (`GET /api/sessions/cli-discover`)

New endpoint that discovers CLI-only sessions and imports them into the web UI:

```
Request: GET /api/sessions/cli-discover?cwd=<project-path>
Response: { discovered: number, sessions: SessionMeta[] }

Logic:
1. Encode cwd → scan ~/.claude/projects/{encoded}/*.jsonl
2. For each JSONL file:
   a. Extract sessionId (from filename minus .jsonl)
   b. Extract title (first user message content, first 30 chars)
   c. Extract lastModified (file mtime)
3. Load existing web sessions for the project
4. For CLI sessions not in web:
   a. Create new session metadata (auto-generated projectId mapping)
5. Return merged session list
```

### Component 4: Fixed Session Selection (`useChatSession.selectSession`)

Modified flow when user clicks a session in the sidebar:

```
1. Check backgroundRunsRef → has running stream? Restore to foreground. (unchanged)
2. Call GET /api/sessions/{id}/history → get messages from JSONL or local
3. Set messages, claudeSessionId, isLoading=false
4. If JSONL returned richer data than local JSON, update local JSON as cache
```

This ensures that even if local JSON has empty messages, the JSONL source provides the full history.

### Component 5: Persistence Hardening

Current: SSE `finally` block does `PUT /api/sessions` with all messages.

Modified:
- **Incremental save during streaming**: Every 10 agent events, save a snapshot to local JSON (not JSONL — that's CLI's domain).
- **`finally` block**: Only update `title` and `updatedAt`, not messages. Messages are already saved incrementally.
- **For sessions without claudeSessionId yet** (CLI hasn't returned it): Keep saving full messages to local JSON as before.
- **For sessions with claudeSessionId**: Local JSON messages field becomes a backup. Primary source is JSONL.

### Component 6: Project Load Flow

When user selects a project in the sidebar:

```
1. Load existing web sessions (GET /api/sessions?projectId=X)
2. Call CLI discovery (GET /api/sessions/cli-discover?cwd=<path>)
3. Merge results: CLI-only sessions are added to the list
4. Select most recent session, load history from JSONL
```

### Component 7: Concurrent Multi-process

Already supported via `backgroundRunsRef` Map. No changes needed.

## Affected Files

| File | Change | Description |
|------|--------|-------------|
| `lib/claude-session-reader.ts` | New | JSONL parser + cwd encoder |
| `app/api/sessions/[id]/history/route.ts` | New | Session history API (JSONL-first) |
| `app/api/sessions/cli-discover/route.ts` | New | CLI session discovery API |
| `hooks/useChatSession.ts` | Modify | `selectSession` uses history API; incremental save during streaming |
| `components/ChatPanel.tsx` | Modify | Trigger CLI discovery on project load |
| `lib/sessions.ts` | Modify | Add upsert helpers for discovered CLI sessions |

## Risk and Mitigation

| Risk | Mitigation |
|------|------------|
| JSONL format changes across Claude CLI versions | Fallback to local JSON; graceful parse error handling |
| CLI session files deleted by user | Fallback to local JSON messages |
| Large JSONL files slow to parse | Stream-parse (line by line), don't load entire file into memory |
| CWD encoding edge cases | Test with various path formats (UNC, spaces, special chars) |

## Success Criteria

1. Switching between sessions never loses messages (verified with long conversations)
2. Page refresh preserves all conversation history
3. Sessions created in CLI appear in web UI after project selection
4. Web sessions are resumable in CLI via `claude --resume`
5. Background runs continue unaffected while switching sessions
