import pino from 'pino';
import { config } from '../config/index.js';
import { localISOString } from './date.js';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (config.server.nodeEnv === 'production' ? 'info' : 'debug'),
  timestamp: () => `,"time":"${localISOString()}"`,
  transport:
    config.server.nodeEnv !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
});
