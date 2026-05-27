# 项目管理系统

<!-- OVERVIEW_START -->
## 概览

### 核心概念
- **项目 (Project)**: 表示一个工作目录，包含 id/name/path/createdAt 四个字段
- **JSON 文件存储**: 使用 data/projects.json 持久化项目列表
- **项目切换**: 切换项目时重置对话，后续消息携带新项目的 cwd

### 关键数据结构
- `Project { id, name, path, createdAt }`: 项目实体
- `data/projects.json`: 项目列表持久化文件（JSON 数组）

### 核心流程
- **首次访问**: 自动将当前工作目录添加为第一个项目
- **CRUD**: 通过 /api/projects 端点进行增删改查，路径唯一性校验
- **项目切换**: 用户选择新项目 -> resetConversation() -> 更新 selectedProjectId -> 消息携带新 cwd

### 与其他系统的交互
- **ChatPanel**: 管理项目状态，切换时重置对话，发送消息传 cwd
- **Sidebar**: 显示项目列表，触发选择/编辑/删除操作
- **Claude CLI**: cwd 参数传递给 spawn 的 options.cwd
<!-- OVERVIEW_END -->

---

## 详解

### 数据层 (lib/projects.ts)

**存储位置**: `data/projects.json`（项目根目录下）

**ID 生成**: `randomBytes(4).toString('hex')`（8 位十六进制字符串）

**自动初始化**: 首次调用 `ensureDataFile()` 时，如果文件不存在，自动创建并添加当前目录项目。

**CRUD 操作**:
- `listProjects()`: 读取并返回所有项目
- `addProject(name, path)`: 添加项目，检查路径唯一性
- `updateProject(id, updates)`: 更新项目名称或路径，检查路径唯一性
- `deleteProject(id)`: 删除项目

### API 层 (app/api/projects/route.ts)

| 方法 | 功能 | 校验 |
|------|------|------|
| GET | 返回所有项目 | 无 |
| POST | 添加项目 | 名称非空、路径非空、路径存在、路径唯一 |
| PUT | 更新项目 | ID 必填、至少一个更新字段、路径存在性校验 |
| DELETE | 删除项目 | ID 必填 |

**错误码**:
- 400: 参数缺失或路径不存在
- 404: 项目不存在
- 409: 路径重复

### UI 层

#### Sidebar (components/Sidebar.tsx)

- 280px 固定宽度，可收缩
- 项目列表项：
  - 选中状态：`color-mix(in srgb, var(--accent) 12%, transparent)` 背景
  - Hover 状态：`color-mix(in srgb, var(--accent) 6%, transparent)` 背景
  - 路径截断：超过 32 字符显示为 `...\last\two\segments`
  - 操作按钮：hover 或选中时显示编辑（齿轮图标）和删除（X 图标）

#### AddProjectModal (components/AddProjectModal.tsx)

- 双模式：添加（空表单）和编辑（预填充数据）
- 表单字段：Project Name + Working Directory
- 自动聚焦到第一个输入框
- Enter 提交 + Escape 关闭

### 状态持久化

| 状态 | 存储位置 | 说明 |
|------|----------|------|
| 项目列表 | `data/projects.json` | 服务端文件 |
| 选中项目 ID | `localStorage.selectedProjectId` | 客户端 |
| 侧边栏折叠 | `localStorage.sidebarCollapsed` | 客户端 |

### 项目切换行为

1. 用户点击 Sidebar 中的项目
2. ChatPanel.handleSelectProject 被调用
3. 如果是同一项目，直接返回
4. 如果有活跃的前台 SSE 流（readerRef.current && selectedSessionId）：
   - 将当前流移入后台（backgroundRunsRef Map）
   - 设置 streamContext.isBackground = true
   - 拷贝 messages 到 BackgroundRun
   - 递增 bgVersion 触发会话列表状态同步
5. 否则：cancelStream() 取消当前流
6. 更新 selectedProjectId，localStorage 持久化
7. 后续发送消息时，requestBody.cwd = selectedProject.path
8. 服务端 chat API 使用 cwd 作为 spawn 的 options.cwd

**删除项目时的清理**:
- 遍历 backgroundRunsRef，取消该项目下所有后台进程
- 对每个后台 run 发送 POST /api/runs/{runId}/cancel
- 从 Map 中移除，递增 bgVersion
