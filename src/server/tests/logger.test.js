import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { Logger, getLogger } from '../shared/utils/logger.js';
import { env } from '../config/env.js';

test('logger utility - 1. Log Directory Creation', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goldy-logger-test-'));
  const logsDir = path.join(tempDir, 'logs');

  try {
    assert.ok(!fs.existsSync(logsDir), 'Logs directory should not exist yet');
    new Logger({ logsDir, logLevel: 'DEBUG' });
    assert.ok(fs.existsSync(logsDir), 'Logger should create logs directory automatically');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('logger utility - 2. Log File Creation and Naming', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goldy-logger-test-'));
  const logsDir = path.join(tempDir, 'logs');

  try {
    const logger = new Logger({ logsDir, logLevel: 'DEBUG' });
    logger.info('STARTUP', 'Logger test initialized');
    
    const today = new Date().toISOString().split('T')[0];
    const expectedFilename = `goldy_erp_${today}.log`;
    const logFilePath = path.join(logsDir, expectedFilename);
    
    assert.ok(fs.existsSync(logFilePath), 'Daily log file should be created');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('logger utility - 3. Formatting', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goldy-logger-test-'));
  const logsDir = path.join(tempDir, 'logs');

  try {
    const logger = new Logger({ logsDir, logLevel: 'INFO' });
    logger.info('MIGRATION', 'Migration applied successfully', { migrationId: 8 });

    const today = new Date().toISOString().split('T')[0];
    const logFilePath = path.join(logsDir, `goldy_erp_${today}.log`);
    const content = fs.readFileSync(logFilePath, 'utf8');

    // Assert format: YYYY-MM-DDTHH:MM:SS.mmmZ INFO MIGRATION Message | Context: ...
    assert.match(content, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z INFO MIGRATION Migration applied successfully/);
    assert.match(content, /Context: \{"migrationId":8\}/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('logger utility - 4. Log Levels', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goldy-logger-test-'));
  const logsDir = path.join(tempDir, 'logs');

  try {
    // Set min level to WARN
    const logger = new Logger({ logsDir, logLevel: 'WARN' });

    logger.debug('SYSTEM', 'This debug message should be filtered out');
    logger.info('SYSTEM', 'This info message should be filtered out');
    logger.warn('SYSTEM', 'This warning should be logged');
    logger.error('SYSTEM', 'This error should be logged');

    const today = new Date().toISOString().split('T')[0];
    const logFilePath = path.join(logsDir, `goldy_erp_${today}.log`);
    const content = fs.readFileSync(logFilePath, 'utf8');

    assert.ok(!content.includes('debug message'), 'Should filter out debug logs');
    assert.ok(!content.includes('info message'), 'Should filter out info logs');
    assert.ok(content.includes('WARN SYSTEM This warning should be logged'), 'Should record warnings');
    assert.ok(content.includes('ERROR SYSTEM This error should be logged'), 'Should record errors');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('logger utility - 5. Multiple Sequential Writes & Ordering', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goldy-logger-test-'));
  const logsDir = path.join(tempDir, 'logs');

  try {
    const logger = new Logger({ logsDir, logLevel: 'INFO' });

    logger.info('SYSTEM', 'First message');
    logger.info('SYSTEM', 'Second message');
    logger.info('SYSTEM', 'Third message');

    const today = new Date().toISOString().split('T')[0];
    const logFilePath = path.join(logsDir, `goldy_erp_${today}.log`);
    const content = fs.readFileSync(logFilePath, 'utf8');

    const lines = content.trim().split('\n');
    assert.strictEqual(lines.length, 3, 'There should be exactly 3 log entries');
    assert.ok(lines[0].includes('First message'), 'First entry must be First message');
    assert.ok(lines[1].includes('Second message'), 'Second entry must be Second message');
    assert.ok(lines[2].includes('Third message'), 'Third entry must be Third message');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('logger utility - 6. Failure Safety', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goldy-logger-test-'));
  const logsDir = path.join(tempDir, 'logs');

  try {
    const logger = new Logger({ logsDir, logLevel: 'INFO' });

    // Mock fs.appendFileSync to throw an error to simulate filesystem/permission write failure
    const originalAppendFileSync = fs.appendFileSync;
    fs.appendFileSync = () => {
      throw new Error('Disk space full or read-only filesystem');
    };

    try {
      // Logging should not crash the process or throw
      assert.doesNotThrow(() => {
        logger.info('BACKUP', 'This log should fallback safely without throwing');
      });
    } finally {
      fs.appendFileSync = originalAppendFileSync;
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('logger utility - 7. Singleton Behavior', () => {
  const logger1 = getLogger();
  const logger2 = getLogger();

  assert.strictEqual(logger1, logger2, 'getLogger() must return the exact same instance');
});

test('logger utility - 8. AppData Integration', () => {
  const defaultLogger = getLogger();
  const expectedPath = path.join(env.appDataPath, 'logs');

  assert.strictEqual(defaultLogger.logsDir, expectedPath, 'Logger should default to storing logs under AppData/logs');
});

test('logger utility - 9. Configurable Level Filtering Behavior', () => {
  const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
  
  for (const level of levels) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `goldy-logger-filter-${level}-`));
    const logsDir = path.join(tempDir, 'logs');
    
    try {
      const logger = new Logger({ logsDir, logLevel: level });
      logger.debug('SYSTEM', 'debug msg');
      logger.info('SYSTEM', 'info msg');
      logger.warn('SYSTEM', 'warn msg');
      logger.error('SYSTEM', 'error msg');
      
      const today = new Date().toISOString().split('T')[0];
      const logFilePath = path.join(logsDir, `goldy_erp_${today}.log`);
      const content = fs.readFileSync(logFilePath, 'utf8');
      
      if (level === 'DEBUG') {
        assert.ok(content.includes('debug msg'));
        assert.ok(content.includes('info msg'));
        assert.ok(content.includes('warn msg'));
        assert.ok(content.includes('error msg'));
      } else if (level === 'INFO') {
        assert.ok(!content.includes('debug msg'));
        assert.ok(content.includes('info msg'));
        assert.ok(content.includes('warn msg'));
        assert.ok(content.includes('error msg'));
      } else if (level === 'WARN') {
        assert.ok(!content.includes('debug msg'));
        assert.ok(!content.includes('info msg'));
        assert.ok(content.includes('warn msg'));
        assert.ok(content.includes('error msg'));
      } else if (level === 'ERROR') {
        assert.ok(!content.includes('debug msg'));
        assert.ok(!content.includes('info msg'));
        assert.ok(!content.includes('warn msg'));
        assert.ok(content.includes('error msg'));
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

test('logger utility - 10. Default Level Behavior', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goldy-logger-default-'));
  const logsDir = path.join(tempDir, 'logs');

  try {
    // Instantiate without specifying logLevel
    const logger = new Logger({ logsDir });
    assert.strictEqual(logger.logLevel, env.logLevel || 'INFO', 'Should default to configured env.logLevel');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('logger utility - 11. Invalid Level Fallback', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goldy-logger-fallback-'));
  const logsDir = path.join(tempDir, 'logs');

  try {
    // Instantiate with an invalid level
    const logger = new Logger({ logsDir, logLevel: 'INVALID_LEVEL_NAME' });
    assert.strictEqual(logger.logLevel, 'INFO', 'Should fall back to INFO on invalid level');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
