import { pino } from 'pino';
import { env } from './config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['apiKey', 'authToken', 'token', 'password', '*.apiKey', '*.authToken', '*.token'],
    censor: '[redacted]',
  },
});

/** Namespaced child logger, e.g. childLogger({ mod: 'whatsapp' }). */
export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
