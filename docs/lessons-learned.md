# 经验总结

<!-- OVERVIEW_START -->
## 概览

### 问题分类
- **Claude CLI 集成问题**: stream-json 格式兼容性、进程管理、--resume 会话续接
- **SSE 流通信**: 重复发送、连接管理、turn_end 时序、前台/后台分发
- **命令发现系统**: 插件目录结构差异、frontmatter 解析
- **状态管理**: React 不可变更新、竞态条件、闭包过期
- **文件引用与安全**: @file/@url 内容注入、截断策略、超时控制、路径遍历防护
- **数据持久化**: 会话淘汰策略、跨项目搜索
- **后台进程管理**: 流状态保存、恢复、清理

### 关键经验
- Claude CLI 的 stream-json 格式存在新旧版本差异，需要同时兼容有/无 --include-partial-messages 的情况
- Windows 环境下 spawn 全局 npm 命令需要 shell: true
- React 状态更新必须保持不可变性，避免直接修改嵌套对象
- --resume 参数可恢复 Claude CLI 的对话上下文，但需要正确保存和传递 claudeSessionId
- 用户输入中的文件/URL 引用必须在服务端解析，不能信任客户端
- 切换上下文时不应中断进行中的异步操作，应将其"移入后台"而非取消

### 预防建议
- 始终使用防御性解析处理 JSONL 输入
- SSE 客户端管理需要考虑异常断连
- 文件系统扫描需要设置合理的缓存 TTL
- 用户可控的内容注入需要设置截断上限和超时控制
- 文件 API 必须包含路径遍历防护（拒绝 ".." 路径）
- 使用局部变量捕获当前值避免闭包引用过期
<!-- OVERVIEW_END -->

---

## Claude CLI 集成

### 1. stream-json 新旧版本兼容

- **问题描述**: Claude CLI 的 stream-json 输出格式存在新旧版本差异。旧版本（<1.0.86）不支持 --include-partial-messages，文本只在最终的 assistant 消息中出现；新版本通过 stream_event 增量发送。
- **根本原因**: Claude CLI 版本迭代导致输出格式变化，textStreamed 集合用于标记已流式发送的消息，避免在 assistant 包装器中重复发送。
- **解决方案**: 在 claude-stream.ts 中同时处理 stream_event（新版本）和 assistant 消息（旧版本回退），使用 textStreamed 集合去重。
- **预防建议**: 解析外部工具输出时，始终设计兼容层，不要假设单一格式。使用 Set 追踪已处理的消息 ID 来防止重复。

### 2. Windows 环境下 spawn Claude CLI

- **问题描述**: 在 Windows 上直接 spawn('claude', args) 无法找到 Claude CLI 可执行文件。
- **根本原因**: Windows 上 npm 全局安装的命令实际上是 .cmd 文件，需要通过 shell 来执行。
- **解决方案**: spawn 调用中添加 `shell: true` 选项。
- **预防建议**: Windows 环境下 spawn 外部命令时，始终使用 `shell: true`。在启动前通过 `claude --version` 检测 CLI 是否可用。

### 3. --print 模式下 stdin 关闭时序

- **问题描述**: AskUserQuestion 的 tool_use 事件在 turn_end 之后才被注册到 pendingHostAnswers，导致 stdin 过早关闭。
- **根本原因**: turn_end 信号在 content block 处理之前发出，而 AskUserQuestion 的 tool_use 还未注册。
- **解决方案**: 调整事件发射顺序——先处理所有 content blocks（包括 tool_use），然后再发射 turn_end 信号。这样 stdin-close handler 能看到完整的 pendingHostAnswers。
- **预防建议**: 当事件处理的时序影响资源管理（如 stdin 关闭决策）时，确保所有相关状态都已更新后再发出信号事件。

## SSE 流通信

### 4. SSE 事件重复广播

- **问题描述**: 客户端重连或新增 SSE 客户端时，已经发送过的事件可能再次发送。
- **根本原因**: addClient 函数会重播所有历史事件，但客户端断连后重新连接时可能产生重复。
- **解决方案**: 在 addClient 中使用 try-catch 包裹每个 client.send 调用，失败时自动从 clients Set 中移除。使用 event id 机制避免重复处理。
- **预防建议**: SSE 广播时始终处理发送失败的情况，自动清理断连的客户端。

### 5. fetch + ReadableStream 替代 EventSource

- **问题描述**: 使用浏览器原生 EventSource 对象接收 SSE 流时，在某些场景下不够可靠。
- **根本原因**: EventSource 自动重连机制在流式对话场景下可能导致问题（自动重连会重新订阅已结束的 run）。
- **解决方案**: 改用 fetch + ReadableStream 手动解析 SSE 格式。获取 runId 后 fetch /api/runs/{id}/events，手动解析 event: 和 data: 行。
- **预防建议**: 对于一次性流（如对话响应），fetch + ReadableStream 比 EventSource 更可控。EventSource 更适合需要自动重连的场景（如通知）。

## 命令发现系统

### 6. 插件目录结构差异

- **问题描述**: 不同 Claude 插件的目录结构不一致——有些把 skills 放在 skills/ 目录，有些放在 .claude/skills/ 目录。版本目录层级也不固定（有的是 cache/{top}/{version}/，有的是 cache/{top}/{inner}/{version}/）。
- **根本原因**: Claude 插件生态没有统一的目录规范，各插件开发者使用不同结构。
- **解决方案**: 使用递归查找（最多 4 层深度），检测目录是否包含 skills/ 或 .claude/skills/ 子目录来识别版本目录。同时扫描两种可能的 skills 目录位置。
- **预防建议**: 扫描文件系统发现内容时，不要假设固定层级结构。使用"内容检测"而非"路径模式匹配"来识别目标目录。

### 7. YAML frontmatter 解析

- **问题描述**: 需要从 SKILL.md 文件中提取 name 和 description，但不想引入完整的 YAML 解析库。
- **根本原因**: frontmatter 格式相对简单，只需要 name 和 description 两个字段。
- **解决方案**: 实现轻量级 parseFrontmatter 函数，只读取前 20 行，用正则匹配 `name:` 和 `description:` 行。
- **预防建议**: 对于简单的结构化数据提取，轻量级正则解析比引入重量级依赖更合适。但要注意处理引号包裹的值和多行值。

## 状态管理

### 8. React 不可变状态更新

- **问题描述**: 直接修改 messages 数组中的元素导致 UI 不更新。
- **根本原因**: React 依赖引用比较来检测状态变化，直接修改嵌套对象不会触发重渲染。
- **解决方案**: 使用 updateLastAssistantMessage 回调，通过 map 创建新数组，对目标消息创建新对象（展开运算符）后再修改。
- **预防建议**: 始终使用不可变模式更新 React 状态：创建新的对象/数组引用，不要直接修改现有引用。

### 9. 消息 ID 碰撞

- **问题描述**: 使用 Date.now() 生成消息 ID 时，快速连续操作可能产生相同 ID。
- **根本原因**: Date.now() 精度为毫秒级，在同一毫秒内的多次调用返回相同值。
- **解决方案**: 改用递增计数器 messageCounter 生成唯一 ID（user-0, assistant-1, user-2, ...）。
- **预防建议**: 生成唯一 ID 时避免使用 Date.now()，优先使用计数器或 UUID。

### 10. visualViewport 虚拟键盘适配

- **问题描述**: 移动端虚拟键盘弹出时，输入框被键盘遮挡。
- **根本原因**: 移动浏览器的 visualViewport 变化不会自动调整 fixed/sticky 定位元素。
- **解决方案**: 监听 visualViewport 的 resize 和 scroll 事件，动态调整输入框的 bottom 偏移量。
- **预防建议**: 移动端适配时，使用 visualViewport API 而非 window.innerHeight 来计算可视区域。

## 文件引用与安全

### 11. @file/@url 引用内容注入的截断策略

- **问题描述**: 用户通过 @file 引用大文件或 @url 引用大网页时，可能导致 prompt 过长、Claude CLI 进程卡死或超出 token 限制。
- **根本原因**: 用户可控的文件/URL 内容无上限注入到 prompt，存在资源耗尽和 token 溢出风险。
- **解决方案**: 在 resolveReferences 函数中设置 50KB 截断上限和 10s URL fetch 超时，超出时添加 `[truncated]` 标记。文件不存在时注入错误提示而非中断对话流程。
- **预防建议**: 所有用户可控的内容注入（文件、URL、数据库查询结果等）都必须设置硬性截断上限。网络请求必须设置超时。

### 12. Windows 符号链接权限与 outputFileTracing

- **问题描述**: Next.js 在 Windows 上构建时，outputFileTracing 尝试创建符号链接导致权限错误。
- **根本原因**: Next.js 的 outputFileTracing 特性在 Windows 上需要管理员权限或开发者模式来创建符号链接。
- **解决方案**: 在 next.config.mjs 中设置 `outputFileTracing: false` 禁用该特性。
- **预防建议**: Windows 环境下遇到 Next.js 构建权限问题时，优先检查 outputFileTracing 和 symlink 相关配置。

## 数据持久化

### 13. 会话淘汰策略的 LRU 思想

- **问题描述**: 用户频繁创建新会话导致磁盘上积累大量 JSON 文件，影响列表加载性能。
- **根本原因**: 会话数据没有上限控制，长期使用后文件数量无限增长。
- **解决方案**: 实现 evictOldSessions 淘汰策略——创建新会话时检查当前会话数，超出上限（默认 20）时按 updatedAt 排序删除最旧的。采用"创建时淘汰"而非"定时清理"的惰性策略。
- **预防建议**: 任何本地文件存储系统都需要设计淘汰策略。优先采用惰性淘汰（操作时检查）而非定时任务（增加复杂度）。淘汰阈值应根据实际使用场景调优。

## 后台进程管理

### 14. 切换上下文时保持异步操作活跃

- **问题描述**: 用户切换项目时，正在运行的 Claude CLI 对话被取消，导致长时间的生成任务丢失。
- **根本原因**: 原始设计在切换项目时直接调用 cancelStream() 终止所有 SSE 读取，没有考虑"保留并稍后恢复"的场景。
- **解决方案**: 引入 BackgroundRun 概念——切换项目时将活跃的 reader、messages、streamContext 打包存入 backgroundRunsRef Map。SSE 事件通过 streamContext.isBackground 标记分发到不同的更新路径。用户选择后台会话时从 Map 恢复前台。
- **预防建议**: 在任何涉及"上下文切换"的 UI 中，不要直接销毁进行中的异步操作。使用 Map/Map-like 结构暂存，提供恢复机制。通过版本号（bgVersion）触发派生状态同步。

### 15. useEffect + Ref 的版本号模式触发派生状态

- **问题描述**: backgroundRunsRef 是 Ref（不触发重渲染），但会话列表需要实时显示 running/idle 状态。
- **根本原因**: React 的 Ref 变更不会触发组件重渲染，useEffect 的依赖也无法感知 Ref 内容变化。
- **解决方案**: 使用 bgVersion 计数器（useState），每次 backgroundRunsRef 变更时 +1。在 useEffect 依赖中放入 bgVersion，在 effect 内遍历 Map 更新 sessions 状态。
- **预防建议**: 当需要在 Ref 变更时触发派生 UI 更新时，使用"版本号 + useEffect"模式。Ref 存储实际数据，版本号作为触发器。

### 16. 闭包过期与局部变量捕获

- **问题描述**: 在异步操作（如 SSE 流读取）中引用 selectedSessionId 等状态，但状态在异步过程中已变化。
- **根本原因**: React 的 useState 返回的状态值在闭包创建时被捕获，后续 setState 不会更新已创建的闭包。
- **解决方案**: 在异步操作开始前将当前状态值存入局部变量（如 activeSessionId = selectedSessionId），后续操作使用局部变量而非状态引用。
- **预防建议**: 异步操作中使用 React 状态时，在操作开始时捕获到局部变量，避免闭包引用过期。对于需要最新值的场景，使用 Ref 存储。

## 文件安全

### 17. 文件 API 的路径遍历防护

- **问题描述**: /api/files 的 dir 参数如果接受 ".."，用户可以浏览项目目录之外的文件。
- **根本原因**: API 直接将用户提供的路径拼接到 rootDir 上，没有验证路径是否在预期范围内。
- **解决方案**: 在 files/route.ts 中添加检查：`if (dir.includes('..')) return 400`。
- **预防建议**: 任何接受用户输入路径的 API 都必须包含路径遍历防护。简单检查 ".." 字符串适用于大多数场景，更严格的方案是使用 path.resolve 后检查是否在允许的根目录内。

### 18. 文件夹引用的预算截断策略

- **问题描述**: @file 引用目录时，递归扫描可能返回大量文件内容，导致 prompt 过长。
- **根本原因**: 目录下的文件数量和总大小不可预测，无上限的递归扫描会导致资源耗尽。
- **解决方案**: 实现双层限制——单文件超过 50KB 直接跳过，总内容超过 200KB 时截断当前文件并显示省略文件数。最大递归深度 5 层。
- **预防建议**: 处理用户可控的集合数据时，始终设置总预算上限和单项上限。超出预算时提供明确的截断提示（如 "N more file(s) omitted"），让用户知道有内容被省略。
