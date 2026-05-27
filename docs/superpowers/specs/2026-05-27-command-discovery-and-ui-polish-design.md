# Command Discovery & UI Polish Design

## Overview

两个迭代目标：
1. **命令面板动态化** — `/` 命令面板从硬编码改为动态获取所有可用 skills 和命令
2. **界面美化** — 参照 Kimi (kimi.com) 的现代简约聊天风格，全面提升视觉表现

执行顺序：先完成命令面板动态化，再做界面美化。

## Part 1: 命令面板动态化

### 方案：文件系统扫描 + 缓存

Claude CLI 没有提供单一的"列出所有命令"API，因此采用服务端文件系统扫描方案。

### 数据源

Skills 来自 4 个渠道，扫描逻辑覆盖前 3 个：

| 渠道 | 路径 | 说明 |
|------|------|------|
| 本地 skills | `~/.claude/skills/*/skill.md` 或 `SKILL.md` | 用户自定义 skills |
| 插件 skills | `~/.claude/plugins/cache/*/skills/*/SKILL.md` | 插件提供的 skills |
| 插件 commands | `~/.claude/plugins/cache/*/commands/*.md` | 部分插件用 commands 目录 |
| 内置命令 | 编译在 claude.exe 中 | 无法动态发现，硬编码基准列表 |

### 内置命令基准列表

以下命令随 CLI 版本变化缓慢，作为硬编码基准：

`/init`, `/review`, `/security-review`, `/help`, `/compact`, `/model`, `/config`, `/clear`, `/run`, `/bughunt`, `/bughunt-lite`, `/deep-research`, `/plan-hunter`, `/review-branch`, `/verify`, `/code-review`, `/loop`

### API 设计

#### GET /api/commands/discover

扫描文件系统，返回所有可用的 skills 和命令。服务端缓存 5 分钟。

响应格式：

```json
{
  "categories": [
    {
      "id": "builtin",
      "name": "内置命令",
      "items": [
        { "name": "/help", "description": "显示帮助信息", "type": "builtin" },
        { "name": "/compact", "description": "压缩对话上下文", "type": "builtin" }
      ]
    },
    {
      "id": "local-skills",
      "name": "本地 Skills",
      "items": [
        { "name": "/closeup-camera-system", "description": "...", "type": "skill", "source": "local" }
      ]
    },
    {
      "id": "plugin-superpower-claude-plus",
      "name": "Superpower Claude+",
      "items": [
        { "name": "/brainstorming", "description": "...", "type": "skill", "source": "plugin", "plugin": "superpower-claude-plus" }
      ]
    }
  ]
}
```

#### 扫描实现

```
lib/command-discovery.ts:
  - discoverAllCommands(homeDir: string): Promise<Category[]>
  - 扫描 ~/.claude/skills/*/ 读取 YAML frontmatter
  - 扫描 ~/.claude/plugins/cache/*/skills/*/ 读取 YAML frontmatter
  - 扫描 ~/.claude/plugins/cache/*/commands/*.md 读取 YAML frontmatter
  - 合并内置命令基准列表
  - 按来源分组为 categories
```

YAML frontmatter 解析：读取每个 skill.md 文件前 20 行，提取 `name` 和 `description` 字段。

缓存：内存缓存，5 分钟 TTL。首次请求时填充，后续命中缓存直接返回。

### 前端变更

#### CommandPalette.tsx

- `fetchCommands()` 改为调用 `/api/commands/discover`
- 命令按 category 分组显示，每组带标题
- 搜索跨所有 categories 进行
- 选中 skill 类型的命令时，插入格式为 `/plugin-name:skill-name`（对于插件 skills）或 `/skill-name`（对于本地 skills）

#### 路由注册

保留原有 `/api/commands`（静态列表）作为 fallback，新增 `/api/commands/discover`（动态发现）。

### 保留 /api/commands

原有 `/api/commands` 路由保持不变，作为简化的 fallback。CommandPalette 优先使用 `/api/commands/discover`，失败时降级到 `/api/commands`。

### Files to Create/Modify

**新建：**
- `lib/command-discovery.ts` — 文件系统扫描 + 缓存逻辑
- `app/api/commands/discover/route.ts` — 动态命令发现 API

**修改：**
- `components/CommandPalette.tsx` — 使用新的 discover API，分组显示
- `lib/commands.ts` — 更新类型定义，添加 Category 类型

---

## Part 2: 界面美化（参考 Kimi 设计）

### 设计语言

参照 Kimi (kimi.com) 的视觉风格：
- 大面积留白，视觉干净
- 圆角统一（16px 气泡，12px 卡片，8px 按钮）
- 柔和阴影
- 现代简约聊天风

### 色彩体系

基于 CSS 变量，支持深色/浅色模式：

```
浅色模式：
  --bg-primary: #ffffff
  --bg-secondary: #f7f7f8
  --bg-user-bubble: #4f46e5 (靛蓝)
  --bg-assistant-bubble: #f0f0f0
  --text-primary: #1a1a1a
  --text-secondary: #6b7280
  --border: #e5e7eb
  --accent: #4f46e5

深色模式：
  --bg-primary: #1a1a2e
  --bg-secondary: #16213e
  --bg-user-bubble: #4f46e5
  --bg-assistant-bubble: #2a2a3e
  --text-primary: #e5e7eb
  --text-secondary: #9ca3af
  --border: #374151
  --accent: #6366f1
```

### 组件级改动

#### 1. 顶栏

极简顶栏，60px 高：
- 左侧："Claude CLI" 文字 logo，font-semibold
- 右侧：连接状态圆点（绿色=连接，红色=断开）+ 当前模型 chip
- 半透明白色背景 + 底部 1px border

#### 2. 空状态（参考 Kimi 首页）

居中布局，垂直排列：
- "Claude CLI" 大标题 + 副标题描述
- 3-4 个快捷操作卡片，横向排列：
  - "编写代码" — icon + 文字
  - "调试问题" — icon + 文字
  - "代码审查" — icon + 文字
  - "深度研究" — icon + 文字
- 点击卡片：将预设 prompt 填入输入框
- 卡片样式：白底、圆角 12px、hover 微妙阴影

#### 3. 输入区域（参考 Kimi 输入框）

- 居中输入框，max-width 768px
- 圆角 16px，浅灰背景（#f7f7f8），1px border
- 聚焦时：border 变为 accent 色 + 微妙阴影
- placeholder："输入消息，或使用 / 触发命令..."
- 右侧发送按钮：圆形，accent 色背景，白色箭头图标
- 底部小字："使用 / 触发命令 · 使用 @ 引用文件"

#### 4. 消息气泡

- **用户消息**：accent 色背景，白色文字，右侧对齐，圆角 16px（左下 4px）
- **助手消息**：浅灰背景，深色文字，左侧对齐，圆角 16px（右下 4px）
- 助手消息左上角小 Claude 头像/图标
- 消息间距 16px
- 出现动画：fadeIn + slideUp，200ms

#### 5. 工具卡片

- 白底卡片，圆角 12px，1px border
- 标题栏：工具图标 + 工具名 + 关键参数摘要
- 展开/收起箭头，带旋转动画
- 展开区域：代码块风格，等宽字体
- 成功/失败状态：左侧竖条颜色（绿色/红色）

#### 6. 思考块

- 淡黄色背景，圆角 12px
- 可折叠，默认收起
- 折叠时显示 "思考中... (N 字)"
- 展开时显示思考内容，等宽字体

#### 7. 命令面板

- 圆角 12px，白底，柔和阴影
- 分组标题：小号灰色文字
- 选中项：accent 色浅背景
- 每项显示命令名 + 描述

### 动画

- 消息出现：`fadeIn + slideUp 200ms ease-out`
- 面板展开/收起：`max-height transition 200ms`
- 输入框聚焦：`border-color + box-shadow transition 150ms`
- 发送按钮 hover：`scale(1.05) 100ms`

### Files to Modify

- `app/globals.css` — CSS 变量体系 + 动画 keyframes + 全局样式
- `components/ChatPanel.tsx` — 输入区域重设计 + 空状态
- `components/MessageList.tsx` — 消息气泡样式升级 + 动画
- `components/AssistantMessage.tsx` — 适配新样式
- `components/ToolCard.tsx` — 卡片美化
- `components/ThinkingBlock.tsx` — 思考块美化
- `components/CommandPalette.tsx` — 面板样式升级
- `app/layout.tsx` — 顶栏集成

### 新建文件

- `components/Header.tsx` — 极简顶栏组件
- `components/EmptyState.tsx` — 空状态组件（快捷操作卡片）
- `components/QuickAction.tsx` — 快捷操作卡片组件

---

## Non-Goals

- 不做多会话/历史记录功能
- 不做深色/浅色模式切换 UI（仅通过系统偏好自动适配）
- 不做认证/登录
- 不做移动端专项适配（现有响应式已够用）
- 不引入新 UI 框架（纯 Tailwind CSS）
