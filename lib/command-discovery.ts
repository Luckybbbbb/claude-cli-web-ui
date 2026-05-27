import { readdir, readFile, stat, readFile as readFileCb } from 'fs/promises';
import { join } from 'path';
import type { Category, CommandItem } from './commands';

// ---------------------------------------------------------------------------
// Cache (5-minute TTL)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedCategories: Category[] | null = null;
let cacheTimestamp = 0;

function isCacheValid(): boolean {
  return cachedCategories !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS;
}

function setCache(categories: Category[]): void {
  cachedCategories = categories;
  cacheTimestamp = Date.now();
}

// ---------------------------------------------------------------------------
// YAML frontmatter parser
// ---------------------------------------------------------------------------

interface Frontmatter {
  name?: string;
  description?: string;
}

/**
 * Parse YAML frontmatter from the first 20 lines of a markdown file.
 * Looks for content between --- markers and extracts `name` and `description`.
 */
function parseFrontmatter(content: string): Frontmatter {
  const lines = content.split('\n').slice(0, 20);

  // Find the opening --- marker
  const startIdx = lines.findIndex((l) => l.trim() === '---');
  if (startIdx === -1) return {};

  // Find the closing --- marker after the opening one
  const endIdx = lines.findIndex((l, i) => i > startIdx && l.trim() === '---');
  if (endIdx === -1) return {};

  const yamlLines = lines.slice(startIdx + 1, endIdx);
  const result: Frontmatter = {};

  for (const line of yamlLines) {
    const nameMatch = line.match(/^name\s*:\s*(.+)$/);
    if (nameMatch) {
      result.name = nameMatch[1].trim().replace(/^['"]|['"]$/g, '');
      continue;
    }
    const descMatch = line.match(/^description\s*:\s*(.+)$/);
    if (descMatch) {
      result.description = descMatch[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// File system helpers
// ---------------------------------------------------------------------------

async function safeReaddir(dirPath: string): Promise<string[]> {
  try {
    return await readdir(dirPath);
  } catch {
    return [];
  }
}

async function safeIsDir(filePath: string): Promise<boolean> {
  try {
    const s = await stat(filePath);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function readFrontmatter(filePath: string): Promise<Frontmatter> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return parseFrontmatter(content);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Skill / command discovery helpers
// ---------------------------------------------------------------------------

/**
 * Scan a directory for skill.md / SKILL.md files in immediate subdirectories.
 * Each subdirectory may contain either `skill.md` or `SKILL.md`.
 */
async function scanSkillDir(
  baseDir: string,
): Promise<{ skillName: string; description: string; skillFile: string }[]> {
  const results: { skillName: string; description: string; skillFile: string }[] = [];

  const entries = await safeReaddir(baseDir);
  for (const entry of entries) {
    const subdir = join(baseDir, entry);
    if (!(await safeIsDir(subdir))) continue;

    // Try skill.md first, then SKILL.md
    for (const filename of ['skill.md', 'SKILL.md']) {
      const skillFile = join(subdir, filename);
      try {
        const fm = await readFrontmatter(skillFile);
        if (fm.name) {
          results.push({
            skillName: fm.name,
            description: fm.description || '',
            skillFile,
          });
          break; // Found one, skip the other
        }
      } catch {
        // File doesn't exist, try next
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Plugin name resolution
// ---------------------------------------------------------------------------

interface PluginInfo {
  /** The plugin identifier used in /plugin-name:skill-name format */
  pluginName: string;
  /** The directory containing skills/ and commands/ */
  contentDir: string;
}

/**
 * Read the plugin name from .claude-plugin/plugin.json if available,
 * otherwise fall back to the top-level directory name.
 */
async function resolvePluginName(versionDir: string, topDirName: string): Promise<string> {
  try {
    const pluginJsonPath = join(versionDir, '.claude-plugin', 'plugin.json');
    const content = await readFile(pluginJsonPath, 'utf-8');
    const parsed = JSON.parse(content);
    if (parsed.name && typeof parsed.name === 'string') {
      return parsed.name;
    }
  } catch {
    // Fall through to fallback
  }
  return topDirName;
}

/**
 * Recursively find all version directories under a plugin top-level dir.
 *
 * Actual structure on disk:
 *   cache/{top-dir}/{inner-dir}/{version}/skills/{skill}/SKILL.md
 *   cache/{top-dir}/{inner-dir}/{version}/.claude/skills/{skill}/SKILL.md  (ui-ux-pro-max)
 *
 * We walk up to 3 levels deep to find directories that contain skills/ or .claude/skills/
 * or commands/ subdirectories.
 */
async function findPluginVersionDirs(
  topDir: string,
  topDirName: string,
): Promise<PluginInfo[]> {
  const results: PluginInfo[] = [];
  const visited = new Set<string>();

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 4 || visited.has(dir)) return;
    visited.add(dir);

    const hasSkills = await safeIsDir(join(dir, 'skills'));
    const hasClaudeSkills = await safeIsDir(join(dir, '.claude', 'skills'));
    const hasCommands = await safeIsDir(join(dir, 'commands'));

    if (hasSkills || hasClaudeSkills || hasCommands) {
      const pluginName = await resolvePluginName(dir, topDirName);
      results.push({ pluginName, contentDir: dir });
      return; // Don't recurse further — this is a version dir
    }

    // Check for .in_use marker or version-like directories
    const entries = await safeReaddir(dir);
    for (const entry of entries) {
      if (entry.startsWith('.')) continue; // skip hidden dirs like .git
      const childPath = join(dir, entry);
      if (await safeIsDir(childPath)) {
        await walk(childPath, depth + 1);
      }
    }
  }

  await walk(topDir, 0);
  return results;
}

/**
 * Scan a single version directory for skills.
 * Checks both skills/ and .claude/skills/ locations.
 */
async function scanSkillsInVersionDir(
  contentDir: string,
  pluginName: string,
): Promise<CommandItem[]> {
  const items: CommandItem[] = [];
  const seen = new Set<string>();

  const skillDirs = [
    join(contentDir, 'skills'),
    join(contentDir, '.claude', 'skills'),
  ];

  for (const skillsDir of skillDirs) {
    if (!(await safeIsDir(skillsDir))) continue;

    const skillEntries = await safeReaddir(skillsDir);
    for (const skillEntry of skillEntries) {
      const skillSubdir = join(skillsDir, skillEntry);
      if (!(await safeIsDir(skillSubdir))) continue;

      // Try both case variants
      for (const filename of ['SKILL.md', 'skill.md']) {
        const skillFile = join(skillSubdir, filename);
        try {
          const fm = await readFrontmatter(skillFile);
          if (fm.name && !seen.has(fm.name)) {
            seen.add(fm.name);
            items.push({
              name: `/${pluginName}:${fm.name}`,
              description: fm.description || '',
              type: 'skill',
              source: 'plugin',
              plugin: pluginName,
            });
            break;
          }
        } catch {
          // skip
        }
      }
    }
  }

  return items;
}

/**
 * Scan a single version directory for commands.
 * Checks commands/*.md for frontmatter.
 */
async function scanCommandsInVersionDir(
  contentDir: string,
  pluginName: string,
): Promise<CommandItem[]> {
  const items: CommandItem[] = [];
  const commandsDir = join(contentDir, 'commands');

  if (!(await safeIsDir(commandsDir))) return items;

  const mdFiles = await safeReaddir(commandsDir);
  for (const mdFile of mdFiles) {
    if (!mdFile.toLowerCase().endsWith('.md')) continue;
    const mdPath = join(commandsDir, mdFile);
    try {
      const fm = await readFrontmatter(mdPath);
      // Use the frontmatter name, or derive from filename (without .md)
      const skillName = fm.name || mdFile.replace(/\.md$/i, '');
      if (skillName) {
        items.push({
          name: `/${pluginName}:${skillName}`,
          description: fm.description || '',
          type: 'command',
          source: 'plugin',
          plugin: pluginName,
        });
      }
    } catch {
      // skip
    }
  }

  return items;
}

/**
 * Scan plugin cache for skills and commands.
 * Walks the nested directory structure to find all version directories,
 * then scans each for skills/ and commands/ subdirectories.
 */
async function scanPluginSkillsAndCommands(
  pluginsCacheDir: string,
): Promise<{ pluginName: string; items: CommandItem[] }[]> {
  const results: { pluginName: string; items: CommandItem[] }[] = [];

  const topDirs = await safeReaddir(pluginsCacheDir);
  for (const topDirName of topDirs) {
    const topDirPath = join(pluginsCacheDir, topDirName);
    if (!(await safeIsDir(topDirPath))) continue;

    // Find all version directories within this plugin
    const versionDirs = await findPluginVersionDirs(topDirPath, topDirName);

    // Merge items from all version dirs, preferring the latest version
    // (version dirs are discovered in filesystem order, later = newer usually)
    const mergedItems = new Map<string, CommandItem>();

    for (const { pluginName, contentDir } of versionDirs) {
      const skills = await scanSkillsInVersionDir(contentDir, pluginName);
      const commands = await scanCommandsInVersionDir(contentDir, pluginName);

      for (const item of [...skills, ...commands]) {
        // Later versions overwrite earlier ones (dedup by item name)
        mergedItems.set(item.name, item);
      }
    }

    if (mergedItems.size > 0) {
      // Derive display name from the first plugin name found
      const pluginName = versionDirs.length > 0
        ? versionDirs[versionDirs.length - 1].pluginName
        : topDirName;

      results.push({
        pluginName,
        items: Array.from(mergedItems.values()),
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Built-in command list
// ---------------------------------------------------------------------------

interface BuiltinDef {
  name: string;
  description: string;
}

const BUILTIN_COMMANDS: BuiltinDef[] = [
  { name: '/init', description: 'Initialize a new project' },
  { name: '/review', description: 'Review the current diff for issues' },
  { name: '/security-review', description: 'Review for security vulnerabilities' },
  { name: '/run', description: 'Run a slash command or script' },
  { name: '/bughunt', description: 'Multi-agent bug sweep of the current branch' },
  { name: '/bughunt-lite', description: 'Lighter bug sweep of the current branch' },
  { name: '/deep-research', description: 'Deep research harness with cited report' },
  { name: '/plan-hunter', description: 'Exhaustive planning harness' },
  { name: '/review-branch', description: 'Thoroughly review the current branch' },
  { name: '/verify', description: 'Verify a code change works as expected' },
  { name: '/code-review', description: 'Review code diff for correctness bugs' },
  { name: '/loop', description: 'Run a command on a recurring interval' },
];

// ---------------------------------------------------------------------------
// Main discovery function
// ---------------------------------------------------------------------------

/**
 * Discover all available commands by scanning the file system and merging
 * with the hardcoded builtin list. Results are cached for 5 minutes.
 *
 * @param homeDir - User home directory (e.g. C:/Users/username or /home/user)
 */
export async function discoverAllCommands(homeDir: string): Promise<Category[]> {
  if (isCacheValid() && cachedCategories) {
    return cachedCategories;
  }

  const categories: Category[] = [];

  // 1. Built-in commands
  const builtinItems: CommandItem[] = BUILTIN_COMMANDS.map((cmd) => ({
    name: cmd.name,
    description: cmd.description,
    type: 'builtin' as const,
  }));
  categories.push({ id: 'builtin', name: 'Built-in Commands', items: builtinItems });

  const claudeDir = join(homeDir, '.claude');

  // 2. Local skills (~/.claude/skills/*/skill.md or SKILL.md)
  const localSkillsDir = join(claudeDir, 'skills');
  const localSkillResults = await scanSkillDir(localSkillsDir);
  if (localSkillResults.length > 0) {
    categories.push({
      id: 'local-skills',
      name: 'Local Skills',
      items: localSkillResults.map((s) => ({
        name: `/${s.skillName}`,
        description: s.description,
        type: 'skill' as const,
        source: 'local' as const,
      })),
    });
  }

  // 3. Plugin skills + commands (~/.claude/plugins/cache/*/)
  const pluginsCacheDir = join(claudeDir, 'plugins', 'cache');
  const pluginGroups = await scanPluginSkillsAndCommands(pluginsCacheDir);

  for (const group of pluginGroups) {
    // Derive a human-readable display name from the plugin name
    const displayName = group.pluginName
      .split(/[-_]/)
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    categories.push({
      id: `plugin-${group.pluginName}`,
      name: displayName,
      items: group.items,
    });
  }

  setCache(categories);
  return categories;
}

/**
 * Invalidate the command discovery cache, forcing a fresh scan on next call.
 */
export function invalidateCommandCache(): void {
  cachedCategories = null;
  cacheTimestamp = 0;
}
