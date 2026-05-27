# Mobile Optimization & Command Autocomplete Design

## Overview

为 Claude CLI Web UI 添加移动端响应式优化和 `/` `@` 自动补全功能。使用 cmdk 库处理命令面板逻辑，Tailwind CSS 处理响应式布局，保持单一代码库。

## Architecture

改动分为 3 个独立领域：

1. **响应式布局层** — 修改现有 ChatPanel、MessageList，添加移动端断点样式
2. **自动补全系统** — 新增 CommandPalette 组件和命令数据层，基于 cmdk
3. **API 层** — 新增命令列表和文件搜索接口，修改 chat API 支持 @ 引用解析

组件依赖：`CommandPalette` → `lib/commands.ts` → API routes，`ChatPanel` → `CommandPalette`

## Responsive Layout

### Breakpoints

- `sm`（640px）以下为手机端，以上为桌面端
- 不做平板专项适配

### ChatPanel Input Area

- `<input>` 替换为 `<textarea>`，底部固定（`sticky bottom-0`）
- `max-height: 120px`，超出滚动，自动高度增长（scrollHeight 驱动），单行到最多 5 行
- 手机端字号 `text-base`（防止 iOS 自动缩放），padding 加大 `px-3 py-2.5`
- 使用 `visualViewport` API 适配虚拟键盘弹出

### MessageList

- 手机端消息气泡 `max-width: 90%`（桌面 80%）
- 助手消息的工具卡片手机端默认折叠
- padding 缩小：`p-2 sm:p-4`

### Safe Area

- 底部输入栏添加 `env(safe-area-inset-bottom)` 适配 iPhone 底部横条

## Command Autocomplete

### Trigger Mechanism

- `/` 在行首或空格后触发，匹配命令列表
- `@` 任意位置触发，匹配文件/URL 引用
- `Escape` 或删除到只剩触发符号时关闭面板
- 选中后替换光标前从触发符号开始的文本

### / Commands

两类命令：

- **Frontend commands**：`/clear`、`/help` — 前端拦截，不经过 CLI
- **CLI commands**：`/compact`、`/model`、`/config` — 透传给后端 CLI 处理

命令列表从 `/api/commands` 动态获取，cmdk 提供模糊搜索。

### @ References

| 前缀 | 数据源 | 插入格式 |
|------|--------|---------|
| `@` | 分类列表 | 继续输入过滤 |
| `@file` | `/api/files?prefix=...` | `@file path/to/file` |
| `@url` | 无（手动输入） | `@url https://...` |

文件引用支持前缀搜索，后端按工作目录实时列出匹配文件，最多 20 条。

### cmdk Panel Style

- 定位 `absolute bottom-full`，在输入框正上方
- 最大高度 240px，超出滚动
- 桌面端宽度与输入框一致，手机端全宽
- 选中项高亮背景，支持键盘上下箭头和触控选择

## API Layer

### GET /api/commands

返回可用命令列表：

```json
{
  "commands": [
    { "name": "/clear", "description": "清除对话历史", "type": "frontend" },
    { "name": "/help", "description": "显示帮助信息", "type": "frontend" },
    { "name": "/compact", "description": "压缩对话上下文", "type": "cli" },
    { "name": "/model", "description": "切换模型", "type": "cli", "args": ["sonnet", "opus", "haiku"] },
    { "name": "/config", "description": "查看/修改配置", "type": "cli" }
  ]
}
```

### GET /api/files?prefix=&limit=20

按前缀搜索项目文件。复用 `getEnvConfig().defaultCwd` 作为工作目录。过滤 `node_modules`、`.git`、`.next`。返回：

```json
{
  "files": [
    { "path": "src/app/page.tsx", "type": "file" },
    { "path": "src/components/", "type": "directory" }
  ]
}
```

### Modified POST /api/chat

解析消息中的 `@file` 和 `@url` 标记：

- `@file path`：读取文件内容，拼接到消息末尾（`<file path="...">\n内容\n</file>`）
- `@url url`：抓取 URL 内容，拼接为上下文
- 超过 50KB 的文件内容截断并提示

### Error Handling

- 文件不存在：前端 cmdk 显示红色提示
- URL 抓取失败：消息中标注 `[URL 无法访问]`
- 命令参数缺失：选中带参数命令后自动填入参数模板

## New Dependencies

- `cmdk` — 命令面板组件库（~21KB gzip）

## Files to Create/Modify

### New files
- `components/CommandPalette.tsx` — 自动补全面板组件
- `lib/commands.ts` — 命令定义、搜索、执行逻辑
- `app/api/commands/route.ts` — 命令列表 API
- `app/api/files/route.ts` — 文件搜索 API

### Modified files
- `components/ChatPanel.tsx` — 输入框改造 + 集成 CommandPalette
- `components/MessageList.tsx` — 移动端样式调整
- `app/layout.tsx` — viewport meta 标签
- `app/api/chat/route.ts` — @ 引用解析
- `app/globals.css` — safe area 工具类
