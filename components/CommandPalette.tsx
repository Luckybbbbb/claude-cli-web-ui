'use client';

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { Command } from 'cmdk';
import {
  Command as CommandType,
  FileEntry,
  parseTrigger,
  fetchCommands,
  Category,
  CommandItem,
} from '@/lib/commands';

// Re-import FileEntry locally is not needed — it comes from commands.ts
// and is only used in the loadChildren helper below.

// ── Tree data model ──

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
  loaded?: boolean;
  expanded?: boolean;
}

// ── Props ──

interface CommandPaletteProps {
  input: string;
  cursorPos: number;
  cwd?: string;
  onSelect: (replacement: string) => void;
  onClose: () => void;
}

// ── Helpers ──

/** Fetch children for a directory via the /api/files endpoint */
async function loadChildren(dirPath: string, cwd?: string): Promise<FileEntry[]> {
  const params = new URLSearchParams();
  if (dirPath) params.set('dir', dirPath);
  if (cwd) params.set('cwd', cwd);
  const res = await fetch(`/api/files?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.files || [];
}

/** Convert FileEntry[] to TreeNode[] (directories unloaded by default) */
function entriesToNodes(entries: FileEntry[]): TreeNode[] {
  return entries.map((e) => {
    const name = e.path.includes('/')
      ? e.path.slice(e.path.lastIndexOf('/') + 1)
      : e.path;
    return {
      name,
      path: e.path,
      type: e.type,
      ...(e.type === 'directory'
        ? { children: [], loaded: false, expanded: false }
        : {}),
    };
  });
}

/** Recursively update a node in the tree, returning a new tree array */
function updateTreeNode(
  nodes: TreeNode[],
  path: string,
  patch: Partial<TreeNode>,
): TreeNode[] {
  return nodes.map((node) => {
    if (node.path === path) {
      return { ...node, ...patch };
    }
    if (node.type === 'directory' && node.children) {
      const updatedChildren = updateTreeNode(node.children, path, patch);
      if (updatedChildren !== node.children) {
        return { ...node, children: updatedChildren };
      }
    }
    return node;
  });
}

/** Flatten the visible tree into a depth-first list for keyboard navigation */
function flattenVisibleNodes(nodes: TreeNode[]): { node: TreeNode; depth: number }[] {
  const result: { node: TreeNode; depth: number }[] = [];
  function walk(list: TreeNode[], depth: number) {
    for (const n of list) {
      result.push({ node: n, depth });
      if (n.type === 'directory' && n.expanded && n.children) {
        walk(n.children, depth + 1);
      }
    }
  }
  walk(nodes, 0);
  return result;
}

// ── SVG icons (no emoji) ──

function FolderIcon({ expanded }: { expanded: boolean }) {
  return expanded ? (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" fill="#EAB308" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" fill="#CA8A04" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
        clipRule="evenodd"
        fill="var(--text-secondary)"
        fillOpacity="0.5"
      />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 150ms ease',
        color: 'var(--text-secondary)',
      }}
    >
      <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Main component ──

export function CommandPalette({
  input,
  cursorPos,
  cwd,
  onSelect,
  onClose,
}: CommandPaletteProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [legacyCommands, setLegacyCommands] = useState<CommandType[]>([]);
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([]);
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const treeContainerRef = useRef<HTMLDivElement>(null);

  const trigger = useMemo(
    () => parseTrigger(input, cursorPos),
    [input, cursorPos],
  );

  const isVisible = trigger.type !== null;

  // Whether we are using the new discover API or the legacy fallback
  const useDiscover = categories.length > 0;

  // Build a flat list of all items across categories for search filtering
  const allItems = useMemo(() => {
    const items: (CommandItem & { categoryId: string })[] = [];
    for (const cat of categories) {
      for (const item of cat.items) {
        items.push({ ...item, categoryId: cat.id });
      }
    }
    return items;
  }, [categories]);

  // Filter categories by search query
  const filteredCategories = useMemo(() => {
    if (!search) return categories;
    const q = search.toLowerCase();
    return categories
      .map((cat) => {
        const filtered = cat.items.filter(
          (item) =>
            item.name.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q),
        );
        return { ...cat, items: filtered };
      })
      .filter((cat) => cat.items.length > 0);
  }, [categories, search]);

  // Flat visible nodes for keyboard navigation
  const flatNodes = useMemo(
    () => flattenVisibleNodes(treeNodes),
    [treeNodes],
  );

  // Fetch commands using discover API, fallback to legacy
  useEffect(() => {
    if (trigger.type !== 'command') return;

    let cancelled = false;
    setSearch(trigger.query);

    setLoading(true);

    // Try the new discover API first
    fetch('/api/commands/discover')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const cats = (data.categories as Category[]) || [];
        if (cats.length > 0) {
          setCategories(cats);
          setLegacyCommands([]);
          setLoading(false);
          return;
        }
        // Empty categories -- try legacy
        return fetchCommands().then((cmds) => {
          if (!cancelled) {
            setLegacyCommands(cmds);
            setCategories([]);
            setLoading(false);
          }
        });
      })
      .catch(() => {
        if (cancelled) return;
        // Discover failed, fallback to legacy API
        fetchCommands()
          .then((cmds) => {
            if (!cancelled) {
              setLegacyCommands(cmds);
              setCategories([]);
              setLoading(false);
            }
          })
          .catch(() => {
            if (!cancelled) {
              setLegacyCommands([]);
              setCategories([]);
              setLoading(false);
            }
          });
      });

    return () => {
      cancelled = true;
    };
  }, [trigger.type, trigger.query]);

  // Load root directory when file trigger activates
  useEffect(() => {
    if (trigger.type !== 'file') return;

    let cancelled = false;
    setLoading(true);
    setFocusedIndex(0);

    loadChildren('', cwd)
      .then((entries) => {
        if (!cancelled) {
          setTreeNodes(entriesToNodes(entries));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTreeNodes([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [trigger.type, cwd]);

  // Toggle a directory node: expand/collapse with lazy loading
  const toggleDir = useCallback(
    async (node: TreeNode) => {
      if (node.type !== 'directory') return;

      // If already expanded, just collapse
      if (node.expanded) {
        setTreeNodes((prev) =>
          updateTreeNode(prev, node.path, { expanded: false }),
        );
        return;
      }

      // If children already loaded, just expand
      if (node.loaded) {
        setTreeNodes((prev) =>
          updateTreeNode(prev, node.path, { expanded: true }),
        );
        return;
      }

      // Load children
      setLoadingDirs((prev) => new Set(prev).add(node.path));

      try {
        const entries = await loadChildren(node.path, cwd);
        const children = entriesToNodes(entries);
        setTreeNodes((prev) =>
          updateTreeNode(prev, node.path, {
            children,
            loaded: true,
            expanded: true,
          }),
        );
      } catch {
        // silently fail
      } finally {
        setLoadingDirs((prev) => {
          const next = new Set(prev);
          next.delete(node.path);
          return next;
        });
      }
    },
    [cwd],
  );

  // Handle keyboard navigation for file tree
  const handleTreeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (flatNodes.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev < flatNodes.length - 1 ? prev + 1 : prev,
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const { node } = flatNodes[focusedIndex];
        // Enter confirms selection on the focused item
        onSelect(`@file ${node.path}`);
      }
    },
    [flatNodes, focusedIndex, onClose, onSelect, toggleDir],
  );

  // Handle keyboard escape for command palette
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  // Selection handler for discover items
  const handleDiscoverSelect = useCallback(
    (value: string) => {
      const item = allItems.find((i) => i.name === value);
      if (!item) return;

      let replacement = value;

      // Plugin skills/commands use /plugin-name:skill-name format
      if (item.source === 'plugin' && item.plugin) {
        // Strip leading / from item name, prepend /plugin-name:
        const skillPart = value.startsWith('/') ? value.slice(1) : value;
        replacement = `/${item.plugin}:${skillPart}`;
      }

      onSelect(replacement);
    },
    [allItems, onSelect],
  );

  // Selection handler for legacy commands
  const handleCommandSelect = useCallback(
    (value: string) => {
      const cmd = legacyCommands.find((c) => c.name === value);
      if (!cmd) return;

      let replacement = cmd.name;
      if (cmd.args && cmd.args.length > 0) {
        replacement = `${cmd.name} `;
      }

      onSelect(replacement);
    },
    [legacyCommands, onSelect],
  );

  // Scroll focused item into view
  useEffect(() => {
    if (trigger.type !== 'file' || !treeContainerRef.current) return;
    const container = treeContainerRef.current;
    const focusedEl = container.querySelector(`[data-tree-index="${focusedIndex}"]`);
    if (focusedEl) {
      focusedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex, trigger.type]);

  if (!isVisible) return null;

  // ── Render tree row ──
  const renderTreeRow = (
    node: TreeNode,
    depth: number,
    index: number,
  ) => {
    const isDir = node.type === 'directory';
    const isLoading = loadingDirs.has(node.path);
    const isFocused = index === focusedIndex;
    const isSelected = selectedPath === node.path;

    return (
      <div
        key={node.path}
        data-tree-index={index}
        role="treeitem"
        aria-expanded={isDir ? node.expanded : undefined}
        aria-selected={isSelected}
        tabIndex={isFocused ? 0 : -1}
        className="flex items-center text-sm cursor-pointer transition-colors duration-100"
        style={{
          paddingLeft: `${depth * 16 + 12}px`,
          paddingRight: '12px',
          paddingTop: '7px',
          paddingBottom: '7px',
          color: 'var(--text-primary)',
          backgroundColor: isSelected
            ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
            : isFocused
              ? 'var(--bg-secondary)'
              : 'transparent',
        }}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedPath(node.path);
          setFocusedIndex(index);
          if (isDir) {
            toggleDir(node);
          }
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
          }
          const btn = e.currentTarget.querySelector('[data-select-btn]') as HTMLElement;
          if (btn) btn.style.opacity = '1';
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
          const btn = e.currentTarget.querySelector('[data-select-btn]') as HTMLElement;
          if (btn && !isSelected) btn.style.opacity = '0';
        }}
      >
        {/* Expand chevron for directories */}
        <span style={{ width: '12px', marginRight: '4px', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {isDir && (isLoading ? (
            <span style={{ color: 'var(--text-secondary)', fontSize: '10px', lineHeight: 1 }}>...</span>
          ) : (
            <ChevronIcon expanded={!!node.expanded} />
          ))}
        </span>

        {/* Icon */}
        <span style={{ marginRight: '8px', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {isDir ? <FolderIcon expanded={!!node.expanded} /> : <FileIcon />}
        </span>

        {/* Name */}
        <span
          className="font-mono truncate"
          style={{ flex: 1, minWidth: 0 }}
        >
          {node.name}
        </span>

        {/* "Select" button — visible when selected or hovered */}
        {/* "Select" button — visible when selected or row-hovered */}
        <span
          data-select-btn
          className="shrink-0 text-xs"
          style={{
            color: '#6495ed',
            opacity: isSelected ? 1 : 0,
            marginLeft: '8px',
            padding: '2px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'opacity 100ms ease',
            border: '1px solid rgba(100, 149, 237, 0.3)',
            backgroundColor: 'rgba(100, 149, 237, 0.08)',
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(`@file ${node.path}`);
          }}
        >
          选择
        </span>
      </div>
    );
  };

  return (
    <div
      className="
        absolute bottom-full left-0 right-0
        mb-2 z-50
        rounded-xl
        overflow-hidden
      "
      style={{
        maxWidth: '100%',
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.1), 0 2px 8px rgba(0, 0, 0, 0.06)',
      }}
      onKeyDown={trigger.type === 'file' ? handleTreeKeyDown : handleKeyDown}
    >
      <Command
        label="Autocomplete suggestions"
        shouldFilter={false}
      >
        {trigger.type === 'command' && (
          <Command.List style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {loading && (
              <div
                className="px-4 py-3 text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                Loading...
              </div>
            )}

            {!loading && useDiscover && filteredCategories.length === 0 && (
              <Command.Empty>
                <div
                  className="px-4 py-3 text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  No matching commands
                </div>
              </Command.Empty>
            )}

            {!loading && useDiscover &&
              filteredCategories.map((cat) => (
                <Command.Group
                  key={cat.id}
                  heading={cat.name}
                  className="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                >
                  {cat.items.map((item) => (
                    <Command.Item
                      key={`${cat.id}-${item.name}`}
                      value={item.name}
                      onSelect={handleDiscoverSelect}
                      className="
                        flex items-center justify-between
                        px-4 py-2.5 text-sm cursor-pointer
                        transition-colors duration-100
                      "
                      style={{
                        color: 'var(--text-primary)',
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="font-mono font-medium shrink-0"
                          style={{ color: 'var(--accent)' }}
                        >
                          {item.name}
                        </span>
                        <span
                          className="truncate"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {item.description}
                        </span>
                      </div>
                      <span
                        className="ml-2 shrink-0 text-xs px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: 'var(--bg-secondary)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {item.type}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}

            {!loading && !useDiscover && (
              <>
                <Command.Empty>
                  <div
                    className="px-4 py-3 text-sm"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    No matching commands
                  </div>
                </Command.Empty>

                {legacyCommands.map((cmd) => (
                  <Command.Item
                    key={cmd.name}
                    value={cmd.name}
                    keywords={[cmd.description, cmd.type]}
                    onSelect={handleCommandSelect}
                    className="
                      flex items-center justify-between
                      px-4 py-2.5 text-sm cursor-pointer
                      transition-colors duration-100
                    "
                    style={{
                      color: 'var(--text-primary)',
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="font-mono font-medium shrink-0"
                        style={{ color: 'var(--accent)' }}
                      >
                        {cmd.name}
                      </span>
                      <span
                        className="truncate"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {cmd.description}
                      </span>
                    </div>
                    <span
                      className="ml-2 shrink-0 text-xs px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {cmd.type}
                    </span>
                  </Command.Item>
                ))}
              </>
            )}
          </Command.List>
        )}

        {trigger.type === 'file' && (
          <div
            ref={treeContainerRef}
            role="tree"
            aria-label="File browser"
            style={{
              maxHeight: '240px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {loading && treeNodes.length === 0 ? (
              <div
                className="px-4 py-3 text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                Loading files...
              </div>
            ) : treeNodes.length === 0 ? (
              <div
                className="px-4 py-3 text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                No files found
              </div>
            ) : (
              <>
                {flatNodes.map(({ node, depth }, index) =>
                  renderTreeRow(node, depth, index),
                )}
                {/* Bottom hint line */}
                <div
                  style={{
                    padding: '6px 12px',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    borderTop: '1px solid var(--border)',
                    flexShrink: 0,
                  }}
                >
                  点击选中 · 点击「选择」按钮确认 · 文件夹点击展开/折叠
                </div>
              </>
            )}
          </div>
        )}

        {trigger.type === 'url' && (
          <div
            className="px-4 py-3 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            Type a URL after @url, e.g. @url https://example.com
          </div>
        )}
      </Command>
    </div>
  );
}
