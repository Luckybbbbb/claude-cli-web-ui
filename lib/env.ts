export function getEnvConfig() {
  return {
    claudeBin: process.env.CLAUDE_BIN || 'claude',
    defaultModel: process.env.DEFAULT_MODEL || 'claude-sonnet-4-6',
    defaultCwd: process.env.DEFAULT_CWD || process.cwd(),
    port: parseInt(process.env.PORT || '0', 10) || 0,
  };
}
