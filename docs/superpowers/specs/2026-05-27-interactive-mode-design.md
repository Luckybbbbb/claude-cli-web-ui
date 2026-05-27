# 设计文档：Claude CLI 流式输入模式（stdin 长连接）

## 背景

当前 Web UI 使用 Claude CLI 的 `--print` 模式，stdin 写入 prompt 后立即关闭。这导致 AskUserQuestion 无法交互——CLI 自动选择默认项，用户无法真正参与选择。

## 协议验证结果

通过实测确认，Claude CLI 支持 `--print --input-format stream-json` 组合：

- **多轮 stdin 消息**：stdin 保持打开时，可连续写入多条 JSONL user message，CLI 依次处理
- **AskUserQuestion tool_result 回传**：通过 stdin 写入 tool_result JSON，CLI 在同一进程内继续生成
- **进程正常退出**：所有交互完成后关闭 stdin，进程正常退出

关键发现：**不需要去掉 `--print`**，只需加上 `--input-format stream-json` 参数。

## 设计方案（简化版）

保留现有 `--print` + 每条消息 spawn 新进程的架构，仅做最小改动：

1. CLI 参数加上 `--input-format stream-json`
2. stdin 保持打开（不立即 `child.stdin.end()`）
3. `pendingHostAnswers` 机制激活（已有代码，只需 stdin 开放）
4. `handleAnswer` 改为调已有的 `tool-result` API

### 变更前后对比

| 项目 | 变更前 | 变更后 |
|------|--------|--------|
| CLI 参数 | `--print --verbose --output-format stream-json` | `+ --input-format stream-json` |
| stdin | 写入 prompt 后立即关闭 | 保持打开，等待 tool_result |
| stdinOpen | `false` | `true`（有 pendingHostAnswers 时） |
| AskUserQuestion | 自动选择默认项 | 用户选择后通过 stdin 回传 |
| handleAnswer | `handleSubmit(answer)` 发新消息 | `POST /api/runs/{id}/tool-result` |
| 进程模型 | 不变：每条消息 spawn 新进程 | 不变 |
| --resume | 不变 | 不变 |

## 具体改动

### 1. `app/api/chat/route.ts`

- args 加上 `--input-format stream-json`
- prompt 改为 JSONL 格式写入 stdin（匹配 stream-json input 协议）
- stdin 保持打开：`run.stdinOpen = true`
- 无 pendingHostAnswers 时在进程退出后自动清理

stdin 写入格式变更：
```
之前：child.stdin.write(resolvedMessage)
之后：child.stdin.write(JSON.stringify({type:"user",message:{role:"user",content:[{type:"text",text:resolvedMessage}]}}) + "\n")
```

### 2. `components/ChatPanel.tsx`

- `handleAnswer` 改为调 `POST /api/runs/{runId}/tool-result`
- `handleSubmit` 不变（仍 POST /api/chat，每条消息 spawn 新进程）

### 3. 不需要改动的文件

- `tool-result/route.ts`：已有完整实现，只需 `stdinOpen=true` 即可激活
- `claude-stream.ts`：流解析不变，`pendingHostAnswers` 注册逻辑已在上次实现中加入
- `runs.ts`：RunState 不变
- `QuestionCard`、`AssistantMessage`、`MessageList`：已对齐
- 其他所有组件：无需改动

## AskUserQuestion 完整流程

```
1. 用户发消息 → POST /api/chat → spawn claude --print --input-format stream-json ...
2. prompt 通过 stdin 写入（JSONL 格式），stdin 保持打开
3. Claude 处理消息，遇到 AskUserQuestion → stdout 输出 tool_use 事件
4. claude-stream.ts 解析 tool_use，onEvent 回调将其 id 加入 pendingHostAnswers
5. SSE 推送到前端 → QuestionCard 渲染选项
6. 用户点击选项 → POST /api/runs/{runId}/tool-result
7. 服务端通过 stdin 写回 tool_result JSONL
8. Claude 在同一进程内继续生成（使用用户的真实选择）
9. 最终输出 result 事件，进程退出
```

## stdin 关闭时机

- **有 AskUserQuestion**：tool-result API 在 `pendingHostAnswers` 清空后关闭 stdin
- **无 AskUserQuestion**：不需要 stdin 保持打开，但保持打开也不影响（进程处理完自动退出）
- **取消运行**：SIGTERM 终止进程，stdin 自动清理

## 风险与注意事项

- stdin 保持打开意味着进程不会因 stdin EOF 而提前退出，需确保 stdout 正确处理 `result` 事件后的进程退出
- `--input-format stream-json` 是较新的 CLI 参数，需确认用户安装的 CLI 版本支持
