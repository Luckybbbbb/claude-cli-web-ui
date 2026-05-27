# UI 组件系统

<!-- OVERVIEW_START -->
## 概览

### 核心概念
- **Kimi 风格设计系统**: 黑白灰配色，CSS 变量驱动，支持亮色/暗色模式
- **组件树结构**: ChatPanel 为核心状态容器，管理 Sidebar/Header/MessageList/CommandPalette 等子组件
- **消息渲染管线**: AgentEvent[] -> Block[]（text/thinking/tool）-> 对应组件渲染

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
- `sidebarCollapsed: boolean` — 侧边栏折叠状态
- `paletteVisible: boolean` — 命令面板可见性
- `connected: boolean` — 连接状态

**关键行为**:
- 切换项目时调用 `resetConversation()` 清空消息
- 发送消息时携带 `selectedProject?.path` 作为 `cwd`
- 侧边栏状态和项目 ID 通过 localStorage 持久化

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

#### ToolCard

- 左侧色条：绿色（成功）、红色（错误）、默认强调色（进行中）
- SVG 图标映射：Read/Write/Edit/Bash/Glob/Grep/WebFetch/WebSearch
- 折叠/展开动画（max-height 过渡）
- 状态徽章：Done（绿色）、Error（红色）

#### ThinkingBlock

- 淡黄色背景 (#fefce8)
- 默认折叠，显示 "思考中... (N 字)"
- 点击展开显示完整思考内容

#### CommandPalette

- 使用 cmdk 库构建
- 分组显示：Built-in Commands / Local Skills / Plugin Groups
- 搜索过滤：同时匹配 name 和 description
- 键盘导航：上下箭头、Enter 选择、Escape 关闭
- 文件引用模式：@file 触发，调用 /api/files API

#### Sidebar

- 280px 宽，可收缩（width: 0 + opacity: 0）
- 项目列表：选中高亮 + hover 效果
- 悬浮显示编辑/删除按钮
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
