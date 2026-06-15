type Level = 'info' | 'warn' | 'error';

function log(level: Level, message: string, ...rest: unknown[]): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase()}] ${message}`;
  if (level === 'error') console.error(line, ...rest);
  else if (level === 'warn') console.warn(line, ...rest);
  else console.log(line, ...rest);
}

export const logger = {
  info: (message: string, ...rest: unknown[]) => log('info', message, ...rest),
  warn: (message: string, ...rest: unknown[]) => log('warn', message, ...rest),
  error: (message: string, ...rest: unknown[]) => log('error', message, ...rest),
};
