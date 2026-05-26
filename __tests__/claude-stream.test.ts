import { describe, it, expect, vi } from 'vitest';
import { createClaudeStreamHandler } from '../lib/claude-stream';
import { AgentEvent } from '../lib/types';

describe('createClaudeStreamHandler', () => {
  function collectEvents(chunks: string[]): AgentEvent[] {
    const events: AgentEvent[] = [];
    const handler = createClaudeStreamHandler((event) => events.push(event));
    for (const chunk of chunks) {
      handler.feed(chunk);
    }
    handler.flush();
    return events;
  }

  describe('system init event', () => {
    it('should parse system init message', () => {
      const events = collectEvents([
        '{"type":"system","subtype":"init","model":"claude-sonnet-4-20250514","session_id":"sess-123"}\n',
      ]);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'status',
        label: 'initializing',
        model: 'claude-sonnet-4-20250514',
        sessionId: 'sess-123',
      });
    });

    it('should handle init with missing model and session_id', () => {
      const events = collectEvents([
        '{"type":"system","subtype":"init"}\n',
      ]);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'status',
        label: 'initializing',
        model: null,
        sessionId: null,
      });
    });
  });

  describe('system status event', () => {
    it('should parse system status message', () => {
      const events = collectEvents([
        '{"type":"system","subtype":"status","status":"requesting"}\n',
      ]);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'status',
        label: 'requesting',
      });
    });

    it('should default status label to working', () => {
      const events = collectEvents([
        '{"type":"system","subtype":"status"}\n',
      ]);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'status',
        label: 'working',
      });
    });
  });

  describe('assistant message with text', () => {
    it('should emit text_delta for text blocks in assistant message', () => {
      const events = collectEvents([
        JSON.stringify({
          type: 'assistant',
          message: {
            id: 'msg-1',
            content: [
              { type: 'text', text: 'Hello, world!' },
            ],
          },
        }) + '\n',
      ]);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'text_delta',
        delta: 'Hello, world!',
      });
    });

    it('should emit turn_end with stop_reason', () => {
      const events = collectEvents([
        JSON.stringify({
          type: 'assistant',
          message: {
            id: 'msg-1',
            stop_reason: 'end_turn',
            content: [
              { type: 'text', text: 'Done.' },
            ],
          },
        }) + '\n',
      ]);

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        type: 'text_delta',
        delta: 'Done.',
      });
      expect(events[1]).toEqual({
        type: 'turn_end',
        stopReason: 'end_turn',
      });
    });
  });

  describe('assistant message with tool_use', () => {
    it('should emit tool_use for tool_use blocks', () => {
      const events = collectEvents([
        JSON.stringify({
          type: 'assistant',
          message: {
            id: 'msg-1',
            content: [
              {
                type: 'tool_use',
                id: 'tool-1',
                name: 'read_file',
                input: { path: '/tmp/test.txt' },
              },
            ],
          },
        }) + '\n',
      ]);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'tool_use',
        id: 'tool-1',
        name: 'read_file',
        input: { path: '/tmp/test.txt' },
      });
    });

    it('should skip tool_use that was already streamed', () => {
      // First, stream the tool_use via stream_event deltas
      const events1 = collectEvents([
        '{"type":"stream_event","event":{"type":"message_start","message":{"id":"msg-1"}}}\n',
        '{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool-1","name":"read_file"}}}\n',
        '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":\\"/tmp/test.txt\\"}"}}}\n',
        '{"type":"stream_event","event":{"type":"content_block_stop","index":0}}\n',
      ]);

      // Should have emitted tool_use from stream
      expect(events1).toHaveLength(1);
      expect(events1[0]).toEqual({
        type: 'tool_use',
        id: 'tool-1',
        name: 'read_file',
        input: { path: '/tmp/test.txt' },
      });

      // Now the assistant message repeats it - should be suppressed
      const events2 = collectEvents([
        '{"type":"stream_event","event":{"type":"message_start","message":{"id":"msg-1"}}}\n',
        '{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool-1","name":"read_file"}}}\n',
        '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":\\"/tmp/test.txt\\"}"}}}\n',
        '{"type":"stream_event","event":{"type":"content_block_stop","index":0}}\n',
        JSON.stringify({
          type: 'assistant',
          message: {
            id: 'msg-1',
            content: [
              {
                type: 'tool_use',
                id: 'tool-1',
                name: 'read_file',
                input: {},
              },
            ],
          },
        }) + '\n',
      ]);

      // Should have 1 tool_use from stream + 0 from assistant = 1 total
      const toolUseEvents = events2.filter((e) => e.type === 'tool_use');
      expect(toolUseEvents).toHaveLength(1);
    });
  });

  describe('stream_event deltas', () => {
    it('should emit text_delta from content_block_delta', () => {
      const events = collectEvents([
        '{"type":"stream_event","event":{"type":"message_start","message":{"id":"msg-1"}}}\n',
        '{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text"}}}\n',
        '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}}\n',
        '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}}\n',
      ]);

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: 'text_delta', delta: 'Hello' });
      expect(events[1]).toEqual({ type: 'text_delta', delta: ' world' });
    });

    it('should emit thinking_delta from content_block_delta', () => {
      const events = collectEvents([
        '{"type":"stream_event","event":{"type":"message_start","message":{"id":"msg-1"}}}\n',
        '{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"thinking"}}}\n',
        '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me think..."}}}\n',
      ]);

      expect(events).toHaveLength(2);
      // First event is empty thinking_delta from content_block_start
      expect(events[0]).toEqual({ type: 'thinking_delta', delta: '' });
      expect(events[1]).toEqual({ type: 'thinking_delta', delta: 'Let me think...' });
    });

    it('should accumulate tool_use input from multiple input_json_delta events', () => {
      const events = collectEvents([
        '{"type":"stream_event","event":{"type":"message_start","message":{"id":"msg-1"}}}\n',
        '{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool-1","name":"write_file"}}}\n',
        '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":"}}}\n',
        '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"/tmp/test.txt\\",\\"content\\":\\"hello\\"}"}}}\n',
        '{"type":"stream_event","event":{"type":"content_block_stop","index":0}}\n',
      ]);

      // Should emit tool_use only after content_block_stop
      const toolUseEvents = events.filter((e) => e.type === 'tool_use');
      expect(toolUseEvents).toHaveLength(1);
      expect(toolUseEvents[0]).toEqual({
        type: 'tool_use',
        id: 'tool-1',
        name: 'write_file',
        input: { path: '/tmp/test.txt', content: 'hello' },
      });
    });

    it('should emit streaming status with ttft_ms', () => {
      const events = collectEvents([
        '{"type":"stream_event","event":{"type":"message_start","message":{"id":"msg-1"},"ttft_ms":150}}\n',
      ]);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'status',
        label: 'streaming',
        ttftMs: 150,
      });
    });
  });

  describe('user message with tool_result', () => {
    it('should emit tool_result events', () => {
      const events = collectEvents([
        JSON.stringify({
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-1',
                content: 'File contents here',
                is_error: false,
              },
            ],
          },
        }) + '\n',
      ]);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'tool_result',
        toolUseId: 'tool-1',
        content: 'File contents here',
        isError: false,
      });
    });

    it('should handle array content in tool_result', () => {
      const events = collectEvents([
        JSON.stringify({
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-1',
                content: [
                  { type: 'text', text: 'Line 1' },
                  { type: 'text', text: 'Line 2' },
                ],
                is_error: false,
              },
            ],
          },
        }) + '\n',
      ]);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'tool_result',
        toolUseId: 'tool-1',
        content: 'Line 1\nLine 2',
        isError: false,
      });
    });

    it('should handle error tool_result', () => {
      const events = collectEvents([
        JSON.stringify({
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-1',
                content: 'Permission denied',
                is_error: true,
              },
            ],
          },
        }) + '\n',
      ]);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'tool_result',
        toolUseId: 'tool-1',
        content: 'Permission denied',
        isError: true,
      });
    });
  });

  describe('result event with usage', () => {
    it('should emit usage event', () => {
      const events = collectEvents([
        JSON.stringify({
          type: 'result',
          usage: { input_tokens: 100, output_tokens: 50 },
          total_cost_usd: 0.005,
          duration_ms: 2000,
        }) + '\n',
      ]);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'usage',
        usage: { input_tokens: 100, output_tokens: 50 },
        costUsd: 0.005,
        durationMs: 2000,
      });
    });

    it('should handle result with missing fields', () => {
      const events = collectEvents([
        '{"type":"result"}\n',
      ]);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'usage',
        usage: null,
        costUsd: null,
        durationMs: null,
      });
    });
  });

  describe('malformed input', () => {
    it('should emit raw event for invalid JSON', () => {
      const events = collectEvents([
        'not valid json\n',
      ]);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'raw',
        line: 'not valid json',
      });
    });

    it('should ignore non-object JSON', () => {
      const events = collectEvents([
        '"just a string"\n',
        '42\n',
        'null\n',
      ]);

      expect(events).toHaveLength(0);
    });

    it('should handle partial JSON in buffer', () => {
      const events: AgentEvent[] = [];
      const handler = createClaudeStreamHandler((event) => events.push(event));

      // Feed partial line
      handler.feed('{"type":"system","subtype');
      expect(events).toHaveLength(0);

      // Complete the line
      handler.feed('":"init","model":"claude-sonnet-4-20250514"}\n');
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'status',
        label: 'initializing',
        model: 'claude-sonnet-4-20250514',
        sessionId: null,
      });
    });

    it('should flush remaining buffer', () => {
      const events: AgentEvent[] = [];
      const handler = createClaudeStreamHandler((event) => events.push(event));

      handler.feed('{"type":"system","subtype":"init","model":"claude-sonnet-4-20250514"}');
      expect(events).toHaveLength(0);

      handler.flush();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'status',
        label: 'initializing',
        model: 'claude-sonnet-4-20250514',
        sessionId: null,
      });
    });
  });

  describe('multi-line streaming', () => {
    it('should handle multiple events in a single chunk', () => {
      const events = collectEvents([
        '{"type":"system","subtype":"init","model":"claude-sonnet-4-20250514"}\n{"type":"system","subtype":"status","status":"requesting"}\n',
      ]);

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        type: 'status',
        label: 'initializing',
        model: 'claude-sonnet-4-20250514',
        sessionId: null,
      });
      expect(events[1]).toEqual({
        type: 'status',
        label: 'requesting',
      });
    });

    it('should handle chunked delivery of a single line', () => {
      const events: AgentEvent[] = [];
      const handler = createClaudeStreamHandler((event) => events.push(event));

      const line = '{"type":"system","subtype":"init","model":"claude-sonnet-4-20250514"}\n';
      const mid = Math.floor(line.length / 2);

      handler.feed(line.slice(0, mid));
      expect(events).toHaveLength(0);

      handler.feed(line.slice(mid));
      expect(events).toHaveLength(1);
    });
  });

  describe('text deduplication', () => {
    it('should not emit text from assistant message if already streamed', () => {
      const events = collectEvents([
        // Stream text via deltas
        '{"type":"stream_event","event":{"type":"message_start","message":{"id":"msg-1"}}}\n',
        '{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text"}}}\n',
        '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}}\n',
        // Then the assistant message repeats it
        JSON.stringify({
          type: 'assistant',
          message: {
            id: 'msg-1',
            content: [
              { type: 'text', text: 'Hello' },
            ],
          },
        }) + '\n',
      ]);

      // Should only have the streamed delta, not the assistant message duplicate
      const textEvents = events.filter((e) => e.type === 'text_delta');
      expect(textEvents).toHaveLength(1);
      expect(textEvents[0]).toEqual({ type: 'text_delta', delta: 'Hello' });
    });
  });
});
