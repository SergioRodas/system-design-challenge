/**
 * Minimal logger wrapper. Centralising this means production code never calls
 * console.* directly, and the sink can be swapped (e.g. for a structured
 * logger) without touching call sites.
 */
export const logger = {
  info: (msg: string): void => {
    process.stdout.write(`[info] ${msg}\n`);
  },
  error: (msg: string): void => {
    process.stderr.write(`[error] ${msg}\n`);
  },
};
