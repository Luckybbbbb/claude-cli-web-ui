# 迭代设计规格：树状文件选择器 + 后台进程管理 + 自动创建会话

**日期**: 2026-05-27
**状态**: 已批准

## 概述

三项功能迭代，解决当前 Web UI 的三个痛点：

1. **树状文件选择器** — @文件选择改为树状结构，按需加载，支持选择文件夹
2. **后台进程不中断** — 切换项目时 Claude CLI 进程继续运行，会话列表显示 running/idle 状态
3. **自动创建会话** — 发送消息时自动创建会话，防止数据丢失

## 实现顺序

需求 3 → 需求 1 → 需求 2（从简到难，3 是 2 的前置条件）

---

## 需求 3：自动创建会话

### 问题

当用户新增项目后直接发消息（没有手动创建会话），`selectedSessionId` 为 null。`handleSubmit` 的 SSE 流结束后，持久化代码 `if (selectedSessionId)` 条件不满足，消息刷新后丢失。

### 改动

**文件**: `components/ChatPanel.tsx` — `handleSubmit` 函数

在发送消息前增加前置检查：

```
handleSubmit 流程：
1. 检查 selectedSessionId === null && selectedProjectId !== null
2. 如果是 → await fetch POST /api/sessions（projectId, cwd）
3. 拿到 session → setSelectedSessionId + setSessions 更新列表
4. 继续原有的消息发送逻辑（此时 selectedSessionId 已有值）
```

### 影响范围

仅修改 `handleSubmit` 函数开头约 10 行逻辑。

---

## 需求 1：树状文件选择器

### API 改造

**文件**: `app/api/files/route.ts`

从递归扫描全量返回改为单层目录列表：

**新参数**:
- `dir` — 要列出的目录路径（相对项目根目录），默认空字符串（根目录）
- 移除 `limit` 和 `prefix` 参数

**行为**:
- 使用 `readdirSync(dir, { withFileTypes: true })` 仅读取一层
- 过滤 IGNORED_DIRS（node_modules, .git, .next, .superpowers）
- 返回 `{ files: FileEntry[] }`，仅包含指定目录下一层的文件和文件夹
- 结果按类型排序：文件夹在前，文件在后，各按名称排序

### 前端组件改造

**文件**: `components/CommandPalette.tsx` — `trigger.type === 'file'` 部分

**数据模型**:
```ts
interface TreeNode {
  name: string;
  path: string;           // 相对路径
  type: 'file' | 'directory';
  children?: TreeNode[];  // 仅 directory，按需加载
  loaded?: boolean;       // 子节点是否已加载
  expanded?: boolean;     // 是否展开
}
```

**交互流程**:
1. 输入 `@` → 调用 `GET /api/files?dir=&cwd=...` 加载根目录
2. 点击文件夹（左侧行）→ 展开并请求 `GET /api/files?dir=src/components&cwd=...` → 展示子节点
3. 再次点击已展开的文件夹 → 折叠
4. 点击文件 → 插入 `@file path` 到输入框
5. 文件夹行 hover 时右侧显示「选择」文字按钮 → 点击后插入 `@file path`（目录路径）
6. 键盘导航：上下箭头选择、Enter 展开/选中、Escape 关闭

**UI 样式**:
- 文件夹图标（黄色 📁）+ 展开箭头（▶/▼）
- 文件图标（灰色 📄）
- 选中项蓝色高亮背景
- 底部提示栏：「点击文件夹展开 · 点击文件/选择按钮选中」

### 文件夹选择的服务端处理

**文件**: `app/api/chat/route.ts` — `resolveReferences`

当 `@file` 引用的路径是目录时：
1. 递归扫描目录下所有文件（排除 IGNORED_DIRS）
2. 每个 `file.size <= 50KB` 的文件读取内容
3. 汇总格式：`<file path="dir/file.ts">\n内容\n</file>`
4. 总大小限制 200KB（超出截断）

---

## 需求 2：后台进程不中断

### 核心思路

解耦「UI 当前显示」和「SSE 流接收」。切换项目时不断开流，进程在后台继续运行。

### 状态管理

**文件**: `components/ChatPanel.tsx`

**新增全局追踪**:
```ts
interface BackgroundRun {
  sessionId: string;
  projectId: string;
  runId: string;
  reader: ReadableStreamDefaultReader;
  status: 'running';
  messages: Message[];
  claudeSessionId: string | null;
  abortController: AbortController;  // 用于取消 SSE fetch
}

// useRef 避免重渲染
const backgroundRunsRef = useRef<Map<string, BackgroundRun>>(new Map());
```

### 切换项目时的行为

**当前行为**:
```
handleSelectProject → resetConversation() → cancelStream() → 清空消息
```

**新行为**:
```
handleSelectProject →
  1. 如果当前会话有 running 进程（readerRef.current !== null）：
     a. 将 reader/messages/claudeSessionId 移入 backgroundRunsRef
     b. 不取消 reader，让它继续读取
     c. 后台读取只更新 backgroundRunsRef 中的 messages，不调用 setMessages
  2. 清空 UI 消息（setMessages([])）
  3. 设置 isLoading = false
  4. 加载新项目的会话列表
```

### 后台流的消息处理

**后台 reader 的 processStream**:
- `updateLastAssistantMessage` 需要知道当前是否在后台模式
- 后台模式：只更新 `backgroundRunsRef` 中对应 session 的 messages 数组
- 前台模式：正常调用 `setMessages`（现有逻辑）

实现方式：在 processStream 闭包中捕获 `isBackground: boolean` 标记。

### 后台 → 前台恢复

当用户切回某个项目并选中一个 running 的会话时：
1. 检查 `backgroundRunsRef.has(sessionId)`
2. 如果有 → 从 backgroundRuns 取出最新 messages 和 reader
3. 设置到 UI state：`setMessages(bgRun.messages)`，`readerRef.current = bgRun.reader`
4. 从 backgroundRunsRef 中移除
5. 后续 reader 读取恢复为前台模式（直接 setMessages）

### 进程完成自动保存

后台进程的 `processStream` 在流结束时（`done === true` 或 status === succeeded/failed/canceled）：
1. 将 backgroundRunsRef 中对应的 messages 持久化到服务端
2. 更新 backgroundRunsRef 中 status 为 idle
3. 如果该会话属于当前项目，刷新 sessions 列表

### SessionMeta 扩展

**文件**: `lib/sessions.ts`

```ts
export interface SessionMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  status?: 'running' | 'idle';  // 新增
}
```

**文件**: `components/Sidebar.tsx`

会话列表渲染增加状态标记：
- `running`：绿色脉冲圆点（`@keyframes pulse` 动画）+ 「运行中」标签
- `idle`（默认）：不显示额外标记

**数据来源**: 前端从 `backgroundRunsRef` 同步状态到 `sessions` state。切换项目加载会话列表时，与 backgroundRunsRef 交叉检查，标记 running 状态。

### 会话列表数据同步

`ChatPanel` 中新增 effect：
```
当 backgroundRunsRef 变化时（通过手动触发机制），遍历 sessions：
  如果 backgroundRunsRef.has(session.id) → session.status = 'running'
  否则 → session.status = 'idle'
```

因为 useRef 变化不触发重渲染，需要一个 `backgroundVersion` state 作为手动触发器：
```ts
const [bgVersion, setBgVersion] = useState(0);
// 每次 register/unregister background run 时调用 setBgVersion(v => v + 1)
```

### 删除 running 会话

在 `handleDeleteSession` 中，先检查 backgroundRunsRef：
1. 如果该会话有后台进程 → 取消 reader + 关闭 SSE 连接
2. 调用 `POST /api/runs/{runId}/cancel` 取消服务端进程
3. 从 backgroundRunsRef 中移除
4. 继续正常的删除流程

### 竞态条件处理

1. **快速切换项目 A → B → C**：每次切换只是注册/恢复，不取消任何 reader
2. **同一会话重复提交**：`isLoading` 判断已有保护
3. **后台进程完成时用户正在看别的项目**：自动保存 + 刷新当前项目的 sessions 列表（如果匹配的话）

---

## 文件改动清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `app/api/files/route.ts` | 重写 | 单层目录列表 API |
| `app/api/chat/route.ts` | 修改 | resolveReferences 支持文件夹 |
| `components/ChatPanel.tsx` | 修改 | 自动创建会话 + 后台进程管理 |
| `components/CommandPalette.tsx` | 修改 | 树状文件选择器 UI |
| `components/Sidebar.tsx` | 修改 | running/idle 状态标记 |
| `lib/sessions.ts` | 修改 | SessionMeta 增加 status 字段 |

---

## 非目标

- 不实现跨浏览器标签页的状态同步
- 不实现后台进程的 notification 推送（如桌面通知）
- 不修改 `/api/sessions` 服务端 API 的存储格式（status 仅前端状态）
