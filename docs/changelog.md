# 改动记录

<!-- OVERVIEW_START -->
## 概览

### 版本范围
- 初始版本 81ddbf4 到当前版本 936463a，涵盖项目从零搭建到功能完善的全过程

### 变更模块
- **核心通信**: SSE 流式通信、Claude CLI 进程管理、stream-json 解析
- **命令系统**: 动态命令发现、命令面板、@file/@url 引用解析
- **UI 系统**: Kimi 风格设计系统、侧边栏、消息渲染、项目管理
- **会话系统**: 会话持久化、--resume 集成、淘汰策略
- **API 层**: 对话、命令发现、文件扫描、项目 CRUD、会话 CRUD

### 关键变更点
- 从基础 ChatPanel + SSE 演进为完整的命令面板 + 项目管理 + 侧边栏架构
- 新增文件系统扫描式命令发现，支持插件 skills 和本地 skills
- 设计系统从简单 Tailwind 升级为 CSS 变量驱动的黑白灰主题
- 新增会话历史系统，支持 Claude CLI --resume 多轮对话续接
- @file/@url 引用在服务端解析注入，支持 workspace-aware 文件选择
<!-- OVERVIEW_END -->

---

## 版本索引

| 版本范围 | 日期 | 模块 | 说明 |
|----------|------|------|------|
| 81ddbf4..dc2cb54 | 2026-05-26 | 项目初始化 | Next.js 项目脚手架 |
| 2a9c29d..2188028 | 2026-05-26 | 核心通信 | 流解析器、运行管理、API 路由 |
| 7039244..d04d10e | 2026-05-26 | UI 组件 | 基础组件和页面 |
| 5ae9fe8..c96f211 | 2026-05-26 | 完整实现 | 端到端 ChatPanel + 错误处理 |
| 3e68954 | 2026-05-26 | Bug 修复 | SSE 和 Claude CLI 集成问题 |
| 5bb731e | 2026-05-27 | 设计文档 | 命令发现和 UI 美化设计 |
| 7daac90 | 2026-05-27 | 设计文档 | 侧边栏和项目管理设计 |
| 工作区 | 2026-05-27 | 命令系统 | 动态命令发现 + 命令面板重写 |
| 工作区 | 2026-05-27 | UI 美化 | Kimi 风格设计系统 + 组件美化 |
| 工作区 | 2026-05-27 | 项目管理 | 侧边栏 + 项目 CRUD + cwd 支持 |
| 936463a | 2026-05-27 | 会话系统 | Session history + @file/@url + --resume |

---

## 详细记录

### 2026-05-26: 项目搭建

#### 模块: 项目初始化

- **81ddbf4** `feat: initialize Next.js project`
  - 创建 Next.js 14 项目，TypeScript + Tailwind CSS 配置

- **dc2cb54** `feat: initialize Next.js project with TypeScript and Tailwind`
  - tsconfig.json、tailwind.config.ts、postcss.config.js 配置
  - 全局样式文件 app/globals.css

#### 模块: 核心通信

- **075e02b** `feat: add type definitions for agent events and run state`
  - 定义 AgentEvent 联合类型（status, text_delta, thinking_delta, tool_use, tool_result, usage, turn_end, error, raw）
  - 定义 RunState、SSEClient、ChatRequest、ChatResponse 接口

- **2a9c29d** `feat: add in-memory run store with SSE broadcasting`
  - lib/runs.ts: 使用 globalThis Map 持久化运行状态
  - 支持 createRun、getRun、addEvent、addClient、removeClient、setRunStatus、cleanupRun

- **aabf71f** `feat: extract Claude stream parser from Open Design with tests`
  - lib/claude-stream.ts: 解析 --output-format stream-json 的 JSONL 输出
  - 处理 content_block_start/delta/stop 流式事件
  - 支持 --include-partial-messages 开关（新旧版本兼容）
  - __tests__/claude-stream.test.ts: 491 行测试

- **7f7a89c** `feat: add SSE events route for streaming agent events`
  - app/api/runs/[id]/events/route.ts: SSE 端点
  - 支持 event: agent 和 event: status 两种事件类型

- **8cdc781** `feat: add chat API route to spawn Claude CLI processes`
  - app/api/chat/route.ts: spawn Claude CLI --print --verbose --output-format stream-json
  - 使用 --print 模式（stdin 不需要写入）

- **5ad63e8** `feat: add cancel route to terminate running CLI processes`
  - app/api/runs/[id]/cancel/route.ts: SIGTERM 终止子进程

- **4e93777** `feat: add tool-result route for AskUserQuestion support`
  - app/api/runs/[id]/tool-result/route.ts: 处理工具调用结果回传

#### 模块: UI 组件

- **157743f** `feat: add ThinkingBlock component for collapsible thinking display`
  - 折叠式思考内容展示组件

- **85b3d3b** `feat: add ToolCard component for tool call display`
  - 工具调用卡片组件，显示工具名、输入、结果

- **655cc8c** `feat: add AssistantMessage component for rendering agent events`
  - 将 AgentEvent[] 转换为 Block[]（text/thinking/tool）
  - 集成 ReactMarkdown 渲染

- **fc07010** `feat: add MessageList component for displaying conversation`
  - 消息列表，自动滚动到底部

- **5ae9fe8** `feat: add ChatPanel component with SSE streaming`
  - 完整的聊天面板，包含输入、发送、SSE 流处理

- **2188028** `feat: add global styles with Tailwind and markdown support`
  - 基础 Tailwind 样式 + Markdown 渲染样式

- **7039244** `feat: add root layout with metadata`
  - HTML 根布局

- **d04d10e** `feat: add main page with ChatPanel`
  - 首页路由

#### 模块: Bug 修复

- **eeed01f** `fix: address code quality issues in project initialization`
  - 代码质量修复

- **12fa989** `refactor(ChatPanel): improve code quality and fix state mutation issues`
  - 修复状态变异问题

- **c96f211** `feat: add comprehensive error handling`
  - 全面的错误处理

- **3e68954** `fix: resolve SSE and Claude CLI integration issues`
  - 修复 SSE 流和 Claude CLI 集成问题

### 2026-05-27: 命令面板动态化 + UI 美化

#### 模块: 设计文档

- **5bb731e** `docs: add design spec for command discovery and UI polish`
  - docs/superpowers/specs/2026-05-27-command-discovery-and-ui-polish-design.md

- **7daac90** `docs: add design spec for sidebar and project management`
  - docs/superpowers/specs/2026-05-27-sidebar-project-management-design.md

#### 模块: 命令系统（工作区）

- **新建** lib/command-discovery.ts
  - 文件系统扫描命令发现引擎
  - 扫描 ~/.claude/skills/ 下本地 skills
  - 递归扫描 ~/.claude/plugins/cache/ 下插件 skills 和 commands
  - 支持 skills/ 和 .claude/skills/ 两种目录结构
  - YAML frontmatter 解析器（从 SKILL.md 提取 name/description）
  - 5 分钟 TTL 缓存机制
  - 插件名称从 .claude-plugin/plugin.json 读取

- **新建** app/api/commands/discover/route.ts
  - GET /api/commands/discover: 调用 discoverAllCommands 返回 Category[]

- **更新** lib/commands.ts
  - 新增 Category、CommandItem 接口
  - 新增 parseTrigger 函数（解析 / 命令、@file、@url 触发）
  - 新增 fetchFiles、fetchCommands 函数

- **重写** components/CommandPalette.tsx
  - 使用 cmdk 库，分组显示命令（Built-in / Local Skills / Plugin Skills）
  - 支持 / 触发命令、@ 触发文件引用
  - 优先使用 discover API，回退到 legacy 静态列表
  - 搜索过滤、键盘导航

#### 模块: UI 美化（工作区）

- **更新** app/globals.css
  - Kimi 风格黑白灰设计系统
  - CSS 变量：--bg-primary/secondary、--text-primary/secondary、--border、--accent
  - 暗色模式支持（prefers-color-scheme: dark）
  - 动画 keyframes：fadeIn、slideUp、messageAppear
  - 工具类：.animate-message-appear、.rounded-bubble、.card-shadow、.input-focus-ring
  - cmdk 选中状态样式
  - 移动端安全区域工具类
  - 侧边栏过渡动画

- **新建** components/Header.tsx
  - 极简顶栏：汉堡菜单 + 项目名 + 模型 chip + 连接状态指示灯
  - 毛玻璃效果背景

- **新建** components/EmptyState.tsx
  - 空状态首页：标题 + 4 个快捷操作卡片
  - 中文文案："AI 编程助手，随时待命"

- **新建** components/QuickAction.tsx
  - 快捷操作卡片组件：图标 + 标题 + 描述
  - hover 悬浮效果（阴影 + 上移）

- **美化** components/MessageList.tsx
  - 消息气泡升级：用户消息右对齐深色、助手消息左对齐浅色
  - 助手头像（C 圆圈）
  - 不同圆角方向（用户 16/16/4/16，助手 16/16/16/4）
  - messageAppear 进入动画
  - 运行中状态脉冲指示器

- **美化** components/ToolCard.tsx
  - 左侧色条（绿色成功/红色错误/默认强调色）
  - SVG 工具图标映射（Read/Write/Edit/Bash/Glob/Grep/WebFetch/WebSearch）
  - 展开/折叠动画（max-height 过渡）
  - 状态徽章（Done/Error）

- **美化** components/ThinkingBlock.tsx
  - 淡黄色背景（#fefce8）
  - 思考图标 + "思考中... (N 字)"
  - 折叠展开动画

- **重设计** components/ChatPanel.tsx
  - 输入区域重设计：圆角 2xl textarea + 圆形发送按钮
  - 集成 Header、EmptyState、CommandPalette
  - 集成 Sidebar、AddProjectModal
  - 项目切换自动重置会话
  - 发送消息携带 cwd 参数
  - 侧边栏收缩状态持久化（localStorage）
  - 视觉视口适配（移动端虚拟键盘）
  - 错误横幅
  - 提示文字："使用 / 触发命令 · 使用 @ 引用文件"

### 2026-05-27: 侧边栏 + 项目管理

#### 模块: 项目管理（工作区）

- **新建** lib/projects.ts
  - 项目数据管理模块
  - JSON 文件存储（data/projects.json）
  - CRUD 操作：listProjects、addProject、updateProject、deleteProject
  - 路径唯一性校验
  - 首次访问自动添加当前目录项目

- **新建** app/api/projects/route.ts
  - GET: 列出所有项目
  - POST: 添加项目（路径存在性校验）
  - PUT: 更新项目（名称/路径）
  - DELETE: 删除项目

- **新建** components/Sidebar.tsx
  - 可收缩侧边栏（280px 宽）
  - 项目列表：选中高亮 + hover 效果
  - 每个项目显示名称和截断路径
  - 悬浮显示编辑/删除按钮
  - 底部添加项目按钮
  - 过渡动画（width 200ms ease-in-out）

- **新建** components/AddProjectModal.tsx
  - 模态框：支持添加和编辑模式
  - 表单字段：项目名、工作目录路径
  - 输入验证
  - 点击遮罩关闭

- **更新** components/Header.tsx
  - 添加汉堡菜单按钮
  - 显示当前项目名
  - onToggleSidebar 回调

- **新建** app/api/files/route.ts
  - GET /api/files: 文件系统扫描
  - 支持前缀过滤和数量限制
  - 忽略 node_modules/.git/.next/.superpowers

- **更新** .gitignore
  - 添加 data/projects.json 忽略规则

### 2026-05-27: 会话历史 + @file/@url 引用

#### 模块: 会话系统

- **新建** lib/sessions.ts
  - 会话数据层模块，按项目隔离存储到 data/sessions/{projectId}/{sessionId}.json
  - CRUD 操作：listSessionsMeta、getSession、createSession、updateSession、deleteSession
  - 淘汰策略 evictOldSessions：每项目最多 20 个会话，按 updatedAt 淘汰最旧的
  - getSession 跨项目目录搜索（遍历 sessionsRoot 下所有 projectId 目录）
  - Session 数据模型：id, projectId, title, cwd, claudeSessionId, messages[], createdAt, updatedAt
  - SessionMeta 轻量模型：id, title, createdAt, updatedAt, messageCount（用于列表展示）

- **新建** app/api/sessions/route.ts
  - GET: 按 projectId 列出会话（返回 SessionMeta[]）
  - POST: 创建新会话（校验 projectId 对应项目是否存在）
  - PUT: 更新会话（messages/title/claudeSessionId）
  - DELETE: 删除会话

- **新建** app/api/sessions/[id]/route.ts
  - GET: 获取单个会话完整数据（含 messages）

- **更新** app/api/chat/route.ts
  - 新增 claudeSessionId 参数支持，传递 --resume 给 Claude CLI
  - 新增 resolveReferences 函数，解析 @file 和 @url 引用
  - @file: 读取文件内容，50KB 截断，注入 XML 标签格式
  - @url: fetch 网页内容，10s 超时，50KB 截断，注入 XML 标签格式
  - 将解析后的消息（而非原始输入）传给 Claude CLI

- **更新** lib/types.ts
  - ChatRequest 新增 claudeSessionId 可选字段

#### 模块: UI 集成

- **更新** components/ChatPanel.tsx
  - 新增会话状态管理：sessions, selectedSessionId, claudeSessionId
  - 切换项目时自动加载该项目的会话列表，恢复最近会话
  - 对话完成后自动保存/更新会话到服务端（消息 + claudeSessionId）
  - 自动提取会话标题（首条用户消息前 30 字符）
  - 新建会话时重置 messages 和 claudeSessionId
  - 发送消息时携带 claudeSessionId 实现 --resume 续接

- **更新** components/Sidebar.tsx
  - 重构为树形结构：项目节点（可展开/折叠）-> 会话列表
  - 每个项目显示名称、路径、会话数量和齿轮/X 图标
  - 每个会话显示标题、消息数、相对时间
  - 新建会话按钮（+ 图标）在选中项目下方
  - 会话删除按钮（悬浮显示）
  - 新增 GearIcon、XIcon、ChevronIcon 组件
  - truncatePath 和 relativeTime 辅助函数

- **更新** components/CommandPalette.tsx
  - fetchFiles 接受 cwd 参数，实现 workspace-aware 文件选择
  - 文件搜索基于当前项目的工作目录

#### 模块: 配置修复

- **更新** next.config.mjs
  - 添加 outputFileTracing: false，修复 Windows 符号链接权限问题

#### 模块: 设计文档

- **新建** docs/superpowers/specs/2026-05-27-session-history-and-file-picker-design.md
  - 会话历史系统和 workspace-aware 文件选择器的设计规范
