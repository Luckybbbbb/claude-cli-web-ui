# 流式通信系统

<!-- OVERVIEW_START -->
## 概览

### 核心概念
- **stream-json 双向协议**: Claude CLI 的 JSONL 输入输出格式，stdout 输出 system/stream_event/assistant/user/result 五种消息类型，stdin 接收 user message 和 tool_result 两种消息类型
- **SSE 广播**: 服务端使用 Server-Sent Events 将解析后的事件推送给客户端
- **双版本兼容**: 同时处理有/无 --include-partial-messages 的输出格式
- **stdin/stdout 双向通信**: 通过 --input-format stream-json 启用 stdin JSONL 输入，支持 AskUserQuestion 交互式回传

### 关键数据结构
- `RunState`: 运行状态（id, status, events[], child process, SSE clients Set, stdinOpen, pendingHostAnswers）
- `AgentEvent`: 联合类型，UI 只需关注 status/text_delta/thinking_delta/tool_use/tool_result/usage/turn_end/error
- `SSEClient`: 封装 ReadableStreamDefaultController 的发送和关闭方法
- `pendingHostAnswers`: Set<string>，追踪未回答的 AskUserQuestion tool_use ID

### 核心流程
- **服务端**: spawn Claude CLI (--input-format stream-json) -> stdin 写入 user message JSONL -> stdout JSONL -> claude-stream.ts 解析 -> AgentEvent -> runs.ts 存储 + SSE 广播
- **客户端**: POST /api/chat 获取 runId -> fetch /api/runs/{id}/events -> ReadableStream 手动解析 SSE -> UI 更新
- **交互式问答**: tool_use(AskUserQuestion) -> pendingHostAnswers 追踪 -> 用户选择 -> POST tool-result -> stdin 写入 tool_result JSONL

### 与其他系统的交互
- **Claude CLI**: child_process.spawn，--print + --input-format stream-json，shell: true（Windows 兼容）
- **UI 组件**: AgentEvent[] -> AssistantMessage -> ThinkingBlock/ToolCard/QuestionCard/Markdown
- **tool-result API**: 接收前端答案，构建 JSONL tool_result 消息写入 stdin
<!-- OVERVIEW_END -->

---

## 详解

### stream-json 解析器 (claude-stream.ts)

解析器维护以下状态：
- `buffer`: 未完成的行缓冲
- `blocks`: Map<string, BlockState> — 正在组装的 content block（按 messageId:blockIndex 索引）
- `streamedToolUseIds`: Set — 已通过流式 input_json_delta 发出的 tool_use ID（避免 assistant 包装器重复发送）
- `textStreamed`: Set — 已流式发送过文本的消息 ID（避免旧版本回退时重复）

**事件处理流程**:

1. `system.init` -> 发出 `status` 事件（初始化，附带 model 和 sessionId）
2. `stream_event.message_start` -> 记录当前消息 ID
3. `stream_event.content_block_start` -> 注册新 block 状态
4. `stream_event.content_block_delta`:
   - `text_delta` -> 发出 `text_delta`
   - `thinking_delta` -> 发出 `thinking_delta`
   - `input_json_delta` -> 累积到 block 的 input 字符串
5. `stream_event.content_block_stop` -> 如果是 tool_use block，解析累积的 input JSON，发出 `tool_use`
6. `assistant` 消息 -> 处理最终的 content blocks（去重检查），发出 `turn_end`
7. `result` -> 发出 `usage`（tokens, cost, duration）

### SSE 事件流 (runs/[id]/events/route.ts)

- 使用 ReadableStream 构建 SSE 响应
- 新客户端连接时重播所有历史事件
- 发送格式：`event: agent\ndata: {...}\nid: {index}\n\n`
- 客户端断连时自动从 clients Set 移除

### 客户端流处理 (ChatPanel.tsx)

```typescript
const sseResponse = await fetch(`/api/runs/${runId}/events`);
const reader = sseResponse.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';

// 手动解析 SSE 格式
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  // 解析 event: 和 data: 行
}
```

**前台/后台分发**: SSE 事件到达时，根据 `streamContext.isBackground` 决定更新路径：
- 前台模式：调用 `updateLastAssistantMessage` 更新当前 UI 状态
- 后台模式：调用 `updateBgMessage` 更新 BackgroundRun 中的 messages 数组

**后台持久化**: 后台流完成后（status succeeded/failed/canceled），自动从 backgroundRunsRef 中取出 messages 并 PUT /api/sessions 持久化，然后从 Map 中移除。

### @file 和 @url 引用解析 (chat/route.ts)

在发送给 Claude CLI 之前，chat API 会解析消息中的引用：
- `@file <path>` -> 读取文件内容，包装在 `<file path="...">` 标签中
- `@url <url>` -> fetch URL 内容，包装在 `<url href="...">` 标签中
- 最大 50KB 截断限制

### AskUserQuestion 双向通信 (stdin/stdout round-trip)

通过 `--input-format stream-json` 启用 stdin JSONL 输入模式，实现交互式工具回传。

**stdin 写入格式**:

1. **初始 user message**（发送时写入）:
```json
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"用户消息"}]}}
```

2. **tool_result 回传**（用户回答后通过 tool-result API 写入）:
```json
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"xxx","content":"用户选择","is_error":false}]}}
```

**stdin 生命周期**:
- spawn 后立即写入初始 message，保持 stdin 打开（`run.stdinOpen = true`）
- AskUserQuestion tool_use 事件到达时，将 tool_use_id 加入 `run.pendingHostAnswers` Set
- 用户通过 QuestionCard 选择答案后，POST /api/runs/{id}/tool-result
- tool-result API 构建tool_result JSONL 写入 stdin，从 pendingHostAnswers 中移除
- 当 pendingHostAnswers 为空时调用 `stdin.end()` 关闭，Claude 完成对话

**关键设计**:
- 使用 JSONL 格式而非纯文本写入 stdin，解决了 shell 转义问题（之前 prompt 作为位置参数传递时，包含引号/特殊字符的内容会被 shell 解释）
- stdin 保持打开直到所有交互式问答完成，允许多轮 AskUserQuestion
