# 改动记录

<!-- OVERVIEW_START -->
## 概览

### 版本范围
- 初始版本 81ddbf4 到当前版本 7b697a5，涵盖项目从零搭建到功能完善的全过程

### 变更模块
- **核心通信**: SSE 流式通信、Claude CLI 进程管理、stream-json 解析
- **命令系统**: 动态命令发现、命令面板、@file/@url 引用解析
- **UI 系统**: Kimi 风格设计系统、侧边栏、消息渲染、项目管理
- **会话系统**: 会话持久化、--resume 集成、淘汰策略
- **文件选择器**: 树形文件浏览器、懒加载目录、独立确认按钮
- **后台进程**: 切换项目不中断 Claude CLI 进程、会话状态实时显示
- **API 层**: 对话、命令发现、文件扫描、项目 CRUD、会话 CRUD
- **交互式问答**: AskUserQuestion 工具支持、QuestionCard 组件、stdin JSONL 双向通信

### 关键变更点
- 从基础 ChatPanel + SSE 演进为完整的命令面板 + 项目管理 + 侧边栏架构
- 文件选择器从扁平列表重构为树形结构，支持懒加载和独立确认按钮
- 新增后台进程管理，切换项目时 Claude CLI 进程不中断
- 发送消息时自动创建会话，无需手动新建
- LAN 访问支持（绑定 0.0.0.0，自动分配端口）
- 文件夹 @file 引用支持递归扫描，200KB 总截断
- AskUserQuestion 交互式支持：通过 --input-format stream-json 实现 stdin/stdout 双向通信
- stdin 改为 JSONL 格式写入并保持打开，解决了 shell 转义问题
- QuestionCard 组件实现单选/多选交互式问答卡片
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
| 29ef54a | 2026-05-27 | 设计文档 | 树形文件选择器 + 后台进程 + 自动会话设计 |
| d989852 | 2026-05-27 | 重大迭代 | 树形文件选择器 + 后台进程管理 + 自动会话 + LAN |
| 7b697a5 | 2026-05-27 | 交互式问答 | AskUserQuestion 交互式支持 + QuestionCard + stdin JSONL |

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

### 2026-05-27: 树形文件选择器 + 后台进程管理 + 自动会话

#### 模块: 设计文档

- **29ef54a** `docs: add design spec for tree file picker, background runs, and auto session creation`
  - docs/superpowers/specs/2026-05-27-iteration-tree-picker-bg-runs-auto-session-design.md
  - 树形文件选择器、后台进程管理、自动创建会话的详细设计规范

#### 模块: 树形文件选择器

- **重写** components/CommandPalette.tsx
  - 从扁平文件列表重构为树形文件浏览器（TreeNode 数据模型）
  - 懒加载目录：点击目录时通过 /api/files?dir= 按需加载子项
  - 独立的"选择"按钮确认选择（而非单击直接选中）
  - 目录展开/折叠带 ChevronIcon 旋转动画
  - FolderIcon / FileIcon SVG 图标（无 emoji）
  - 键盘导航：ArrowUp/ArrowDown 移动焦点，Enter 确认选择，Escape 关闭
  - flattenVisibleNodes 函数实现深度优先遍历用于键盘索引
  - 底部提示文字："点击选中 . 点击「选择」按钮确认 . 文件夹点击展开/折叠"
  - focusedIndex + selectedPath 双状态管理（焦点与选中分离）

- **重写** app/api/files/route.ts
  - 从递归全量扫描改为单层目录扫描（懒加载基础）
  - 新增 dir 参数：指定要列出的子目录路径
  - 移除 prefix 和 limit 参数
  - 路径遍历防护：拒绝包含 ".." 的路径
  - 排序规则：目录优先（按名称），然后文件（按名称）
  - 每个条目返回 relativePath（相对于 rootDir）

#### 模块: 后台进程管理

- **更新** components/ChatPanel.tsx
  - 新增 StreamContext 接口：{ isBackground, activeSessionId, selectedProjectId }
  - 新增 BackgroundRun 接口：{ sessionId, projectId, runId, reader, messages, claudeSessionId, abortController, streamContext }
  - backgroundRunsRef: Map<string, BackgroundRun> 管理所有后台运行
  - bgVersion 状态触发 Session 列表状态同步（running/idle）
  - 切换项目时（handleSelectProject）：如有活跃流，将其移入后台而非取消
  - 选择后台会话时（handleSelectSession）：恢复后台流到前台
  - 删除项目/会话时：清理关联的后台进程
  - 组件卸载时：取消所有后台进程
  - SSE 事件处理中根据 streamContext.isBackground 分发到不同更新路径
  - 后台流完成后自动持久化消息并清理

- **更新** components/Sidebar.tsx
  - 会话状态指示器：运行中显示绿色脉冲圆点（pulse 动画）
  - 运行中标签：绿色"运行中"徽章（background rgba(34,197,94,0.15)）
  - 运行中会话不显示相对时间，而是显示状态标签
  - 运行中会话背景色微调：rgba(34,197,94,0.06)

- **更新** lib/sessions.ts
  - SessionMeta 新增 status?: 'running' | 'idle' 字段（前端状态，不持久化）

#### 模块: 自动创建会话

- **更新** components/ChatPanel.tsx
  - 发送消息时检查 selectedSessionId：如果为空但有 selectedProjectId，自动 POST /api/sessions 创建
  - 创建后自动刷新会话列表
  - 使用 activeSessionId 局部变量避免闭包引用过期

#### 模块: 文件夹 @file 引用

- **更新** app/api/chat/route.ts
  - resolveReferences 函数支持目录路径引用
  - 新增 scanDirectoryFiles 递归扫描函数（最大深度 5 层）
  - 忽略 node_modules/.git/.next/.superpowers 目录
  - 总内容上限 200KB（MAX_TOTAL_DIR_SIZE）
  - 单文件超过 50KB 则跳过
  - 超出预算时截断当前文件并显示省略文件数
  - 每个文件使用 relative path 注入 XML 标签

#### 模块: LAN 访问与启动

- **更新** package.json
  - dev 脚本从 `next dev` 改为 `next dev -H 0.0.0.0 -p 0`（绑定所有网卡，自动分配端口）
  - 新增 cmdk 依赖 (^1.1.1)

- **新建** start.bat
  - Windows 一键启动脚本：切换到脚本目录后执行 pnpm dev

#### 模块: UI 美化迭代

- **更新** app/globals.css
  - 新增 @keyframes pulse（绿色脉冲动画，用于后台进程指示器）
  - 完整的 CSS 变量体系（背景、文本、气泡、边框、强调色）
  - cmdk 选中状态样式
  - 移动端安全区域工具类
  - 侧边栏过渡类（.sidebar-panel / .sidebar-collapsed）

- **更新** app/layout.tsx
  - 新增 Viewport 元数据（width=device-width, initialScale=1, maximumScale=5）
  - 语言改为 zh-CN
  - body 添加 h-screen overflow-hidden

- **美化** components/MessageList.tsx
  - 助手消息气泡改用 CSS 变量背景色和自定义圆角
  - animate-message-appear 进入动画
  - 思考指示器改用 CSS 变量颜色

- **美化** components/ThinkingBlock.tsx
  - 淡黄色主题（#fefce8 背景，#fde68a 边框，#92400e 文字）
  - 思考灯泡图标 SVG
  - 中文文案："思考中... (N 字)"
  - max-height 过渡动画替代条件渲染

- **美化** components/ToolCard.tsx
  - 左侧色条（绿色成功/红色错误/默认强调色）
  - SVG 工具图标替代 emoji 图标
  - 卡片阴影（card-shadow 类）
  - 状态徽章（Done 绿色/Error 红色）
  - max-height 过渡动画

- **美化** components/AssistantMessage.tsx
  - 文本块添加 text-sm leading-relaxed 和 CSS 变量颜色

- **更新** .gitignore
  - 新增 .superpowers/ 忽略
  - 新增 data/ 忽略（项目数据目录）
  - 新增 .claude/settings.local.json 忽略

### 2026-05-27: AskUserQuestion 交互式支持

#### 模块: 核心通信

- **7b697a5** `feat: add AskUserQuestion interactive support with stdin stream-json input`

  - **更新** app/api/chat/route.ts
    - Claude CLI 参数新增 `--input-format stream-json`，启用 stdin 多轮交互
    - 移除 prompt 作为位置参数（之前 `args.push(resolvedMessage)`），改为通过 stdin JSONL 写入
    - stdin 写入格式：`{ type: 'user', message: { role: 'user', content: [{ type: 'text', text: ... }] } }`
    - 保持 stdin 打开（`run.stdinOpen = true`），支持后续 tool_result 回传
    - 在 stream handler 中追踪 AskUserQuestion tool_use 事件：`run.pendingHostAnswers.add(event.id)`

#### 模块: 交互式问答组件

  - **新建** components/QuestionCard.tsx
    - AskUserQuestion 工具的专用交互卡片组件（228 行）
    - 支持 Question 数据模型：question, header, options, multiSelect
    - 选项卡片：radio（单选）或 checkbox（多选）样式指示器
    - selectedMap 状态管理：`Record<questionIndex, selectedLabels[]>`
    - 独立"确认选择"按钮：所有问题都选择后才可点击
    - 提交后显示"已回答"徽章，未选中选项降低透明度
    - 左侧紫色色条（#6366f1），SVG 问号图标
    - 提交回调 `onSelect(toolUseId, answer)` 传递给父组件

  - **更新** components/AssistantMessage.tsx
    - 新增 `onSelectAnswer` prop 回调
    - tool block 渲染逻辑分支：AskUserQuestion 工具渲染 QuestionCard，其他工具渲染 ToolCard
    - 从 tool.input 中提取 questions 数组传递给 QuestionCard

  - **更新** components/MessageList.tsx
    - 新增 `onSelectAnswer` prop，透传给 AssistantMessage

#### 模块: 问答回传机制

  - **更新** components/ChatPanel.tsx
    - 新增 `handleAnswer` 回调：通过 POST /api/runs/{runId}/tool-result 回传用户选择
    - handleSubmit 支持字符串参数（`eOrText: React.FormEvent | string`），为 handleAnswer 预留扩展
    - MessageList 传入 `onSelectAnswer={handleAnswer}`

  - **已有** app/api/runs/[id]/tool-result/route.ts（前版本已实现）
    - 接收 `{ toolUseId, content }` 后构建 `type: 'user'` + `tool_result` JSONL 消息
    - 通过 stdin.write 写入 Claude CLI 进程
    - 从 pendingHostAnswers 中移除，无待回答时关闭 stdin
