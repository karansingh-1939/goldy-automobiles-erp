document.addEventListener('DOMContentLoaded', () => {
  const token = sessionStorage.getItem('goldy_auth_token');
  if (!token) {
    window.location.replace('/index.html');
    return;
  }

  // Bind logout listener
  const logoutBtn = document.querySelector('#logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        // Best-effort cleanup; preserve the original operation result.
      }
      sessionStorage.removeItem('goldy_auth_token');
      window.location.replace('/index.html');
    });
  }

  // Elements
  const autoEnabledCheckbox = document.getElementById('auto_enabled');
  const schedulerConfigFields = document.getElementById('scheduler-config-fields');
  const scheduleTypeSelect = document.getElementById('schedule_type');
  const preferredTimeGroup = document.getElementById('preferred-time-group');
  const weeklyDayGroup = document.getElementById('weekly-day-group');
  const intervalHoursGroup = document.getElementById('interval-hours-group');
  const backupsList = document.getElementById('backups-list');

  // Banner message helper
  const banner = document.getElementById('message-banner');
  const bannerText = document.getElementById('message-text');
  document.getElementById('dismiss-message-btn').addEventListener('click', () => {
    banner.style.display = 'none';
  });

  function showBanner(text, type = 'success') {
    bannerText.textContent = text;
    banner.className = type === 'success' ? 'success' : 'error';
    banner.style.display = 'flex';
    // Auto scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Handle schedule type select layout updates
  function updateScheduleTypeFields() {
    const selectedType = scheduleTypeSelect.value;
    preferredTimeGroup.style.display =
      selectedType === 'DAILY' || selectedType === 'WEEKLY' ? 'block' : 'none';
    weeklyDayGroup.style.display = selectedType === 'WEEKLY' ? 'block' : 'none';
    intervalHoursGroup.style.display = selectedType === 'INTERVAL' ? 'block' : 'none';
  }

  scheduleTypeSelect.addEventListener('change', updateScheduleTypeFields);

  autoEnabledCheckbox.addEventListener('change', () => {
    schedulerConfigFields.style.display = autoEnabledCheckbox.checked ? 'block' : 'none';
  });

  // Fetch Configurations
  async function loadSettings() {
    try {
      const res = await fetch('/api/v1/backups/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json();
      if (res.ok && payload.status === 'success') {
        const data = payload.data;
        autoEnabledCheckbox.checked = data['backup.auto_enabled'] === true;
        schedulerConfigFields.style.display = autoEnabledCheckbox.checked ? 'block' : 'none';
        scheduleTypeSelect.value = data['backup.schedule_type'] || 'DAILY';
        document.getElementById('preferred_time').value = data['backup.preferred_time'] || '02:00';
        document.getElementById('weekly_day').value = data['backup.weekly_day'] || 'Sunday';
        document.getElementById('interval_hours').value = data['backup.interval_hours'] || 24;
        document.getElementById('retention_count').value = data['backup.retention_count'] || 7;
        document.getElementById('missed_recovery').checked =
          data['backup.missed_recovery'] === true;

        updateScheduleTypeFields();
      } else {
        showBanner('Failed to load scheduler configurations.', 'error');
      }
    } catch (err) {
      showBanner('Failed to contact server for configurations: ' + err.message, 'error');
    }
  }

  // Load Backup Logs
  async function loadBackupLogs() {
    try {
      const res = await fetch('/api/v1/backups', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json();
      if (res.ok) {
        const data = payload.data;
        if (!data || data.length === 0) {
          backupsList.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #64748b;">No backup logs found in registry.</td></tr>`;
          return;
        }

        backupsList.innerHTML = '';
        data.forEach((log) => {
          const size = log.file_size !== null ? `${(log.file_size / 1024).toFixed(2)} KB` : 'N/A';
          let badgeClass = 'pending';
          if (log.status === 'SUCCESS') badgeClass = 'success';
          else if (log.status === 'FAILED') badgeClass = 'danger';

          const row = document.createElement('tr');
          row.innerHTML = `
            <td><strong>${log.filename}</strong></td>
            <td>${log.type}</td>
            <td>${size}</td>
            <td>${new Date(log.created_at).toLocaleString()}</td>
            <td><span class="badge ${badgeClass}">${log.status}</span></td>
          `;
          backupsList.appendChild(row);
        });
      }
    } catch (err) {
      showBanner('Failed to load backup history: ' + err.message, 'error');
    }
  }

  // Update Configurations Form Submit
  const schedulerForm = document.getElementById('scheduler-form');
  schedulerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('save-settings-btn');
    btn.disabled = true;

    const settings = {
      'backup.auto_enabled': autoEnabledCheckbox.checked,
      'backup.schedule_type': scheduleTypeSelect.value,
      'backup.preferred_time': document.getElementById('preferred_time').value,
      'backup.weekly_day': document.getElementById('weekly_day').value,
      'backup.interval_hours': parseInt(document.getElementById('interval_hours').value, 10),
      'backup.retention_count': parseInt(document.getElementById('retention_count').value, 10),
      'backup.missed_recovery': document.getElementById('missed_recovery').checked,
    };

    try {
      const res = await fetch('/api/v1/backups/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
      });
      const payload = await res.json();
      if (res.ok && payload.status === 'success') {
        showBanner('Backup configurations updated and scheduler restarted successfully.');
        loadSettings();
      } else {
        showBanner(payload.message || 'Failed to save configurations.', 'error');
      }
    } catch (err) {
      showBanner('Failed to save settings: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // Manual Backup Now Button
  const backupNowBtn = document.getElementById('backup-now-btn');
  backupNowBtn.addEventListener('click', async () => {
    backupNowBtn.disabled = true;
    showBanner('Backup job in progress, please wait...', 'pending');
    try {
      const res = await fetch('/api/v1/backups/manual', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json();
      if (res.ok) {
        showBanner(`Backup created successfully: ${payload.data.filename}`);
        loadBackupLogs();
      } else {
        showBanner(payload.message || 'Manual backup failed.', 'error');
      }
    } catch (err) {
      showBanner('Manual backup request failed: ' + err.message, 'error');
    } finally {
      backupNowBtn.disabled = false;
    }
  });

  // Database Restore Flow
  const restoreFileInput = document.getElementById('restore-file-input');
  const restoreModal = document.getElementById('restore-modal');
  const cancelRestoreBtn = document.getElementById('cancel-restore-btn');
  const confirmRestoreBtn = document.getElementById('confirm-restore-btn');
  let selectedRestoreFile = null;

  restoreFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      selectedRestoreFile = e.target.files[0];
      restoreModal.classList.add('active');
    }
  });

  cancelRestoreBtn.addEventListener('click', () => {
    restoreModal.classList.remove('active');
    restoreFileInput.value = '';
    selectedRestoreFile = null;
  });

  confirmRestoreBtn.addEventListener('click', async () => {
    if (!selectedRestoreFile) return;
    restoreModal.classList.remove('active');
    showBanner(
      'Initiating database restoration. Performing emergency pre-restore backup, please wait...',
      'pending',
    );

    try {
      const res = await fetch('/api/v1/backups/restore/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          Authorization: `Bearer ${token}`,
        },
        body: selectedRestoreFile,
      });
      const payload = await res.json();
      if (res.ok && payload.status === 'success') {
        showBanner('Database restored successfully! Active connection has been refreshed.');
        loadBackupLogs();
      } else {
        showBanner(payload.message || 'Database restoration failed.', 'error');
      }
    } catch (err) {
      showBanner('Restoration failed: ' + err.message, 'error');
    } finally {
      restoreFileInput.value = '';
      selectedRestoreFile = null;
    }
  });

  // Restore Latest Backup Flow
  const restoreLatestBtn = document.getElementById('restore-latest-btn');
  if (restoreLatestBtn) {
    restoreLatestBtn.addEventListener('click', async () => {
      const confirmed = confirm(
        'Are you sure you want to restore the latest backup? All changes made after the backup will be lost. The system will restart and refresh automatically after completion.',
      );
      if (!confirmed) return;

      restoreLatestBtn.disabled = true;
      showBanner(
        'Initiating database restoration from the latest backup, please wait...',
        'pending',
      );

      try {
        const res = await fetch('/api/v1/backups/restore-latest', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        const payload = await res.json();
        if (res.ok && payload.status === 'success') {
          showBanner('Latest backup restored successfully! Reloading...');
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } else {
          showBanner(payload.message || 'Failed to restore latest backup.', 'error');
          restoreLatestBtn.disabled = false;
        }
      } catch (err) {
        showBanner('Restore latest backup failed: ' + err.message, 'error');
        restoreLatestBtn.disabled = false;
      }
    });
  }

  // Init
  loadSettings();
  loadBackupLogs();
});
