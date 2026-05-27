# 设计文档：Claude CLI 交互式模式（长连接）

## 背景

当前 Web UI 使用 Claude CLI 的 `--print` 模式，每条消息 spawn 一个新进程，stdin 写入 prompt 后立即关闭。这导致：

1. **AskUserQuestion 无法交互**：stdin 关闭后 CLI 无法等待用户输入，自动选择默认项
2. **每条消息都有进程启动开销**：spawn + `--resume` 恢复上下文增加延迟
3. **已有机制未激活**：项目预置了 `pendingHostAnswers` + `tool-result` API 的完整回传机制，但因 stdin 提前关闭而无法使用

## 设计目标

将 Claude CLI 从 `--print` 一次性模式切换为交互式长连接模式，实现：
- 真正的 AskUserQuestion 交互（stdin 回传 tool_result）
- 每会话一个进程，消息通过 stdin 持续发送
- 保持现有所有功能不变（后台进程、会话持久化、@file 引用等）

## 第一步：协议验证

在正式实施前，先验证无 `--print` 模式下的 JSONL 交互协议：

```bash
claude --output-format stream-json
# stdin 写入（不关闭）：
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"你好"}]}}
# 观察 stdout 输出
# 继续写入第二条消息
# 验证 AskUserQuestion tool_result 回传
```

验证要点：
1. stdin 写入后进程是否立即处理（不需要 EOF）
2. stdout 输出格式是否与 `--print` 一致
3. 多轮消息通过 stdin 持续交互
4. tool_result 回传被正确接收

## 架构设计

### 每会话一进程模型

```
Session 创建
  → 首条消息时 spawn: claude --output-format stream-json --model <model>
  → stdin 保持打开，stdout 连接到 SSE 流
  → 进程与 sessionId 绑定，存入 ProcessPool

用户发消息
  → POST /api/sessions/{id}/message
  → 向已有进程 stdin 写入 JSONL user message
  → 无需 --resume

AskUserQuestion
  → stdout 输出 tool_use → QuestionCard 渲染
  → 用户选择 → POST /api/runs/{id}/tool-result → stdin 写回 tool_result
  → 进程继续生成

切换项目
  → 进程保留在 ProcessPool，reader 继续消费
  → 新项目会话从 ProcessPool 查找或 spawn 新进程

进程超时
  → 空闲 10 分钟自动关闭
  → 下次消息重新 spawn + --resume 恢复上下文
```

### ProcessPool 状态管理

新增 `lib/process-pool.ts`：

```typescript
interface ProcessState {
  sessionId: string;
  projectId: string;
  child: ChildProcess;
  runId: string;
  status: 'active' | 'idle' | 'closed';
  lastActivityAt: number;
  claudeSessionId: string;
}
```

- 使用 `globalThis` Map 持久化（跨 HMR）
- 30 秒间隔检查空闲进程，超过 10 分钟的 SIGTERM 清理
- 不限制后台进程数量（保留当前行为）

### 现有 vs 新架构对比

| 现有（--print） | 新（交互式） |
|---|---|
| 每条消息 spawn 新进程 | 每会话一个长期进程 |
| stdin 写完即关 | stdin 保持打开 |
| --resume 恢复上下文 | 同一进程内自然延续 |
| AskUserQuestion 无法交互 | 真正的 tool_result 回传 |
| runs.ts 管理 run | 新增 ProcessPool 管理进程 |

## API 变更

### `POST /api/chat` → `POST /api/sessions/{id}/message`

- 从 ProcessPool 查找 sessionId 对应的进程
- 进程存在：向 stdin 写入 user message JSONL
- 进程不存在：spawn 新进程（无 `--print`），stdin 保持打开
- @file/@url 引用解析不变
- 返回 `{ runId }`

stdin 写入格式：
```jsonl
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"消息内容"}]}}
```

### `POST /api/runs/{id}/tool-result`（激活）

- `stdinOpen` 始终为 true
- 前端 `handleAnswer` 直接调此端点
- 写入后从 `pendingHostAnswers` 删除，清空时关闭 stdin

### `GET /api/runs/{id}/events`（不变）

### `POST /api/runs/{id}/cancel`（不变）

### 空闲清理

- ProcessPool 内 `setInterval`（30秒）检查
- 超过 10 分钟无活动的进程 SIGTERM + 从 Pool 移除

## 前端变更

### ChatPanel.tsx

1. **handleSubmit**：请求 URL 从 `/api/chat` 改为 `/api/sessions/{id}/message`
2. **handleAnswer**：从 `handleSubmit(answer)` 改为 `POST /api/runs/{runId}/tool-result`
3. 后台进程管理逻辑不变

### 不需要改动的组件

- MessageList、AssistantMessage、QuestionCard — 已对齐
- Sidebar、Header、EmptyState — 无需改动
- CommandPalette、文件树 — 无需改动
- claude-stream.ts — 流解析不变
- sessions.ts — 会话持久化不变

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `lib/process-pool.ts` | 新建：进程池管理 |
| `app/api/sessions/[id]/message/route.ts` | 新建：发送消息端点 |
| `app/api/chat/route.ts` | 修改：去掉 `--print`，stdin 保持打开 |
| `app/api/runs/[id]/tool-result/route.ts` | 修改：适配 stdinOpen=true |
| `components/ChatPanel.tsx` | 修改：handleSubmit URL + handleAnswer 调用 |

## 实施顺序

1. 协议验证：测试无 `--print` 模式的 stdin/stdout JSONL 交互
2. 新建 `lib/process-pool.ts`：进程池 + 空闲清理
3. 修改 `chat/route.ts`：去掉 `--print`，stdin 保持打开
4. 新建 `sessions/[id]/message/route.ts`：复用进程发消息
5. 修改 `tool-result/route.ts`：适配交互模式
6. 修改 `ChatPanel.tsx`：API 调用方式切换
7. 端到端测试：普通对话 + AskUserQuestion + 后台切换
