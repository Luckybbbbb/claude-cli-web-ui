---
name: revert-session-persistence-redesign
description: Revert eb0295c session persistence redesign that introduced CLI JSONL integration, restoring stable local JSON persistence
---

# Revert Session Persistence Redesign

**Date**: 2026-05-28
**Status**: Approved
**Reverts**: eb0295c (feat: session persistence redesign with CLI JSONL integration)

## Problem

Commit eb0295c introduced CLI JSONL-based session discovery and history reading. This caused multiple issues:

1. **cli-discover auto-imported unrelated CLI sessions** — scanned all `~/.claude/projects/{cwd}/*.jsonl` files, importing terminal CLI sessions into the web UI session list
2. **Title corruption** — JSONL user message content parsing was buggy, producing JSON fragments (`{"type":"user","message":{"rol`) and garbled Chinese text as titles
3. **Empty messages** — completion handler stopped saving messages to local JSON (only saved title), and the JSONL reader had parsing issues
4. **Unnecessary complexity** — user confirmed they only want Web UI-created sessions with local JSON persistence

## Design Decisions

- Only display sessions created through the Web UI (no CLI session import)
- Persist messages in local JSON files (data/sessions/{projectId}/{sessionId}.json)
- Remove all CLI JSONL infrastructure (claude-session-reader.ts, history API, cli-discover API)

## Changes

### Delete Files (3)

- `lib/claude-session-reader.ts` — entire file
- `app/api/sessions/[id]/history/route.ts` — entire file
- `app/api/sessions/cli-discover/route.ts` — entire file

### Modify Files (3)

**`lib/sessions.ts`:**
- Remove `findSessionByClaudeSessionId()`, `createSessionFromCli()`, `updateSessionMessages()` (lines 202-284)

**`hooks/useChatSession.ts`:**
- Remove `agentEventCount` variable and incremental persistence (every 10 events)
- Restore completion handler to save `{ id, messages, title }` instead of just `{ id, title }`
- Restore `selectSession()` to read from `/api/sessions/${id}` (returns `session.messages`) instead of `/api/sessions/${id}/history`

**`components/ChatPanel.tsx`:**
- Remove cli-discover fetch call in project change effect
- Restore session loading from `/api/sessions/${id}` with `session.messages`

### Data Cleanup (manual)

After code revert, clean up `data/sessions/` files with corrupted titles or CLI-imported sessions.

## Preserved

- `docs/superpowers/specs/2026-05-28-session-persistence-redesign.md` — kept as historical reference
