import { localDate } from './local-date.js';
const token = sessionStorage.getItem('goldy_auth_token');
const message = document.querySelector('#message');

// Message display helper
function showMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? '#dc2626' : '#15803d';
}

// Check session
if (!token) {
  window.location.replace('/index.html');
} else {
  init();
}

function init() {
  // Set default dates (first day of current month to today)
  const todayStr = localDate();
  const startOfMonthStr = `${todayStr.slice(0, 7)}-01`;

  document.querySelector('#date-from').value = startOfMonthStr;
  document.querySelector('#date-to').value = todayStr;

  setupListeners();
  setupLogout();
}

function setupLogout() {
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
        console.error('Logout API failed:', err);
      }
      sessionStorage.removeItem('goldy_auth_token');
      window.location.replace('/index.html');
    });
  }
}

function setupListeners() {
  document.querySelector('#tally-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await exportTallyXml();
  });
}

async function exportTallyXml() {
  const dateFrom = document.querySelector('#date-from').value;
  const dateTo = document.querySelector('#date-to').value;
  const exportBtn = document.querySelector('#export-btn');

  if (!dateFrom || !dateTo) {
    showMessage('Please select both From and To dates.', true);
    return;
  }

  try {
    exportBtn.disabled = true;
    showMessage('Generating Tally XML...');

    const params = new URLSearchParams({
      dateFrom,
      dateTo,
    });

    const response = await fetch(`/api/v1/profit/tally-export?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      sessionStorage.removeItem('goldy_auth_token');
      window.location.replace('/index.html');
      return;
    }

    if (response.status === 403) {
      throw new Error('Access Denied: You do not have permission to export Tally data.');
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error?.message || 'Failed to generate Tally XML.');
    }

    const xmlText = await response.text();

    if (!xmlText || xmlText.trim() === '') {
      throw new Error('No data found for the selected date range.');
    }

    // Create a Blob and download it
    const blob = new Blob([xmlText], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `tally_export_${dateFrom}_to_${dateTo}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showMessage('Tally XML exported successfully.');
  } catch (err) {
    showMessage(err.message, true);
  } finally {
    exportBtn.disabled = false;
  }
}
