# 项目架构大纲

<!-- OVERVIEW_START -->
## 概览

### 核心概念
- **Claude CLI Web UI**: 基于 Next.js 14 App Router 的浏览器前端，通过 spawn Claude CLI 子进程实现 Web 对话
- **stream-json 双向协议**: Claude CLI 通过 --output-format stream-json 输出 JSONL，通过 --input-format stream-json 接收 stdin JSONL，实现 AskUserQuestion 等交互式工具的双向通信
- **Hook 层架构**: 状态管理从巨型 ChatPanel 抽取为 useChatSession + useProjectList + useSessionList + useBreakpoint 四个 Hook，桌面/平板/移动端布局共享
- **响应式布局**: useBreakpoint 断点检测驱动三种布局（MobileLayout / TabletLayout / ChatPanel），page.tsx 入口路由分发

### 关键数据结构
- `AgentEvent`: 联合类型（status/text_delta/thinking_delta/tool_use/tool_result/usage/turn_end/error/raw）
- `RunState`: 运行状态（id/status/events/child process/SSE clients/pendingHostAnswers/stdinOpen），存储在 globalThis Map 中
- `Session`: 会话数据（id, projectId, title, cwd, claudeSessionId, messages[], timestamps），JSON 文件持久化
- `BackgroundRun`: 后台运行状态（sessionId, projectId, runId, reader, messages, abortController, streamContext）
- `BreakpointState`: 响应式断点状态（breakpoint: mobile/tablet/desktop, isMobile/isTablet/isDesktop 布尔）
- `Question`: 交互式问答数据（question, header, options, multiSelect），AskUserQuestion 工具的输入模型
- `TreeNode`: 树形文件节点（name, path, type, children?, loaded?, expanded?）

### 核心流程
- **对话流程**: 用户输入 -> POST /api/chat -> spawn Claude CLI (--print --output-format stream-json --input-format stream-json) -> stdin 写入 user message JSONL -> SSE 流式事件 -> UI 实时渲染 -> 会话持久化
- **AskUserQuestion 流程**: Claude 返回 tool_use(AskUserQuestion) -> pendingHostAnswers 追踪 -> QuestionCard 渲染选项 -> 用户选择 -> POST /api/runs/{id}/tool-result -> stdin 写入 tool_result JSONL -> Claude 继续生成
- **后台进程流程**: 切换项目 -> 活跃流移入 backgroundRunsRef Map -> bgVersion 触发会话列表状态同步 -> 恢复时从 Map 取回前台
- **响应式路由**: page.tsx 使用 useBreakpoint -> mobile 渲染 MobileLayout（三 Tab）-> tablet 渲染 TabletLayout（抽屉侧边栏）-> desktop 渲染 ChatPanel

### 与其他系统的交互
- **Claude CLI**: 通过 child_process.spawn 调用，--input-format stream-json 启用 stdin/stdout 双向 JSONL 通信，--resume 支持会话续接
- **文件系统**: 树形懒加载扫描项目目录、递归扫描文件夹引用、会话 JSON 持久化
- **响应式布局**: useBreakpoint 驱动三种布局（MobileLayout/TabletLayout/ChatPanel），Hook 层共享状态逻辑
<!-- OVERVIEW_END -->

---

## 系统架构

Claude CLI Web UI 采用前后端一体的 Next.js 架构，核心分为以下子系统：

### 1. 通信层 (Communication Layer)

负责与 Claude CLI 进程交互和客户端实时通信。

**核心文件**:
- `lib/claude-stream.ts` — stream-json 解析器
- `lib/runs.ts` — 运行状态管理（内存存储）
- `lib/types.ts` — 共享类型定义

**数据流**:
```
用户输入 -> POST /api/chat (resolveReferences: @file/@url)
  -> spawn Claude CLI (--print --output-format stream-json --input-format stream-json [--resume sessionId])
  -> stdin 写入 user message JSONL（保持 stdin 打开）
  -> stdout JSONL -> claude-stream.ts 解析
  -> AgentEvent -> runs.ts 存储 + SSE 广播
  -> 客户端 fetch SSE -> UI 渲染
  -> [如遇 AskUserQuestion] -> QuestionCard 渲染 -> 用户选择 -> POST tool-result -> stdin 写入 tool_result JSONL
  -> 对话完成（pendingHostAnswers 清空后关闭 stdin） -> PUT /api/sessions (持久化消息 + claudeSessionId)
```

**关键设计决策**:
- 使用 globalThis Map 而非数据库存储运行状态（开发模式跨 HMR 持久化）
- fetch + ReadableStream 替代 EventSource（避免自动重连问题）
- 同时兼容新旧版本的 stream-json 格式

### 2. API 层 (API Layer)

Next.js App Router API 路由，提供 RESTful 接口。

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/chat` | POST | 启动 Claude CLI 对话，支持 --resume，返回 runId |
| `/api/commands/discover` | GET | 动态命令发现（文件系统扫描） |
| `/api/commands` | GET | 静态命令列表（回退方案） |
| `/api/files` | GET | 文件系统扫描（支持 cwd 参数，@file 引用） |
| `/api/projects` | GET/POST/PUT/DELETE | 项目 CRUD |
| `/api/sessions` | GET/POST/PUT/DELETE | 会话列表 CRUD |
| `/api/sessions/[id]` | GET | 单会话详情 |
| `/api/runs/[id]/events` | GET | SSE 事件流 |
| `/api/runs/[id]/cancel` | POST | 取消运行 |
| `/api/runs/[id]/tool-result` | POST | 工具调用结果回传 |

### 3. 命令发现系统 (Command Discovery)

扫描文件系统发现可用的 slash commands 和 skills。

**发现源**:
1. **内置命令**: 硬编码列表（/init, /review, /run 等 12 个）
2. **本地 Skills**: `~/.claude/skills/*/SKILL.md` 的 YAML frontmatter
3. **Plugin Skills/Commands**: `~/.claude/plugins/cache/` 下的递归扫描
   - 支持 `skills/` 和 `.claude/skills/` 两种目录位置
   - 支持 `.claude-plugin/plugin.json` 中的插件名解析
   - 格式：`/plugin-name:skill-name`

**缓存策略**:
- 5 分钟 TTL 内存缓存
- `invalidateCommandCache()` 可强制刷新

### 4. 项目管理系统 (Project Management)

管理多个项目的工作目录，支持切换项目后重置会话。

**存储**: `data/projects.json`（服务端文件系统）

**数据模型**:
```typescript
interface Project {
  id: string;       // randomBytes(4).toString('hex')
  name: string;
  path: string;     // 绝对路径
  createdAt: string; // ISO 8601
}
```

**持久化**: 项目选择状态和侧边栏折叠状态通过 localStorage 持久化

### 7. 会话历史系统 (Session History)

管理每个项目下的对话会话，支持多轮对话续接。

**核心文件**:
- `lib/sessions.ts` -- 会话数据层（CRUD + 淘汰策略）
- `app/api/sessions/route.ts` -- 会话列表 API
- `app/api/sessions/[id]/route.ts` -- 单会话详情 API

**数据模型**:
```typescript
interface Session {
  id: string;              // randomBytes(4).toString('hex')
  projectId: string;       // 所属项目
  title: string;           // 自动提取（首条用户消息前 30 字符）
  cwd: string;             // 工作目录
  claudeSessionId: string | null;  // Claude CLI 的会话 ID（用于 --resume）
  messages: SessionMessage[];      // 对话消息列表
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
}
```

**存储策略**:
- 按项目隔离：`data/sessions/{projectId}/{sessionId}.json`
- 淘汰策略：每项目最多 20 个会话，创建新会话时自动清理最旧的
- SessionMeta 轻量模型用于列表展示（不含 messages 数组）

**恢复机制**:
- Claude CLI 返回的 claudeSessionId 在每次对话完成后保存
- 恢复会话时通过 --resume 参数传递 claudeSessionId
- 客户端同步恢复 messages 数组以展示历史消息

### 8. @file/@url 引用解析 (Reference Resolution)

在服务端解析消息中的文件和 URL 引用，将内容注入到 prompt 中。

**核心逻辑**: `app/api/chat/route.ts` 中的 `resolveReferences` 函数

**引用格式**:
- `@file path/to/file.ts` -- 读取文件内容，注入为 `<file path="...">` XML 标签
- `@file path/to/directory` -- 递归扫描目录下所有文件，总内容上限 200KB
- `@url https://example.com` -- fetch 网页内容，注入为 `<url href="...">` XML 标签

**限制**:
- 单文件内容 50KB 截断
- 目录总内容 200KB 截断（MAX_TOTAL_DIR_SIZE），单个文件超 50KB 跳过
- 目录递归扫描最大深度 5 层
- URL fetch 10s 超时，内容 50KB 截断
- 文件不存在时注入错误提示而非中断对话

**Workspace-aware 文件选择**:
- 文件扫描 API (`/api/files`) 接受 `cwd` 和 `dir` 参数
- 命令面板基于当前选中项目的工作目录，树形懒加载浏览
- 实现项目切换后文件引用的上下文感知

### 9. 后台进程管理 (Background Process Management)

切换项目时不中断正在运行的 Claude CLI 进程，允许同时运行多个会话。

**核心数据结构**:
```typescript
interface StreamContext {
  isBackground: boolean;
  activeSessionId: string;
  selectedProjectId: string | null;
}

interface BackgroundRun {
  sessionId: string;
  projectId: string;
  runId: string;
  reader: ReadableStreamDefaultReader;
  messages: Message[];
  claudeSessionId: string | null;
  abortController: AbortController;
  streamContext: StreamContext;
}
```

**状态流转**:
- `backgroundRunsRef`: Map<sessionId, BackgroundRun> 管理所有后台运行
- `bgVersion`: 递增计数器，每次后台 Map 变更时 +1，触发 useEffect 同步会话列表 status
- SSE 事件根据 `streamContext.isBackground` 分发到 `updateLastAssistantMessage`（前台）或 `updateBgMessage`（后台）

**关键行为**:
- 切换项目时：活跃流移入 backgroundRunsRef，不取消 reader
- 选择后台会话时：从 Map 取回 reader 和 messages 恢复前台
- 删除项目/会话时：清理关联的后台进程 + 取消远程 run
- 组件卸载时：取消所有后台进程
- 后台流完成后：自动持久化消息，从 Map 移除

### 10. 树形文件选择器 (Tree File Picker)

替换扁平文件列表为树形懒加载文件浏览器。

**数据模型**:
```typescript
interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
  loaded?: boolean;   // 子项是否已加载
  expanded?: boolean; // 是否展开
}
```

**核心函数**:
- `loadChildren(dirPath, cwd)`: 通过 /api/files?dir= 按需加载子项
- `entriesToNodes(entries)`: FileEntry[] -> TreeNode[]
- `updateTreeNode(nodes, path, patch)`: 不可变更新树中指定节点
- `flattenVisibleNodes(nodes)`: 深度优先遍历展开的节点，用于键盘导航

**交互设计**:
- 目录：点击展开/折叠（懒加载子项），ChevronIcon 旋转动画
- 文件/目录：点击设置 selectedPath + focusedIndex
- 独立"选择"按钮：确认选择并调用 onSelect
- 键盘：ArrowUp/ArrowDown 移动焦点，Enter 确认，Escape 关闭
- 排序：目录优先，按名称排列

### 11. 自动会话创建 (Auto-create Session)

发送消息时如果没有选中会话，自动创建新会话。

**流程**: 发送消息 -> 检测 `!selectedSessionId && selectedProjectId` -> POST /api/sessions 创建 -> 刷新会话列表 -> 继续对话

**设计考量**: 使用 `activeSessionId` 局部变量避免闭包引用过期问题。

### 12. 交互式问答系统 (AskUserQuestion Interactive)

实现 Claude CLI AskUserQuestion 工具的 Web 端交互式支持。

**核心原理**: 通过 `--input-format stream-json` 参数启用 Claude CLI 的 stdin 双向通信模式。Claude 返回 AskUserQuestion tool_use 时，Web 端渲染交互式卡片，用户选择后通过 tool-result API 将答案以 JSONL 格式回写到 stdin。

**数据模型**:
```typescript
interface Question {
  question: string;
  header?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
}

interface QuestionOption {
  label: string;
  description?: string;
  preview?: string;
}
```

**双向通信流程**:
```
1. stdin 写入: { type: 'user', message: { role: 'user', content: [{ type: 'text', text: ... }] } }
2. Claude 处理后返回 tool_use(AskUserQuestion) -> 追踪到 pendingHostAnswers
3. QuestionCard 渲染选项 -> 用户选择 -> 确认
4. POST /api/runs/{id}/tool-result { toolUseId, content: answer }
5. tool-result API 构建: { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: ..., content: ... }] } }
6. stdin.write(JSONL) -> pendingHostAnswers.delete(toolUseId)
7. 无待回答时 stdin.end() -> Claude 完成对话
```

**关键设计**:
- stdin 保持打开（`run.stdinOpen = true`），直到所有 AskUserQuestion 都被回答
- `pendingHostAnswers: Set<string>` 追踪未回答的 tool_use ID
- QuestionCard 支持单选（radio）和多选（checkbox）模式
- 答案格式：多问题以换行分隔，多选以逗号分隔

### 5. Hook 层架构 (Hook Layer)

从巨型 ChatPanel (~1050 行) 中抽取的四个自定义 Hook，实现状态逻辑与 UI 的分离。桌面/平板/移动端布局共享同一套 Hook 层。

**核心文件**:
- `hooks/useChatSession.ts` (453 行) -- 聊天会话状态管理
- `hooks/useProjectList.ts` (180 行) -- 项目列表状态管理
- `hooks/useSessionList.ts` (88 行) -- 会话列表状态管理
- `hooks/useBreakpoint.ts` (55 行) -- 响应式断点检测

**Hook 依赖关系**:
```
page.tsx
  +-- useBreakpoint() -> 断点分发
  +-- [MobileLayout | TabletLayout | ChatPanel]
        +-- useProjectList(backgroundRunsRef, onBgVersionBump, ...)
        +-- useSessionList(backgroundRunsRef, onBgVersionBump)
        +-- useChatSession(backgroundRunsRef, bgVersion, ...)
```

**跨 Hook 协调机制**:
- `backgroundRunsRef`: Map<sessionId, BackgroundRun>，在三个 Hook 间共享引用
- `bgVersion`: useState 计数器，每次后台 Map 变更时 +1，触发 useEffect 同步会话列表 status
- `onBgVersionBump`: 递增 bgVersion 的回调，传入各 Hook
- `onSessionsRefresh`: 刷新会话列表的回调，useChatSession 完成对话后调用
- `onCancelStream` / `onResetMessages`: useProjectList 删除/切换项目时需要调用 useChatSession 的方法

**useChatSession 接口**:
- 状态: messages, isLoading, error, connected, selectedSessionId, claudeSessionId
- Refs: readerRef, messagesRef, currentRunIdRef, streamContextRef
- 方法: sendMessage, selectSession, moveCurrentToBackground, handleAnswer, cancelStream, resetConversation

**useBreakpoint 断点规则**:
- mobile: < 768px（window.matchMedia('(min-width: 768px)' 不匹配）
- tablet: 768px ~ 1023px（768 匹配但 1024 不匹配）
- desktop: >= 1024px
- 150ms 防抖更新，SSR 默认 desktop

### 6. 响应式布局系统 (Responsive Layout)

基于 useBreakpoint 的三种布局适配方案，共享 Hook 层实现状态逻辑复用。

**入口路由** (app/page.tsx):
```typescript
const { isMobile, isTablet } = useBreakpoint();
if (isMobile) return <MobileLayout />;
if (isTablet) return <TabletLayout />;
return <ChatPanel />;
```

**移动端布局** (components/mobile/):

MobileLayout 管理三个 Tab 视图：
- **MobileChatView**: 对话视图，包含 Header + MessageList/EmptyState + CommandPalette + 输入区域
- **MobileHistoryView**: 历史视图，项目卡片列表 + 会话列表 + 添加项目/新建会话
- **MobileSettingsView**: 设置视图（基础版），项目信息展示

BottomNavBar:
- 底部固定导航栏，三个 Tab 图标（chat/history/settings）
- 激活态蓝色 (#6495ed)
- 安全区域适配 env(safe-area-inset-bottom)
- 输入时可隐藏

**平板端布局** (components/tablet/):

TabletLayout:
- 抽屉式侧边栏从左侧滑入（手势支持关闭）
- 复用现有 Sidebar、Header、MessageList、CommandPalette 等组件
- 抽屉开关通过 Header 汉堡菜单控制
- 侧边栏展开时背景遮罩

**桌面端布局**:

ChatPanel（重构后 ~270 行）:
- 纯 UI 编排层，所有状态管理委托给 Hook 层
- 仅保留 UI 状态：input、cursorPos、paletteVisible
- 重新导出 BackgroundRun 和 Message 类型

### 7. UI 组件系统 (UI Components)

基于 Kimi 风格黑白灰设计系统。

**组件树**:
```
page.tsx (useBreakpoint 断点分发)
  +-- MobileLayout (mobile, 三 Tab 导航)
  |     +-- BottomNavBar
  |     +-- MobileChatView (Header + MessageList/EmptyState + CommandPalette)
  |     +-- MobileHistoryView (项目卡片 + 会话列表)
  |     +-- MobileSettingsView (设置页)
  +-- TabletLayout (tablet, 抽屉式侧边栏)
  |     +-- Sidebar (抽屉模式)
  |     +-- Header (汉堡菜单开关抽屉)
  |     +-- MessageList / EmptyState
  |     +-- CommandPalette
  +-- ChatPanel (desktop, 传统布局)
        +-- Sidebar (可收缩侧边栏，树形结构)
        |     +-- 项目节点（可展开/折叠）
        |     |     +-- 会话列表（标题 + 消息数 + 相对时间）
        |     |     +-- 新建会话按钮
        |     +-- AddProjectModal (模态框)
        +-- Header (顶栏)
        |     +-- 汉堡菜单 + 项目名 + 模型 chip + 状态灯
        +-- EmptyState (空状态) / MessageList (消息列表)
        |     +-- AssistantMessage (助手消息渲染)
        |     |     +-- ThinkingBlock (思考块)
        |     |     +-- ToolCard (工具卡片)
        |     |     +-- QuestionCard (交互式问答卡片，AskUserQuestion 专用)
        |     |     +-- ReactMarkdown (文本)
        +-- CommandPalette (命令面板, / 和 @ 触发，cwd 感知)
        +-- 输入区域 (textarea + 发送按钮)
```

**设计系统 (globals.css)**:
- CSS 变量驱动：`--bg-primary`, `--bg-secondary`, `--text-primary`, `--text-secondary`, `--border`, `--accent`
- 暗色模式：`prefers-color-scheme: dark` 媒体查询
- 动画：fadeIn, slideUp, messageAppear
- 安全区域：`env(safe-area-inset-bottom)` 移动端适配

### 8. 环境配置 (Configuration)

通过 `lib/env.ts` 管理：
- `CLAUDE_BIN`: Claude CLI 可执行文件路径（默认 `claude`）
- `DEFAULT_MODEL`: 默认模型（默认 `claude-sonnet-4-6`）
- `DEFAULT_CWD`: 默认工作目录
- `PORT`: 服务端口

## 技术依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| next | ^14.2.28 | Web 框架（App Router） |
| react | ^18.3.1 | UI 库 |
| cmdk | ^1.1.1 | 命令面板组件 |
| react-markdown | ^9.0.1 | Markdown 渲染 |
| remark-gfm | ^4.0.0 | GFM 扩展（表格、任务列表等） |
| tailwindcss | ^3.3.0 | 原子化 CSS |
| vitest | ^1.6.0 | 单元测试 |
