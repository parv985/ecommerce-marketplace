export const logger = {
  info: (message: string): void => {
    console.log(`[INFO] ${message}`);
  },

  error: (message: string, error?: unknown): void => {
    console.error(`[ERROR] ${message}`, error ?? "");
  },

  warn: (message: string): void => {
    console.warn(`[WARN] ${message}`);
  },
};