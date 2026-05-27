# 移动端交互体验设计

**日期**: 2026-05-28
**状态**: 已确认
**方案**: B — 移动端独立组件 + 共享 Hook 层

## 目标

在手机和平板上提供原生 App 风格的完整交互体验，包括对话、文件引用、命令面板、项目管理等所有功能。桌面端不受影响。

## 断点策略

| 断点 | 范围 | 布局 |
|------|------|------|
| mobile | < 768px | 底部导航 + 全屏页面切换 |
| tablet | 768px - 1024px | 侧边栏抽屉 + 全宽主内容 |
| desktop | >= 1024px | 现有布局不变 |

## 架构

### 顶层切换

`page.tsx` 使用 `useBreakpoint()` Hook 决定渲染哪个布局：

```
page.tsx
  ├── mobile → <MobileLayout>
  ├── tablet → <TabletLayout>
  └── desktop → 现有布局（不变）
```

### 新增文件结构

```
components/
  mobile/
    MobileLayout.tsx         -- 手机整体布局（底部导航 + 页面切换）
    MobileChatView.tsx       -- 手机对话页
    MobileHistoryView.tsx    -- 手机历史页（项目+会话列表）
    MobileSettingsView.tsx   -- 手机设置页
    MobileCommandPalette.tsx -- 手机命令面板（全屏半透明）
    BottomNavBar.tsx         -- 底部导航栏
  tablet/
    TabletLayout.tsx         -- 平板整体布局
hooks/
  useBreakpoint.ts           -- 断点检测
  useChatSession.ts          -- 对话状态（从 ChatPanel 抽取）
  useProjectList.ts          -- 项目列表（从 Sidebar 抽取）
  useSessionList.ts          -- 会话列表（从 Sidebar 抽取）
```

## Hook 层

从 ChatPanel 和 Sidebar 中抽取共享状态逻辑，桌面端和移动端组件共用同一份状态管理。

### useChatSession

从 ChatPanel 抽取：
- messages、activeSessionId、isLoading、runId 状态
- SSE 事件流订阅与解析
- 发送消息（POST /api/chat）
- AskUserQuestion 的 pendingHostAnswers 管理
- handleAnswer 回传逻辑
- 自动会话创建
- 后台进程管理（backgroundRunsRef、bgVersion）
- 会话持久化

### useProjectList

从 Sidebar 抽取：
- 项目列表加载（GET /api/projects）
- 添加/编辑/删除项目
- 当前选中项目状态
- 切换项目时触发会话列表刷新

### useSessionList

从 Sidebar 抽取：
- 按项目加载会话列表
- 创建/删除会话
- 会话切换回调
- 后台运行状态（bgVersion 驱动刷新）

### useBreakpoint

- 使用 `window.matchMedia` 监听断点变化
- 返回 `{ breakpoint: 'mobile' | 'tablet' | 'desktop', isMobile, isTablet, isDesktop }`
- 150ms debounce
- 断点值：768px、1024px

## 手机布局（MobileLayout）

### 底部导航栏（BottomNavBar）

- 固定底部，高度 56px + safe-area 间距
- 3 个 tab：对话、历史、设置
- 当前 tab 高亮（顶部色条 + 图标变色）
- 虚拟键盘弹出时自动隐藏（监听 visualViewport resize）

### 页面切换

- CSS transform 切换，对话页 DOM 不销毁（保持 SSE 连接和滚动位置）
- 切换动画 200ms 淡入淡出
- MobileLayout useState 管理当前页，不引入路由

### 对话页（MobileChatView）

- 全屏消息列表
- Header 简化：项目名 + 模型 chip
- 输入框区域共享（已有 visualViewport 适配）
- EmptyState 快捷操作改为竖向列表

### 历史页（MobileHistoryView）

- 顶部项目选择器（下拉切换）
- 会话列表垂直排列：标题 + 时间 + 运行状态
- 操作按钮始终显示（不依赖 hover）：行尾操作图标
- 点击会话 → 自动切回对话页并加载

### 设置页（MobileSettingsView）

- 项目列表（长按编辑、滑动删除）
- 添加项目按钮
- 模型选择
- 优先级最低，可后期实现

## 平板布局（TabletLayout）

- 保持桌面端侧边栏结构，改为可手势滑出的抽屉模式
- 默认折叠，全宽给主内容
- 从左边缘右滑展开（max-width 320px）
- 半透明遮罩 + 点击关闭
- 主内容区全宽

## 移动端命令面板（MobileCommandPalette）

### 触发

- textarea 输入 `/` 或 `@` 时触发（与桌面端一致）
- 弹出全屏半透明面板（从底部滑入，覆盖 85% 屏幕高度）

### 布局

- 顶部输入框（可继续编辑触发词过滤）
- 内容区可滚动列表，每行 48px（触摸友好）
- 右上角关闭按钮（触摸设备无 Escape 键）
- 点击/触摸直接选择，无需键盘导航

### 命令列表（/ 触发）

- 每行：命令图标 + 命令名 + 简短说明
- 滚动加载，无固定 maxHeight
- 点击命令 → 替换输入框中从 `/` 到光标位置的内容

### 文件选择（@ 触发）

- 扁平化目录列表（不嵌套树），页面式导航
- 面包屑导航显示当前路径
- 文件夹点击 → 进入子目录（替换列表）
- 文件点击 → 选中并关闭面板
- 取消树形缩进

### 虚拟键盘

- 面板打开时保持输入框焦点
- 面板高度自适应：`100vh - 键盘高度 - 底部间距`
- 选择完成后自动关闭面板

## 跨平台修复

以下修复同时应用于桌面端和移动端：

1. **命令选中替换逻辑**：选中命令时替换输入框中从 `/` 或 `@` 开始到光标位置的内容，而非追加。修复当前 skill 名部分输入后选中可能重叠的问题
2. **hover 按钮触摸兼容**：所有 `onMouseEnter`/`onMouseLeave` 控制的按钮，增加 `@media (hover: none)` 回退——触摸设备上始终显示
3. **Sidebar 宽度**：280px 硬编码改为响应式值

## 迁移策略

1. 创建 Hook 层（useBreakpoint、useChatSession、useProjectList、useSessionList）
2. 桌面端组件改为调用 Hook，验证功能无回归
3. 创建移动端组件（MobileLayout 及子组件）
4. 创建平板端组件（TabletLayout）
5. 修复跨平台问题（命令替换逻辑、hover 兼容）
6. 在 page.tsx 顶层加入断点切换
7. 逐步迭代优化

## 不做的事

- 不做 PWA / 离线支持
- 不做原生 App（WebView 壳）
- 不引入额外路由库（页面切换用组件状态）
- 不做横屏特殊适配
- 设置页优先级最低，后期实现
