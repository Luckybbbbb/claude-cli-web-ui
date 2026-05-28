# UI 组件系统

<!-- OVERVIEW_START -->
## 概览

### 核心概念
- **Kimi 风格设计系统**: 黑白灰配色，CSS 变量驱动，支持亮色/暗色模式
- **组件树结构**: ChatPanel 为核心状态容器，管理 Sidebar/Header/MessageList/CommandPalette 等子组件
- **消息渲染管线**: AgentEvent[] -> Block[]（text/thinking/tool/question）-> 对应组件渲染

### 关键数据结构
- `Message { id, role, content, events?: AgentEvent[], status? }`: 聊天消息
- `Block { type: 'text'|'thinking'|'tool', content?, tool? }`: 渲染块
- CSS 变量体系: --bg-primary/secondary, --text-primary/secondary, --border, --accent

### 核心流程
- **消息发送**: 输入 -> POST /api/chat -> SSE 流 -> updateLastAssistantMessage -> UI 更新
- **命令面板**: parseTrigger 检测 / 或 @ -> CommandPalette 弹出 -> 选择替换文本

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

#### ChatPanel

状态管理核心，维护以下状态：
- `messages: Message[]` — 对话消息列表
- `input: string` — 输入框内容
- `isLoading: boolean` — 是否正在等待响应
- `projects: Project[]` — 项目列表
- `selectedProjectId: string | null` — 当前选中项目
- `selectedSessionId: string | null` — 当前选中会话
- `claudeSessionId: string | null` — Claude CLI 会话 ID（用于 --resume）
- `sidebarCollapsed: boolean` — 侧边栏折叠状态
- `paletteVisible: boolean` — 命令面板可见性
- `connected: boolean` — 连接状态
- `bgVersion: number` — 后台进程变更版本号（触发会话列表状态同步）

**Refs**:
- `backgroundRunsRef: Map<string, BackgroundRun>` — 后台运行管理
- `currentRunIdRef: string | null` — 当前前台 runId
- `streamContextRef: StreamContext | null` — 当前流上下文（前台/后台标记）

**关键行为**:
- 切换项目时：活跃流移入后台（backgroundRunsRef），不取消
- 发送消息时：若无 selectedSessionId 则自动创建会话
- 发送消息时携带 `selectedProject?.path` 作为 `cwd`
- 侧边栏状态和项目 ID 通过 localStorage 持久化
- 组件卸载时取消所有后台进程

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

### 移动端适配

- `viewport` meta: width=device-width, initial-scale=1, maximumScale=5
- `visualViewport` 监听：虚拟键盘弹出时调整输入框位置
- 安全区域：`env(safe-area-inset-bottom)` 处理刘海屏
- 响应式布局：sm: 前缀适配不同屏幕尺寸
