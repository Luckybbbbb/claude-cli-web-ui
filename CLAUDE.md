# Claude CLI Web UI

一个基于 Next.js 的 Web 界面，用于在浏览器中与 Claude CLI 进行交互式对话。

## 项目概览

- **技术栈**: Next.js 14 (App Router) + React 18 + TypeScript + Tailwind CSS
- **包管理器**: pnpm@10.33.2
- **设计系统**: Kimi 风格黑白灰主题（CSS 变量驱动，支持暗色模式）
- **核心依赖**: cmdk（命令面板）、react-markdown + remark-gfm（Markdown 渲染）

## 项目结构

```
claude-cli-web-ui/
  app/
    api/
      chat/route.ts              -- 对话 API，spawn Claude CLI 进程（支持 --resume）
      commands/
        discover/route.ts        -- 动态命令发现 API
        route.ts                 -- 静态命令列表 API
      files/route.ts             -- 文件系统扫描 API（支持 cwd 参数）
      projects/route.ts          -- 项目 CRUD API
      runs/[id]/
        cancel/route.ts          -- 取消运行中的进程
        events/route.ts          -- SSE 事件流
        tool-result/route.ts     -- 工具调用结果
      sessions/
        route.ts                 -- 会话列表 CRUD API
        [id]/route.ts            -- 单会话详情 API
    globals.css                  -- 设计系统（CSS 变量 + 动画 + 工具类）
    layout.tsx                   -- 根布局
    page.tsx                     -- 首页（ChatPanel 入口）
  components/
    AddProjectModal.tsx          -- 添加/编辑项目模态框
    AssistantMessage.tsx         -- 助手消息渲染（文本/思考/工具）
    ChatPanel.tsx                -- 主聊天面板（状态管理 + 会话持久化）
    CommandPalette.tsx           -- 命令面板（/ 和 @ 触发，cwd 感知）
    EmptyState.tsx               -- 空状态首页（快捷操作）
    Header.tsx                   -- 顶栏（项目名 + 连接状态 + 模型）
    MessageList.tsx              -- 消息列表（气泡 + 头像 + 动画）
    QuestionCard.tsx             -- AskUserQuestion 交互式问答卡片（单选/多选）
    QuickAction.tsx              -- 快捷操作卡片
    Sidebar.tsx                  -- 可收缩侧边栏（项目列表 + 会话列表）
    ThinkingBlock.tsx            -- 思考块（淡黄色 + 折叠）
    ToolCard.tsx                 -- 工具卡片（左侧色条 + 展开）
  lib/
    claude-stream.ts             -- Claude CLI stream-json 解析器
    command-discovery.ts         -- 文件系统命令扫描（5 分钟缓存）
    commands.ts                  -- 命令类型定义 + 触发解析 + 文件搜索
    env.ts                       -- 环境变量配置
    projects.ts                  -- 项目数据管理（JSON 文件存储）
    runs.ts                      -- 运行状态管理（内存 Map）
    sessions.ts                  -- 会话数据层（CRUD + 淘汰策略，每项目最多 20 个）
    types.ts                     -- 共享类型定义
  data/
    projects.json                -- 项目列表持久化存储
    sessions/                    -- 会话数据目录（按 projectId 分组）
  docs/                          -- 文档目录
```

## 核心架构

### 数据流

1. 用户在 ChatPanel 输入消息 -> POST /api/chat（携带 claudeSessionId 支持 --resume）
2. 服务端解析 @file/@url 引用，spawn Claude CLI 子进程（--print --verbose --output-format stream-json --input-format stream-json [--resume sessionId]）
3. 用户消息以 JSONL 格式写入 stdin（保持打开），Claude CLI 通过 stdout 输出 stream-json
4. 客户端通过 fetch + ReadableStream 读取 /api/runs/{id}/events 的 SSE 流
5. claude-stream.ts 解析 JSONL 行为结构化事件（text_delta, tool_use, thinking_delta 等）
6. UI 实时渲染消息气泡、工具卡片、思考块、交互式问答卡片
7. AskUserQuestion 工具触发时，QuestionCard 渲染选项，用户选择后通过 tool-result API 回传答案到 stdin
8. 对话完成后（所有 AskUserQuestion 已回答，stdin 关闭），ChatPanel 自动将会话持久化到服务端文件系统

### 命令发现系统

- **本地 Skills**: 扫描 ~/.claude/skills/*/SKILL.md 的 YAML frontmatter
- **Plugin Skills**: 递归扫描 ~/.claude/plugins/cache/ 下的 skills/ 和 .claude/skills/ 目录
- **内置命令**: 硬编码列表（/init, /review, /run 等）
- 5 分钟 TTL 缓存，避免重复文件系统扫描

### 项目管理

- 项目列表存储在 data/projects.json（服务端文件系统）
- 支持增删改查，路径唯一性校验
- 切换项目时加载该项目的会话列表，恢复最近会话

### 会话历史系统

- 会话按项目隔离，存储在 data/sessions/{projectId}/{sessionId}.json
- 每个项目最多保留 20 个会话，超出时按 updatedAt 淘汰最旧的
- 支持 Claude CLI --resume 参数，恢复已有对话上下文
- 会话自动提取标题（取首条用户消息前 30 字符）
- Sidebar 展示树形结构：项目 -> 会话列表，支持新建/删除/切换会话

### @file/@url 引用

- 命令面板 @ 触发树形文件选择器，懒加载目录，独立"选择"按钮确认
- @file 引用在服务端解析为文件内容（单文件 50KB 截断），注入到 prompt
- @file 目录引用递归扫描所有文件（总内容 200KB 截断，最大深度 5 层）
- @url 引用在服务端 fetch 网页内容（10s 超时，50KB 截断），注入到 prompt
- 文件扫描 API 支持 cwd 和 dir 参数，单层目录扫描，路径遍历防护

### 后台进程管理

- 切换项目时不中断正在运行的 Claude CLI 进程，将其移入后台（backgroundRunsRef Map）
- 会话列表实时显示运行中（绿色脉冲圆点 + "运行中"标签）和空闲状态
- 选择后台会话时恢复到前台继续接收 SSE 事件
- 删除项目/会话时自动清理关联的后台进程
- bgVersion 计数器触发会话列表状态同步

### 自动会话创建

- 发送消息时如果没有选中会话但有选中项目，自动 POST /api/sessions 创建
- 创建后自动刷新会话列表
- 使用 activeSessionId 局部变量避免闭包引用过期

### 交互式问答 (AskUserQuestion)

- Claude CLI 通过 --input-format stream-json 启用 stdin/stdout 双向 JSONL 通信
- AskUserQuestion tool_use 事件到达时，tool_use_id 加入 pendingHostAnswers Set
- QuestionCard 组件渲染交互式选项卡片（单选/多选），用户选择后调用 handleAnswer
- handleAnswer 通过 POST /api/runs/{id}/tool-result 将答案回传
- tool-result API 构建 tool_result JSONL 写入 stdin，从 pendingHostAnswers 移除
- 当 pendingHostAnswers 为空时关闭 stdin，Claude 完成对话
- stdin 保持打开期间 run.stdinOpen = true，允许多轮交互

### LAN 访问

- dev 脚本绑定 0.0.0.0（`next dev -H 0.0.0.0 -p 0`），支持局域网设备访问
- 自动分配端口（-p 0）
- start.bat 一键启动脚本（Windows）

## 开发命令

```bash
pnpm dev     # 启动开发服务器
pnpm build   # 构建生产版本
pnpm start   # 启动生产服务器
pnpm test    # 运行测试
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| CLAUDE_BIN | `claude` | Claude CLI 可执行文件路径 |
| DEFAULT_MODEL | `claude-sonnet-4-6` | 默认模型 |
| DEFAULT_CWD | `process.cwd()` | 默认工作目录 |
| PORT | `0`（自动） | 服务端口（绑定 0.0.0.0 支持 LAN 访问） |

## 文档版本追踪

- **上次文档更新版本**: d989852
- **当前文档更新版本**: 7b697a5
- **更新日期**: 2026-05-27

## 项目文档索引

- [改动记录](docs/changelog.md) -- 按版本记录代码变更历史
- [项目架构大纲](docs/architecture/overview.md) -- 项目总览与系统架构
- [流式通信系统](docs/architecture/streaming-system.md) -- SSE 流式通信与 stream-json 解析
- [命令发现系统](docs/architecture/command-discovery-system.md) -- 文件系统命令扫描与分类
- [UI 组件系统](docs/architecture/ui-system.md) -- 界面设计系统与组件架构
- [项目管理系统](docs/architecture/project-management-system.md) -- 多项目管理与切换
- [经验总结](docs/lessons-learned.md) -- Bug 修复经验与开发教训
