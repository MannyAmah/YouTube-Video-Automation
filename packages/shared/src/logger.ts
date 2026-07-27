import pino, { Logger } from 'pino';

/**
 * Structured JSON logging. Every pipeline log line carries runId/step/jobId
 * via child loggers. Secrets never enter logs: redaction paths cover the
 * places tokens could plausibly appear.
 */

export function createLogger(service: string): Logger {
  return pino({
    name: service,
    level: process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.refreshToken',
        '*.accessToken',
        '*.access_token',
        '*.refresh_token',
        '*.apiKey',
        '*.api_key',
        '*.password',
        '*.clientSecret',
        '*.client_secret',
      ],
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export type { Logger };
