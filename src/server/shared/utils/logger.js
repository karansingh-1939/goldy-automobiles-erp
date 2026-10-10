import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env.js';

export class Logger {
  /**
   * @param {object} options - Options containing logsDir and logLevel
   */
  constructor({ logsDir, logLevel } = {}) {
    this.logsDir = logsDir || path.join(env.appDataPath, 'logs');

    let resolvedLevel = (logLevel || env.logLevel || 'INFO').toUpperCase();
    const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    if (!validLevels.includes(resolvedLevel)) {
      resolvedLevel = 'INFO';
    }
    this.logLevel = resolvedLevel;

    this.levels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
    };

    // Ensure logs directory exists automatically
    try {
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }
    } catch (err) {
      console.error(`Failed to create logs directory at ${this.logsDir}:`, err.message);
    }
  }

  /**
   * Logs a message to stdout/stderr and appends synchronously to the log file.
   * Safe against filesystem locks or errors.
   */
  log(level, category, message, context = null) {
    const targetLevel = (level || 'INFO').toUpperCase();
    const currentVal = this.levels[targetLevel] !== undefined ? this.levels[targetLevel] : 1;
    const minVal = this.levels[this.logLevel] !== undefined ? this.levels[this.logLevel] : 1;

    // Filter by log level
    if (currentVal < minVal) {
      return;
    }

    const timestamp = new Date().toISOString();
    const formattedCategory = (category || 'SYSTEM').toUpperCase();

    let formattedMessage = `${timestamp} ${targetLevel} ${formattedCategory} ${message}`;
    if (context) {
      if (context instanceof Error) {
        formattedMessage += ` | Error: ${context.message} \nStack: ${context.stack}`;
      } else {
        formattedMessage += ` | Context: ${JSON.stringify(context)}`;
      }
    }
    formattedMessage += '\n';

    // Fallback console log for operations visibility
    if (targetLevel === 'ERROR') {
      console.error(formattedMessage.trim());
    } else {
      console.log(formattedMessage.trim());
    }

    // Safely write to daily log file using appendFileSync to prevent async race conditions
    const today = new Date().toISOString().split('T')[0];
    const filename = `goldy_erp_${today}.log`;
    const logFilePath = path.join(this.logsDir, filename);

    try {
      fs.appendFileSync(logFilePath, formattedMessage, 'utf8');
    } catch (err) {
      console.error('Logger append write failed:', err.message);
    }
  }

  debug(category, message, context = null) {
    this.log('DEBUG', category, message, context);
  }

  info(category, message, context = null) {
    this.log('INFO', category, message, context);
  }

  warn(category, message, context = null) {
    this.log('WARN', category, message, context);
  }

  error(category, message, context = null) {
    this.log('ERROR', category, message, context);
  }

  /**
   * Hook for future log rotation support
   */
  onRotateHook() {
    // To be implemented in step 2
  }

  /**
   * Safe close method for compatibility
   */
  close() {
    // Synchronous write does not hold persistent streams
  }
}

let defaultLoggerInstance = null;

export function getLogger() {
  if (!defaultLoggerInstance) {
    defaultLoggerInstance = new Logger();
  }
  return defaultLoggerInstance;
}
