import path from 'node:path';
import fs from 'node:fs';

export class BackupScheduler {
  constructor(backupService) {
    if (!backupService) {
      throw new Error('BackupService is required for BackupScheduler');
    }
    this.backupService = backupService;
    this.activeTimeout = null;
    this.isExecutionLocked = false;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;

    const settings = this.backupService.getSettings();
    if (settings['backup.auto_enabled'] === true) {
      // Run startup check and then kick off scheduling
      this.activeTimeout = setTimeout(async () => {
        await this.checkAndRunCatchup();
        this.scheduleNextRun();
      }, 50); // Small boot delay to allow application initialization to complete
    }
  }

  stop() {
    this.isRunning = false;
    if (this.activeTimeout) {
      clearTimeout(this.activeTimeout);
      this.activeTimeout = null;
    }
    this.isExecutionLocked = false;
  }

  restart() {
    this.stop();
    this.start();
  }

  async checkAndRunCatchup() {
    if (this.isExecutionLocked || !this.isRunning) return;

    const settings = this.backupService.getSettings();
    if (settings['backup.missed_recovery'] !== true) return;

    const lastRun = settings['backup.last_run_at'];
    const scheduleType = settings['backup.schedule_type'];
    const intervalHours = settings['backup.interval_hours'] || 24;
    const preferredTime = settings['backup.preferred_time'] || '02:00';
    const weeklyDay = settings['backup.weekly_day'] || 'Sunday';

    const now = new Date();
    let lastRunDate = lastRun ? new Date(lastRun) : null;
    let isMissed = false;

    if (!lastRunDate) {
      // First run catch-up execution
      isMissed = true;
    } else {
      if (scheduleType === 'DAILY') {
        const [prefHour, prefMin] = preferredTime.split(':').map(Number);

        const todayScheduled = new Date(now);
        todayScheduled.setHours(prefHour, prefMin, 0, 0);

        if (now >= todayScheduled) {
          if (lastRunDate < todayScheduled) {
            isMissed = true;
          }
        } else {
          const yesterdayScheduled = new Date(todayScheduled);
          yesterdayScheduled.setDate(yesterdayScheduled.getDate() - 1);
          if (lastRunDate < yesterdayScheduled) {
            isMissed = true;
          }
        }
      } else if (scheduleType === 'WEEKLY') {
        const [prefHour, prefMin] = preferredTime.split(':').map(Number);

        const getWeeklyScheduledDate = (refDate) => {
          const daysOfWeek = [
            'Sunday',
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday',
          ];
          const targetDayIndex = daysOfWeek.indexOf(weeklyDay);
          const resDate = new Date(refDate);
          resDate.setHours(prefHour, prefMin, 0, 0);

          const currentDayIndex = resDate.getDay();
          resDate.setDate(resDate.getDate() - currentDayIndex + targetDayIndex);
          return resDate;
        };

        const thisWeekScheduled = getWeeklyScheduledDate(now);
        if (now >= thisWeekScheduled) {
          if (lastRunDate < thisWeekScheduled) {
            isMissed = true;
          }
        } else {
          const lastWeekScheduled = new Date(thisWeekScheduled);
          lastWeekScheduled.setDate(lastWeekScheduled.getDate() - 7);
          if (lastRunDate < lastWeekScheduled) {
            isMissed = true;
          }
        }
      } else if (scheduleType === 'INTERVAL') {
        const elapsedMs = now.getTime() - lastRunDate.getTime();
        const intervalMs = intervalHours * 60 * 60 * 1000;
        if (elapsedMs >= intervalMs) {
          isMissed = true;
        }
      }
    }

    if (isMissed) {
      await this.runScheduledBackup();
    }
  }

  scheduleNextRun() {
    if (this.activeTimeout) {
      clearTimeout(this.activeTimeout);
      this.activeTimeout = null;
    }
    if (!this.isRunning) return;

    const settings = this.backupService.getSettings();
    if (settings['backup.auto_enabled'] !== true) return;

    const scheduleType = settings['backup.schedule_type'];
    const intervalHours = settings['backup.interval_hours'] || 24;
    const preferredTime = settings['backup.preferred_time'] || '02:00';
    const weeklyDay = settings['backup.weekly_day'] || 'Sunday';

    const now = new Date();
    let delayMs = 0;

    if (scheduleType === 'DAILY') {
      const [prefHour, prefMin] = preferredTime.split(':').map(Number);
      const nextScheduled = new Date(now);
      nextScheduled.setHours(prefHour, prefMin, 0, 0);
      if (now >= nextScheduled) {
        nextScheduled.setDate(nextScheduled.getDate() + 1);
      }
      delayMs = nextScheduled.getTime() - now.getTime();
    } else if (scheduleType === 'WEEKLY') {
      const [prefHour, prefMin] = preferredTime.split(':').map(Number);
      const daysOfWeek = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      const targetDayIndex = daysOfWeek.indexOf(weeklyDay);

      const nextScheduled = new Date(now);
      nextScheduled.setHours(prefHour, prefMin, 0, 0);
      const currentDayIndex = nextScheduled.getDay();
      nextScheduled.setDate(nextScheduled.getDate() - currentDayIndex + targetDayIndex);

      if (now >= nextScheduled) {
        nextScheduled.setDate(nextScheduled.getDate() + 7);
      }
      delayMs = nextScheduled.getTime() - now.getTime();
    } else if (scheduleType === 'INTERVAL') {
      const lastRun = settings['backup.last_run_at'];
      const lastRunDate = lastRun ? new Date(lastRun) : null;
      if (!lastRunDate) {
        delayMs = 0;
      } else {
        const intervalMs = intervalHours * 60 * 60 * 1000;
        const nextRunTime = lastRunDate.getTime() + intervalMs;
        delayMs = nextRunTime - now.getTime();
        if (delayMs < 0) delayMs = 0;
      }
    }

    this.activeTimeout = setTimeout(async () => {
      await this.runScheduledBackup();
      this.scheduleNextRun();
    }, delayMs);
  }

  async runScheduledBackup() {
    const dbPath = this.backupService.db.name;
    if (dbPath && dbPath !== ':memory:') {
      const lockFilePath = path.join(path.dirname(dbPath), 'restore.lock');
      if (fs.existsSync(lockFilePath)) {
        console.warn('Backup scheduler execution blocked by active restore.lock file');
        return;
      }
    }

    if (this.isExecutionLocked) {
      console.warn('Backup execution locked: skipping scheduled backup execution');
      return;
    }

    this.isExecutionLocked = true;
    try {
      const now = new Date().toISOString();
      await this.backupService.backupDatabase({ type: 'AUTO' });
      this.backupService.recordSuccessfulRun(now);
    } catch (err) {
      console.error('Automated backup scheduled run failed:', err.message);
    } finally {
      this.isExecutionLocked = false;
    }
  }
}
