# 命令发现系统

<!-- OVERVIEW_START -->
## 概览

### 核心概念
- **动态命令发现**: 扫描文件系统获取 Claude CLI 可用的 slash commands 和 skills
- **三级发现源**: 内置命令（硬编码） -> 本地 Skills（~/.claude/skills/） -> Plugin Skills/Commands（~/.claude/plugins/cache/）
- **YAML frontmatter 解析**: 从 SKILL.md 的 --- 分隔区域提取 name 和 description

### 关键数据结构
- `Category { id, name, items: CommandItem[] }`: 命令分组（如 Built-in / Local Skills / Plugin Name）
- `CommandItem { name, description, type, source?, plugin? }`: 单个命令项
- 缓存: `cachedCategories: Category[] | null` + `cacheTimestamp: number`（5 分钟 TTL）

### 核心流程
- **发现流程**: discoverAllCommands(homeDir) -> 扫描三个来源 -> 合并为 Category[] -> 缓存
- **Plugin 扫描流程**: 递归查找版本目录 -> 检测 skills/ 或 .claude/skills/ 子目录 -> 解析 SKILL.md frontmatter -> 去重

### 与其他系统的交互
- **命令面板**: CommandPalette 通过 GET /api/commands/discover 获取 Category[]
- **触发解析**: parseTrigger() 解析输入中的 / 和 @ 字符，决定是否弹出面板
<!-- OVERVIEW_END -->

---

## 详解

### 发现源

#### 1. 内置命令

硬编码在 `BUILTIN_COMMANDS` 数组中，包含 12 个常用命令：

```
/init, /review, /security-review, /run, /bughunt, /bughunt-lite,
/deep-research, /plan-hunter, /review-branch, /verify, /code-review, /loop
```

#### 2. 本地 Skills

扫描 `~/.claude/skills/` 目录：

```
~/.claude/skills/
  my-skill/
    SKILL.md (或 skill.md)  -- 包含 YAML frontmatter
  another-skill/
    SKILL.md
```

每个子目录被视为一个 skill，从 SKILL.md 的 frontmatter 提取：
- `name`: 命令名称（必须存在才会被收录）
- `description`: 命令描述

命令格式：`/{name}`，type: 'skill'，source: 'local'

#### 3. Plugin Skills/Commands

扫描 `~/.claude/plugins/cache/` 目录，结构因插件而异：

```
cache/
  plugin-name/
    version/
      skills/
        skill-a/SKILL.md
        skill-b/SKILL.md
      commands/
        cmd-a.md
        cmd-b.md
    或
    .claude/
      skills/
        skill-c/SKILL.md
```

**关键挑战**: 不同插件的目录层级不一致。

**解决方案**: 使用 `findPluginVersionDirs()` 递归查找（最多 4 层），通过检测 skills/ 或 .claude/skills/ 子目录来识别"版本目录"。

**插件名解析**: 优先从 `.claude-plugin/plugin.json` 的 `name` 字段读取，回退到顶层目录名。

**命令格式**: `/plugin-name:skill-name`，type: 'skill' 或 'command'，source: 'plugin'

### 缓存机制

```typescript
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

// 检查缓存
if (isCacheValid() && cachedCategories) {
  return cachedCategories;
}

// 设置缓存
setCache(categories);

// 强制刷新
invalidateCommandCache();
```

### 触发解析 (parseTrigger)

解析输入文本和光标位置，判断是否应该弹出命令面板：

- `/` 在行首或空格后 -> `type: 'command'`，query 为 / 后的文本
- `@` 后跟连续文本 -> `type: 'file'`（或 `type: 'url'` 如果以 `@url` 开头）

### API 端点

- `GET /api/commands/discover`: 调用 `discoverAllCommands(homedir())`，返回 `{ categories: Category[] }`
- `GET /api/commands`: 静态命令列表（回退方案）
