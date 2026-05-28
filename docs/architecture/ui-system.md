# UI 组件系统

<!-- OVERVIEW_START -->
## 概览

### 核心概念
- **Kimi 风格设计系统**: 黑白灰配色，CSS 变量驱动，支持亮色/暗色模式
- **Hook 层 + 多布局**: 状态逻辑抽取为 useChatSession/useProjectList/useSessionList/useBreakpoint，三种布局共享
- **消息渲染管线**: AgentEvent[] -> Block[]（text/thinking/tool/question）-> 对应组件渲染

### 关键数据结构
- `Message { id, role, content, events?: AgentEvent[], status? }`: 聊天消息
- `Block { type: 'text'|'thinking'|'tool', content?, tool? }`: 渲染块
- CSS 变量体系: --bg-primary/secondary, --text-primary/secondary, --border, --accent

### 核心流程
- **消息发送**: 输入 -> POST /api/chat -> SSE 流 -> updateLastAssistantMessage -> UI 更新
- **命令面板**: parseTrigger 检测 / 或 @ -> CommandPalette 弹出 -> 选择替换文本
- **响应式路由**: useBreakpoint 检测 -> MobileLayout (mobile) / TabletLayout (tablet) / ChatPanel (desktop)

### 与其他系统的交互
- **流式通信**: 通过 fetch SSE 接收 AgentEvent，转换为渲染 Block
- **命令发现**: CommandPalette 调用 /api/commands/discover 获取分类命令
- **项目管理**: Sidebar/Header 通过 /api/projects 管理项目切换
<!-- OVERVIEW_END -->

---

## 详解

### 设计系统 (globals.css)

**配色方案**:

亮色模式:
- 背景: #ffffff (primary) / #f5f5f5 (secondary)
- 文本: #1a1a1a (primary) / #999999 (secondary)
- 边框: #e8e8e8
- 强调色: #1a1a1a

暗色模式 (prefers-color-scheme: dark):
- 背景: #0d0d0d (primary) / #1a1a1a (secondary)
- 文本: #e8e8e8 (primary) / #888888 (secondary)
- 边框: #2a2a2a
- 强调色: #cccccc

**消息气泡配色**:
- 用户气泡: --bg-user-bubble（亮色 #1a1a1a，暗色 #333333）
- 助手气泡: --bg-assistant-bubble（亮色 #f5f5f5，暗色 #1a1a1a）

**动画**:
- `messageAppear`: opacity 0->1 + translateY 10px->0（200ms ease-out）
- 侧边栏过渡: width 200ms ease-in-out
- 工具卡片展开: max-height 200ms ease-out

### 核心组件

#### ChatPanel (Desktop Layout)

桌面端布局组件（~270 行），纯 UI 编排层。状态管理委托给 Hook 层：
- `messages: Message[]` — 对话消息列表（来自 useChatSession）
- `input: string` — 输入框内容（本地 UI 状态）
- `isLoading: boolean` — 是否正在等待响应（来自 useChatSession）
- `projects: Project[]` — 项目列表（来自 useProjectList）
- `selectedProjectId: string | null` — 当前选中项目（来自 useProjectList）
- `selectedSessionId: string | null` — 当前选中会话（来自 useChatSession）
- `claudeSessionId: string | null` — Claude CLI 会话 ID（来自 useChatSession）
- `sidebarCollapsed: boolean` — 侧边栏折叠状态（来自 useProjectList）
- `paletteVisible: boolean` — 命令面板可见性（本地 UI 状态）
- `connected: boolean` — 连接状态（来自 useChatSession）
- `bgVersion: number` — 后台进程变更版本号（本地状态）

**Hook 层协调**:
- `backgroundRunsRef` 和 `bgVersion` 在 useChatSession/useProjectList/useSessionList 间共享
- 项目切换通过 useProjectList.selectProject 触发，内部调用 useChatSession.moveCurrentToBackground
- 发送消息携带 `selectedProject?.path` 作为 `cwd`

#### MessageList

- 自动滚动到底部（`scrollIntoView({ behavior: 'smooth' })`）
- 用户消息：右对齐，深色背景，白色文字，圆角 16/16/4/16
- 助手消息：左对齐，浅色背景，带头像（C 字母圆形），圆角 16/16/16/4

#### AssistantMessage

事件到渲染块的转换逻辑：

```
AgentEvent[] -> 累积 text/thinking -> 遇到 tool_use 时 flush -> Block[]
```

- `text_delta`: 累积到 currentText
- `thinking_delta`: 累积到 currentThinking
- `tool_use`: flush 文本和思考，创建 tool block（附带 result）
- `turn_end`: flush 剩余内容

**AskUserQuestion 分支**: tool block 渲染时，如果 tool.name === 'AskUserQuestion'，渲染 QuestionCard 而非 ToolCard。需要 onSelectAnswer 回调以支持用户选择后回传答案。

#### ToolCard

- 左侧色条：绿色（成功）、红色（错误）、默认强调色（进行中）
- SVG 图标映射：Read/Write/Edit/Bash/Glob/Grep/WebFetch/WebSearch
- 折叠/展开动画（max-height 过渡）
- 状态徽章：Done（绿色）、Error（红色）

#### ThinkingBlock

- 淡黄色背景 (#fefce8)
- 默认折叠，显示 "思考中... (N 字)"
- 点击展开显示完整思考内容

#### QuestionCard

AskUserQuestion 工具的专用交互卡片组件（228 行）。

- **数据模型**:
  - `Question { question, header?, options: QuestionOption[], multiSelect? }`
  - `QuestionOption { label, description?, preview? }`
- **视觉风格**: 左侧紫色色条 (#6366f1)，SVG 问号图标，与 ToolCard 风格统一
- **选择交互**:
  - 单选模式：radio 样式圆形指示器，点击切换
  - 多选模式：checkbox 样式方形指示器，点击切换选中/取消
  - selectedMap 状态：`Record<questionIndex, selectedLabels[]>`
- **确认按钮**: 独立"确认选择"按钮，所有问题都至少选择一个选项后激活
- **提交后**: 显示"已回答"绿色徽章，未选中选项降低透明度（opacity: 0.5）
- **回调**: `onSelect(toolUseId, answer)` 将答案传递给 ChatPanel 的 handleAnswer

#### CommandPalette

- 使用 cmdk 库构建（命令模式），自建树形文件浏览器（文件模式）
- 命令模式：分组显示 Built-in Commands / Local Skills / Plugin Groups，搜索过滤
- 文件模式：树形懒加载文件浏览器
  - TreeNode 数据模型（name, path, type, children?, loaded?, expanded?）
  - 懒加载：点击目录通过 /api/files?dir= 加载子项
  - 独立"选择"按钮确认文件选择（单击只设焦点，不直接选中）
  - 键盘导航：ArrowUp/ArrowDown 移动焦点，Enter 确认，Escape 关闭
  - focusedIndex + selectedPath 双状态（焦点与选中分离）
  - flattenVisibleNodes 深度优先遍历用于键盘索引
  - FolderIcon / FileIcon / ChevronIcon SVG 图标

#### Sidebar

- 280px 宽，可收缩（width: 0 + opacity: 0）
- 项目列表：选中高亮 + hover 效果
- 每个项目下的会话列表：
  - 当前会话：蓝色圆点 + 蓝色背景
  - 运行中会话：绿色脉冲圆点 + 绿色"运行中"徽章 + rgba(34,197,94,0.06) 背景
  - 空闲会话：空心圆点
  - hover 显示删除按钮
- 过渡动画 200ms

#### EmptyState

- 空对话首页，显示 4 个快捷操作卡片
- 中文文案："AI 编程助手，随时待命"
- 点击快捷操作自动填充输入框

#### AddProjectModal

- 模态框：支持添加和编辑两种模式
- 表单：项目名 + 工作目录路径
- 输入验证：非空检查
- 点击遮罩关闭 + Escape 关闭

### 移动端适配与响应式布局

#### useBreakpoint Hook

响应式断点检测，150ms 防抖：
- **mobile** (< 768px): 渲染 MobileLayout
- **tablet** (768px ~ 1023px): 渲染 TabletLayout
- **desktop** (>= 1024px): 渲染 ChatPanel

使用 `window.matchMedia` 监听 `(min-width: 768px)` 和 `(min-width: 1024px)` 两个断点变化。

#### MobileLayout (移动端)

三 Tab 导航布局，共享 Hook 层：
- **MobileChatView**: 对话视图，包含 Header + MessageList/EmptyState + CommandPalette + 输入区域
- **MobileHistoryView**: 历史视图，项目卡片列表（名称+路径+操作按钮）+ 会话列表（标题+消息数+相对时间+运行状态）
- **MobileSettingsView**: 设置视图（基础版），展示项目信息和模型信息
- **BottomNavBar**: 底部固定导航栏，SVG 图标，激活态蓝色 (#6495ed)，安全区域适配

#### TabletLayout (平板端)

抽屉式侧边栏布局：
- 复用现有 Sidebar、Header、MessageList、CommandPalette 等组件
- 侧边栏从左侧滑入，背景遮罩
- 手势支持关闭侧边栏
- 汉堡菜单控制抽屉开关

#### 基础移动端适配

- `viewport` meta: width=device-width, initial-scale=1, maximumScale=5
- `visualViewport` 监听：虚拟键盘弹出时调整输入框位置
- 安全区域：`env(safe-area-inset-bottom)` 处理刘海屏
- 响应式布局：sm: / md: / lg: 前缀适配不同屏幕尺寸
- Sidebar 操作按钮触摸兼容：移动端常显（opacity: 0.6），桌面端 hover 触发
