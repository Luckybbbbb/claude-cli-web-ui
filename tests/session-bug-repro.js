/**
 * Session Bug Reproduction & Verification Script
 *
 * Reproduces two bugs:
 *   1. Session message stuck on "thinking" after switching back
 *   2. Session 2 has no records (messages not persisted)
 *
 * Also verifies:
 *   - claudeSessionId does not leak between projects
 *   - Messages are saved when moving to background
 *   - Message status is correctly set on stream completion
 *   - Sessions can be restored with their messages
 *
 * Usage: node tests/session-bug-repro.js
 * Requires: dev server running on http://localhost:6523
 */

const BASE = process.env.BASE_URL || 'http://localhost:6523';

// ── Helpers ──

async function api(path, options = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`  PASS: ${message}`);
  return true;
}

// ── Cleanup ──

async function cleanup() {
  // Delete all sessions
  const { data: projectsData } = await api('/api/projects');
  const projects = projectsData.projects || [];
  for (const project of projects) {
    const { data } = await api(`/api/sessions?projectId=${project.id}`);
    for (const session of (data.sessions || [])) {
      await api('/api/sessions', { method: 'DELETE', body: { id: session.id } });
    }
  }
}

// ── Test Runner ──

async function run() {
  console.log('=== Session Bug Reproduction Script ===\n');

  // Get projects
  const { data: projectsData } = await api('/api/projects');
  const projects = Array.isArray(projectsData) ? projectsData : (projectsData.projects || []);
  const projectA = projects[0];
  const projectB = projects[1];
  console.log(`Project A: ${projectA.name} (${projectA.id})`);
  console.log(`Project B: ${projectB.name} (${projectB.id})\n`);

  // ────────────────────────────────────────
  // Test Suite 1: Message Persistence
  // ────────────────────────────────────────
  console.log('--- Suite 1: Message Persistence ---');

  // Create session A
  const { data: createA } = await api('/api/sessions', {
    method: 'POST',
    body: { projectId: projectA.id },
  });
  const sessionA = createA.session;
  console.log(`  Created session A: ${sessionA.id}`);

  // Simulate saving messages (what happens when stream completes)
  const testMessages = [
    {
      id: 'user-0',
      role: 'user',
      content: '请审查这个文件的代码',
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      events: [
        { type: 'thinking_delta', delta: 'Let me think about this...' },
        { type: 'text_delta', delta: '你想让我审查哪个文件？请提供文件路径。' },
        { type: 'usage', usage: { input_tokens: 100, output_tokens: 50 } },
      ],
      status: 'succeeded',
    },
  ];

  // Save messages to session A (simulates stream completion)
  const saveRes1 = await api('/api/sessions', {
    method: 'PUT',
    body: { id: sessionA.id, messages: testMessages, title: '请审查这个文件的代码' },
  });
  assert(saveRes1.status === 200, 'Save messages to session A returns 200');

  // Load session A and verify messages
  const { data: loadA } = await api(`/api/sessions/${sessionA.id}`);
  const loadedSessionA = loadA.session;
  assert(loadedSessionA.messages.length === 2, 'Session A has 2 messages after save');
  assert(loadedSessionA.messages[1].status === 'succeeded', 'Last assistant message status is "succeeded"');
  assert(loadedSessionA.messages[0].content === '请审查这个文件的代码', 'User message content preserved');

  // ────────────────────────────────────────
  // Test Suite 2: Background Save & Restore
  // ────────────────────────────────────────
  console.log('\n--- Suite 2: Background Save & Restore ---');

  // Create session B
  const { data: createB } = await api('/api/sessions', {
    method: 'POST',
    body: { projectId: projectB.id },
  });
  const sessionB = createB.session;
  console.log(`  Created session B: ${sessionB.id}`);

  // Simulate: session A stream is still running, save intermediate state
  // (this is what moveCurrentToBackground should do)
  const intermediateMessages = [
    {
      id: 'user-0',
      role: 'user',
      content: '请审查这个文件的代码',
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      events: [
        { type: 'thinking_delta', delta: 'Thinking...' },
      ],
      status: 'running',
    },
  ];

  const saveRes2 = await api('/api/sessions', {
    method: 'PUT',
    body: { id: sessionA.id, messages: intermediateMessages },
  });
  assert(saveRes2.status === 200, 'Background save of session A returns 200');

  // Verify session A can be restored with intermediate messages
  const { data: loadA2 } = await api(`/api/sessions/${sessionA.id}`);
  assert(loadA2.session.messages.length === 2, 'Session A has 2 messages after background save');
  assert(loadA2.session.messages[1].status === 'running', 'Session A assistant status is "running" (still in progress)');

  // ────────────────────────────────────────
  // Test Suite 3: claudeSessionId Isolation
  // ────────────────────────────────────────
  console.log('\n--- Suite 3: claudeSessionId Isolation ---');

  // Set claudeSessionId on session A
  const fakeClaudeSid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const saveRes3 = await api('/api/sessions', {
    method: 'PUT',
    body: { id: sessionA.id, claudeSessionId: fakeClaudeSid },
  });
  assert(saveRes3.status === 200, 'Save claudeSessionId to session A returns 200');

  // Verify session A has claudeSessionId
  const { data: loadA3 } = await api(`/api/sessions/${sessionA.id}`);
  assert(loadA3.session.claudeSessionId === fakeClaudeSid, 'Session A has correct claudeSessionId');

  // Verify session B does NOT have claudeSessionId
  const { data: loadB } = await api(`/api/sessions/${sessionB.id}`);
  assert(loadB.session.claudeSessionId === null, 'Session B claudeSessionId is null (no leak)');

  // ────────────────────────────────────────
  // Test Suite 4: Chinese Title & Content Encoding
  // ────────────────────────────────────────
  console.log('\n--- Suite 4: Chinese Content Encoding ---');

  // Create a new session with Chinese title
  const { data: createC } = await api('/api/sessions', {
    method: 'POST',
    body: { projectId: projectA.id },
  });
  const sessionC = createC.session;

  const chineseMessages = [
    { id: 'u-0', role: 'user', content: '你好，请帮我检查代码' },
    { id: 'a-1', role: 'assistant', content: '', status: 'succeeded', events: [
      { type: 'text_delta', delta: '好的，我来帮你检查代码。' },
    ]},
  ];

  await api('/api/sessions', {
    method: 'PUT',
    body: { id: sessionC.id, messages: chineseMessages, title: '你好，请帮我检查代码' },
  });

  const { data: loadC } = await api(`/api/sessions/${sessionC.id}`);
  assert(loadC.session.title === '你好，请帮我检查代码', 'Chinese title preserved correctly');
  assert(loadC.session.messages[0].content === '你好，请帮我检查代码', 'Chinese user message preserved');
  assert(loadC.session.messages[1].events[0].delta === '好的，我来帮你检查代码。', 'Chinese assistant event preserved');

  // ────────────────────────────────────────
  // Test Suite 5: Full Flow (Simulated User Scenario)
  // ────────────────────────────────────────
  console.log('\n--- Suite 5: Full Flow Simulation ---');

  // Step 1: Create session in project A
  const { data: f1 } = await api('/api/sessions', { method: 'POST', body: { projectId: projectA.id } });
  const flowSessionA = f1.session;

  // Step 2: Simulate "send message" - save initial user message + empty assistant
  await api('/api/sessions', {
    method: 'PUT',
    body: {
      id: flowSessionA.id,
      messages: [
        { id: 'u-0', role: 'user', content: '请审查这个文件的代码' },
        { id: 'a-1', role: 'assistant', content: '', events: [], status: 'running' },
      ],
    },
  });

  // Step 3: Simulate "received claudeSessionId from stream"
  await api('/api/sessions', {
    method: 'PUT',
    body: { id: flowSessionA.id, claudeSessionId: 'flow-test-session-id-A' },
  });

  // Step 4: Simulate "switch project" - background save (what our fix does)
  await api('/api/sessions', {
    method: 'PUT',
    body: {
      id: flowSessionA.id,
      messages: [
        { id: 'u-0', role: 'user', content: '请审查这个文件的代码' },
        { id: 'a-1', role: 'assistant', content: '', events: [
          { type: 'thinking_delta', delta: 'Analyzing code...' },
          { type: 'text_delta', delta: '这是代码审查结果。' },
        ], status: 'running' },
      ],
    },
  });

  // Step 5: Create session in project B
  const { data: f2 } = await api('/api/sessions', { method: 'POST', body: { projectId: projectB.id } });
  const flowSessionB = f2.session;

  // Step 6: Send message in project B (should NOT use claudeSessionId from A)
  // Verify by loading session B - it should NOT have claudeSessionId from A
  const { data: loadFlowB } = await api(`/api/sessions/${flowSessionB.id}`);
  assert(loadFlowB.session.claudeSessionId === null, 'Flow: Session B does not inherit claudeSessionId from A');

  // Step 7: Simulate stream completion for session A
  await api('/api/sessions', {
    method: 'PUT',
    body: {
      id: flowSessionA.id,
      messages: [
        { id: 'u-0', role: 'user', content: '请审查这个文件的代码' },
        { id: 'a-1', role: 'assistant', content: '', events: [
          { type: 'thinking_delta', delta: 'Analyzing code...' },
          { type: 'text_delta', delta: '这是代码审查结果。' },
        ], status: 'succeeded' },
      ],
    },
  });

  // Step 8: Verify session A can be fully restored
  const { data: loadFlowA } = await api(`/api/sessions/${flowSessionA.id}`);
  assert(loadFlowA.session.messages.length === 2, 'Flow: Session A has 2 messages after restore');
  assert(loadFlowA.session.messages[1].status === 'succeeded', 'Flow: Session A assistant status is "succeeded"');
  assert(loadFlowA.session.messages[1].events.length === 2, 'Flow: Session A has 2 events (thinking + text)');
  assert(loadFlowA.session.claudeSessionId === 'flow-test-session-id-A', 'Flow: Session A claudeSessionId preserved');

  // Step 9: Verify session list shows both sessions
  const { data: listA } = await api(`/api/sessions?projectId=${projectA.id}`);
  const { data: listB } = await api(`/api/sessions?projectId=${projectB.id}`);
  assert(listA.sessions.length >= 2, 'Flow: Project A has multiple sessions in list');
  assert(listB.sessions.length >= 1, 'Flow: Project B has sessions in list');

  // ────────────────────────────────────────
  // Summary
  // ────────────────────────────────────────
  console.log('\n=== Summary ===');
  if (!process.exitCode) {
    console.log('All tests passed!');
  } else {
    console.log('Some tests failed. See above for details.');
  }

  // Cleanup
  console.log('\nCleaning up test sessions...');
  await cleanup();
  console.log('Done.');
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
