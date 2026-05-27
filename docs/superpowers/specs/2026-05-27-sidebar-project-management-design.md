# Sidebar, Project Management & Plugin Skills Design

## Overview

三个目标：
1. **左侧边栏 + 项目管理** — 可收缩侧边栏管理多个项目，每个项目绑定工作目录
2. **工作目录联动** — 选中项目的路径作为 Claude CLI 的 cwd
3. **Plugin Skills 补全** — 修复命令面板中缺失的插件 skills（如 superpower-claude-plus:brainstorming）

## Part 1: 左侧边栏 + 项目管理

### 侧边栏 UI

**组件：** `components/Sidebar.tsx`

- 280px 宽，可收缩（hamburger 按钮切换）
- 收缩状态宽度 0，隐藏 overflow
- 收缩状态存 localStorage（key: `sidebarCollapsed`）
- 深色背景（`var(--bg-secondary)`），右边框 `var(--border)`

**项目列表：**
- 每项显示：项目名（font-medium）+ 路径（小字灰色，truncate）
- 当前选中项：深色背景高亮
- hover 时显示操作按钮：设置（改路径） / 删除
- 点击切换项目

**底部：**
- "+ Add Project" 按钮，点击弹出模态框

### 添加项目模态框

**组件：** `components/AddProjectModal.tsx`

字段：
- **项目名**（必填）— 文本输入
- **工作目录**（必填）— 文本输入，填绝对路径

操作：
- "Cancel" 关闭模态框
- "Add" 提交，API 端校验路径是否存在
- 路径无效时显示红色错误提示

编辑现有项目：复用同一模态框，预填现有值。

### 项目切换行为

切换项目时：
1. **重置会话** — 清空 messages 数组
2. **取消进行中的 run** — 如有运行中的 SSE 流，调用 cancel API
3. **更新 cwd** — 新消息使用新项目路径
4. **更新 Header** — 显示新项目名
5. **关闭模态框**（如打开的话）

### 数据存储

**文件：** `data/projects.json`（项目根目录下）

格式：
```json
[
  {
    "id": "a1b2c3d4",
    "name": "claude-cli-web-ui",
    "path": "E:\\AIDemos\\claude-cli-web-ui",
    "createdAt": "2026-05-27T00:00:00.000Z"
  }
]
```

- `id` — 8 位随机 hex
- `.gitignore` 排除 `data/`
- 当前选中项目 ID 存 localStorage（key: `selectedProjectId`）
- 首次访问无项目时，自动添加当前项目（`process.cwd()`）

### API

**GET /api/projects** — 返回项目列表
**POST /api/projects** — 新增项目，body: `{ name, path }`
**PUT /api/projects** — 更新项目，body: `{ id, name?, path? }`
**DELETE /api/projects** — 删除项目，body: `{ id }`

服务端维护 `data/projects.json`，不存在时自动创建空数组。

### 布局调整

`app/layout.tsx` 或 `components/ChatPanel.tsx` 的最外层：
```
┌──────────┬─────────────────────────────┐
│ Sidebar  │ Header                      │
│ 280px    ├─────────────────────────────┤
│          │ Content (EmptyState /       │
│          │   MessageList)              │
│          │                             │
│          ├─────────────────────────────┤
│          │ Input Bar                   │
└──────────┴─────────────────────────────┘
```

Sidebar 和 Main 区域使用 flexbox 横向排列。

### Header 更新

`components/Header.tsx` 增加显示：
- 左侧：hamburger 按钮 + 当前项目名（代替固定的 "Claude CLI"）
- 右侧：连接状态 + 模型 chip（不变）

### ChatPanel 更新

- 接收 `selectedProject` prop
- 发送消息时 `body: { message, cwd: project.path, model }`
- 提供 `resetConversation()` 方法给 Sidebar 调用
- 切换项目时调用 `resetConversation()`

## Part 2: Plugin Skills 补全

### 问题

当前 `lib/command-discovery.ts` 已扫描 `~/.claude/plugins/cache/*/skills/*/SKILL.md`，但 API 返回只有 builtin + local-skills，缺少 plugin 类别。

### 排查方向

1. 路径匹配问题 — `SKILL.md` vs `skill.md` 大小写
2. 目录结构 — 部分插件可能有嵌套子目录
3. frontmatter 解析 — 某些 skill 文件格式可能不同

### 修复

排查并修复 `lib/command-discovery.ts` 中的插件扫描逻辑，确保所有已安装插件的 skills 正确出现在命令面板。插件 skills 的插入格式为 `/plugin-name:skill-name`。

## Files

**新建：**
- `components/Sidebar.tsx` — 侧边栏
- `components/AddProjectModal.tsx` — 添加/编辑项目模态框
- `app/api/projects/route.ts` — 项目 CRUD API
- `lib/projects.ts` — 项目数据读写

**修改：**
- `components/ChatPanel.tsx` — 集成侧边栏 + 传 cwd + 重置逻辑
- `components/Header.tsx` — 显示项目名 + hamburger
- `app/globals.css` — 侧边栏相关样式
- `lib/command-discovery.ts` — 修复 plugin skills 扫描
- `.gitignore` — 排除 `data/`

## Non-Goals

- 会话历史 / `/resume` 恢复（Spec B）
- 文件夹浏览器选择器（用文本输入路径）
- 项目排序 / 拖拽
- 多 tab / 窗口同步
