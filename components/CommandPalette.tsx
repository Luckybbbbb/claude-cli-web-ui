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
  fetchFiles,
  Category,
  CommandItem,
} from '@/lib/commands';

interface CommandPaletteProps {
  input: string;
  cursorPos: number;
  cwd?: string;
  onSelect: (replacement: string) => void;
  onClose: () => void;
}

export function CommandPalette({
  input,
  cursorPos,
  cwd,
  onSelect,
  onClose,
}: CommandPaletteProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [legacyCommands, setLegacyCommands] = useState<CommandType[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Fetch files with debounce when trigger type is 'file'
  useEffect(() => {
    if (trigger.type !== 'file') return;

    setSearch(trigger.query);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      let cancelled = false;

      fetchFiles(trigger.query, cwd)
        .then((entries) => {
          if (!cancelled) {
            setFiles(entries);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setFiles([]);
            setLoading(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }, 150);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [trigger.type, trigger.query]);

  // Handle keyboard escape
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
      // value is the item name, e.g. "/help" or "/brainstorming"
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

  const handleFileSelect = useCallback(
    (value: string) => {
      onSelect(`@file ${value}`);
    },
    [onSelect],
  );

  if (!isVisible) return null;

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
      onKeyDown={handleKeyDown}
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
          <div className="max-h-[240px] overflow-y-auto">
            {loading && files.length === 0 ? (
              <div
                className="px-4 py-3 text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                Loading files...
              </div>
            ) : files.length === 0 ? (
              <div
                className="px-4 py-3 text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                {search ? `No files matching "${search}"` : 'No files found'}
              </div>
            ) : (
              files.map((entry) => (
                <div
                  key={entry.path}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm cursor-pointer transition-colors duration-100"
                  style={{ color: 'var(--text-primary)' }}
                  onClick={() => handleFileSelect(entry.path)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <span className="shrink-0">
                    {entry.type === 'directory' ? (
                      <svg
                        className="w-4 h-4 text-yellow-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                      </svg>
                    ) : (
                      <svg
                        className="w-4 h-4 text-gray-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </span>
                  <span className="font-mono text-sm truncate">
                    {entry.path}
                  </span>
                </div>
              ))
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
