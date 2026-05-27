# 项目架构大纲

<!-- OVERVIEW_START -->
## 概览

### 核心概念
- **Claude CLI Web UI**: 基于 Next.js 14 App Router 的浏览器前端，通过 spawn Claude CLI 子进程实现 Web 对话
- **stream-json 协议**: Claude CLI 的 --output-format stream-json 输出 JSONL 格式，包含 system、stream_event、assistant、user、result 五种消息类型
- **后台进程管理**: 切换项目时将活跃 Claude CLI 进程移入后台，会话列表实时显示运行状态
- **树形文件选择器**: 懒加载目录树的文件浏览器，独立确认按钮选择文件

### 关键数据结构
- `AgentEvent`: 联合类型（status/text_delta/thinking_delta/tool_use/tool_result/usage/turn_end/error/raw）
- `RunState`: 运行状态（id/status/events/child process/SSE clients），存储在 globalThis Map 中
- `Session`: 会话数据（id, projectId, title, cwd, claudeSessionId, messages[], timestamps），JSON 文件持久化
- `BackgroundRun`: 后台运行状态（sessionId, projectId, runId, reader, messages, abortController, streamContext）
- `TreeNode`: 树形文件节点（name, path, type, children?, loaded?, expanded?）
- `Category > CommandItem`: 命令分组结构，用于命令面板展示

### 核心流程
- **对话流程**: 用户输入 -> POST /api/chat -> spawn Claude CLI (--resume 可选) -> SSE 流式事件 -> UI 实时渲染 -> 会话持久化
- **后台进程流程**: 切换项目 -> 活跃流移入 backgroundRunsRef Map -> bgVersion 触发会话列表状态同步 -> 恢复时从 Map 取回前台
- **自动会话创建**: 发送消息 -> 检测无 selectedSessionId -> POST /api/sessions 自动创建 -> 继续对话流程

### 与其他系统的交互
- **Claude CLI**: 通过 child_process.spawn 调用，--print 模式传参，--resume 支持会话续接，stdout 解析 JSONL
- **文件系统**: 树形懒加载扫描项目目录、递归扫描文件夹引用、会话 JSON 持久化
- **LAN 网络**: 绑定 0.0.0.0 + 自动分配端口，支持局域网访问
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
  -> spawn Claude CLI (--print [--resume sessionId])
  -> stdout JSONL -> claude-stream.ts 解析
  -> AgentEvent -> runs.ts 存储 + SSE 广播
  -> 客户端 fetch SSE -> UI 渲染
  -> 对话完成 -> PUT /api/sessions (持久化消息 + claudeSessionId)
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

### 5. UI 组件系统 (UI Components)

基于 Kimi 风格黑白灰设计系统。

**组件树**:
```
ChatPanel (状态管理 + 会话持久化)
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
  |     |     +-- ReactMarkdown (文本)
  +-- CommandPalette (命令面板, / 和 @ 触发，cwd 感知)
  +-- 输入区域 (textarea + 发送按钮)
```

**设计系统 (globals.css)**:
- CSS 变量驱动：`--bg-primary`, `--bg-secondary`, `--text-primary`, `--text-secondary`, `--border`, `--accent`
- 暗色模式：`prefers-color-scheme: dark` 媒体查询
- 动画：fadeIn, slideUp, messageAppear
- 安全区域：`env(safe-area-inset-bottom)` 移动端适配

### 6. 环境配置 (Configuration)

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
