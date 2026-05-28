export interface Command {
  name: string;
  description: string;
  type: 'frontend' | 'cli';
  args?: string[];
}

export interface CommandItem {
  name: string;
  description: string;
  type: 'builtin' | 'skill' | 'command';
  source?: 'local' | 'plugin';
  plugin?: string;
}

export interface Category {
  id: string;
  name: string;
  items: CommandItem[];
}

export interface FileEntry {
  path: string;
  type: 'file' | 'directory';
}

export interface TriggerInfo {
  type: 'command' | 'file' | 'url' | null;
  query: string;
  /** Absolute position of the trigger character in the input string */
  triggerStart: number;
}

export async function fetchCommands(): Promise<Command[]> {
  const response = await fetch('/api/commands');
  if (!response.ok) {
    throw new Error(`Failed to fetch commands: ${response.status}`);
  }
  const data = await response.json();
  return data.commands as Command[];
}

export async function fetchFiles(prefix: string, cwd?: string): Promise<FileEntry[]> {
  const params = new URLSearchParams({ prefix, limit: '20' });
  if (cwd) params.set('cwd', cwd);
  const response = await fetch(`/api/files?${params}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch files: ${response.status}`);
  }
  const data = await response.json();
  return data.files as FileEntry[];
}

export function parseTrigger(
  text: string,
  cursorPos: number,
): TriggerInfo {
  if (cursorPos < 1 || cursorPos > text.length) {
    return { type: null, query: '', triggerStart: -1 };
  }

  const textBeforeCursor = text.slice(0, cursorPos);

  // Find the last trigger character (/ or @) that is at line start or after a space
  const lastNewline = textBeforeCursor.lastIndexOf('\n');
  const lineBeforeCursor = textBeforeCursor.slice(lastNewline + 1);

  // Check for / trigger at line start or after space
  const slashIndex = lineBeforeCursor.lastIndexOf('/ ');
  let slashTriggerIndex = -1;

  // / at very start of line
  if (lineBeforeCursor.startsWith('/')) {
    slashTriggerIndex = 0;
  } else {
    // / after a space
    const lastSlash = lineBeforeCursor.lastIndexOf('/');
    if (lastSlash > 0 && lineBeforeCursor[lastSlash - 1] === ' ') {
      slashTriggerIndex = lastSlash;
    }
  }

  // Check for @ trigger
  const atIndex = lineBeforeCursor.lastIndexOf('@');
  let atTriggerIndex = -1;

  if (atIndex >= 0) {
    // @ can appear anywhere, find the last one that has no space between it and cursor
    const afterAt = lineBeforeCursor.slice(atIndex + 1);
    // Only trigger if there's no space between @ and cursor (continuous word)
    if (!afterAt.includes(' ')) {
      atTriggerIndex = atIndex;
    }
  }

  // Determine which trigger is closer to cursor (takes priority)
  if (atTriggerIndex >= 0 && atTriggerIndex > slashTriggerIndex) {
    const afterAt = lineBeforeCursor.slice(atTriggerIndex + 1);
    const prefix = afterAt.toLowerCase();

    if (prefix.startsWith('file')) {
      const query = prefix.slice(4);
      return { type: 'file', query, triggerStart: lastNewline + 1 + atTriggerIndex };
    }
    if (prefix.startsWith('url')) {
      return { type: 'url', query: '', triggerStart: lastNewline + 1 + atTriggerIndex };
    }
    // Bare @ or unrecognized prefix - show file by default
    return { type: 'file', query: prefix, triggerStart: lastNewline + 1 + atTriggerIndex };
  }

  if (slashTriggerIndex >= 0) {
    const query = lineBeforeCursor.slice(slashTriggerIndex + 1);
    return { type: 'command', query, triggerStart: lastNewline + 1 + slashTriggerIndex };
  }

  return { type: null, query: '', triggerStart: -1 };
}
