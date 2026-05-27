# 会话历史系统 & @ 文件选择器工作区感知

**日期**: 2026-05-27
**状态**: Approved

## 概述

两个功能迭代：
1. `@` 文件选择器始终扫描 Claude 当前工作目录，而非固定的 `defaultCwd`
2. 侧边栏增加二级会话历史列表，支持新建、恢复、删除会话

## 1. `@` 文件选择器工作区感知

### 现状问题

`/api/files` 的扫描目录固定为 `DEFAULT_CWD`（或 `process.cwd()`），不感知用户在侧边栏选中的项目。

### 修改方案

`GET /api/files` 新增 `cwd` 查询参数：

```
GET /api/files?prefix=src&limit=20&cwd=E:\my-project
```

- 如果传入 `cwd` 且路径有效，用它作为扫描根目录
- 否则回退到 `config.defaultCwd`

前端 `CommandPalette.tsx` 中 `fetchFiles` 追加 `cwd` 参数，值取自当前会话的 `cwd`（或 `selectedProject.path`）。

## 2. 会话历史系统

### 数据模型

```ts
interface Session {
  id: string;                        // 8位随机 hex
  projectId: string;                 // 所属项目 ID
  title: string;                     // 首条消息前50字符自动生成
  cwd: string;                       // 创建时的 Claude 工作目录
  claudeSessionId: string | null;    // Claude CLI 会话 ID，用于 --resume
  messages: Message[];               // 完整消息历史
  createdAt: string;                 // ISO 时间戳
  updatedAt: string;                 // 最后消息时间
}

interface SessionMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}
```

### 存储结构

```
data/
  projects.json                // 现有
  sessions/
    <projectId>/
      <sessionId>.json         // 每个会话一个文件
```

- 每个会话一个 JSON 文件，路径为 `data/sessions/<projectId>/<sessionId>.json`
- 读取列表只需 `readdir` + 读取每个文件的元数据字段
- 每个项目最多 20 个会话，超出时按 `updatedAt` 淘汰最旧的

### API 端点

#### `GET /api/sessions?projectId=<id>`

返回指定项目的会话列表（不含消息内容）。

```ts
// 响应
{ sessions: SessionMeta[] }
```

#### `GET /api/sessions/<sessionId>`

返回完整会话数据（含所有消息），用于恢复历史会话。

```ts
// 响应
{ session: Session }
```

#### `POST /api/sessions`

创建新会话。创建时自动淘汰超出 20 个的最旧会话。

```ts
// 请求
{ projectId: string }
// 响应
{ session: Session }
```

#### `PUT /api/sessions/<sessionId>`

更新会话（追加消息、更新标题）。

```ts
// 请求
{ messages?: Message[], title?: string }
```

每次 Claude 响应完成后（SSE 流结束），前端调用此接口持久化消息。首条消息发送时也调用此接口更新标题。

#### `DELETE /api/sessions/<sessionId>`

删除会话，直接删除对应 JSON 文件。

### 前端交互

#### 侧边栏改造（Sidebar.tsx）

**新增 Props：**

```ts
interface SidebarProps {
  projects: Project[];
  selectedId: string | null;
  sessions: SessionMeta[];             // 新增
  selectedSessionId: string | null;    // 新增
  onSelectProject: (id: string) => void;
  onSelectSession: (id: string) => void; // 新增
  onNewSession: () => void;              // 新增
  onDeleteSession: (id: string) => void; // 新增
  onAddProject: () => void;
  onEditProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
}
```

**交互行为：**

- 点击项目 → 展开/收起二级会话列表，选中该项目（选中项目始终展开）
- 展开时自动调用 `GET /api/sessions?projectId=<id>` 加载列表
- 会话列表项显示：会话标题 + 相对时间（如 "2h ago"）
- 当前会话高亮显示（蓝色圆点 + 背景色）
- 会话列表项 hover 时右侧显示删除图标（x），点击弹出确认弹窗
- 底部 "+ New Session" 按钮触发 `onNewSession`
- 点击会话项 → 恢复该会话到 ChatPanel

#### ChatPanel 状态管理

**新增状态：**

```ts
sessions: SessionMeta[]
selectedSessionId: string | null
```

**核心流程：**

1. **新建会话** → `POST /api/sessions` → 清空 `messages`，设置新 `selectedSessionId`
2. **发送首条消息** → 创建 userMessage 后 `PUT /api/sessions/<id>`，用消息前 50 字符作为标题
3. **SSE 流结束** → 将完整 `messages` 数组 `PUT /api/sessions/<id>` 持久化
4. **恢复历史会话** → `GET /api/sessions/<id>` → 恢复 `messages` 到 state；如果 `claudeSessionId` 存在，下次发消息时 spawn CLI 带 `--resume <claudeSessionId>`
5. **切换项目** → 加载新项目的 sessions 列表，自动选中最新的会话

#### Claude CLI 集成

- spawn Claude 进程时，从 SSE 流中捕获 Claude CLI 返回的 session ID 并存入 `Session.claudeSessionId`
- 恢复历史会话时，如果 `claudeSessionId` 存在，spawn 参数增加 `--resume <claudeSessionId>`
- 这样 Claude 能看到之前的对话上下文，实现真正的会话续接

### 淘汰策略

新建会话后：
1. 读取 `data/sessions/<projectId>/` 目录下的文件数量
2. 如果超过 20 个，按文件修改时间排序，删除最旧的
3. 在 `POST /api/sessions` 中自动执行，无需前端干预

### 删除确认

删除会话时弹出确认弹窗："确定删除会话「{title}」吗？此操作不可撤销。"
