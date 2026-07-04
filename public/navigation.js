// Global Navigation & Demo Mode manager for GOLDY AUTOMOBILE ERP
document.addEventListener('DOMContentLoaded', () => {
  // 1. Inject Styles for the two-level navigation dropdown and demo banner
  const style = document.createElement('style');
  style.innerHTML = `
    .nav-links {
      display: flex !important;
      align-items: center !important;
      gap: 16px !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .nav-links a {
      font-weight: 700 !important;
      text-decoration: none !important;
      color: #4b5563 !important;
      padding: 6px 12px !important;
      border-radius: 6px !important;
      transition: all 0.2s ease !important;
      margin-right: 0 !important;
    }
    .nav-links a:hover {
      background: #f1f5f9 !important;
      color: #0f766e !important;
    }
    .nav-links a.active {
      background: #f0fdf4 !important;
      color: #0f766e !important;
    }
    .dropdown {
      position: relative;
      display: inline-block;
    }
    .dropdown-btn {
      font-weight: 700 !important;
      background: none !important;
      border: none !important;
      color: #4b5563 !important;
      padding: 6px 12px !important;
      border-radius: 6px !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      gap: 4px !important;
      font-size: inherit !important;
      font-family: inherit !important;
      transition: all 0.2s ease !important;
    }
    .dropdown-btn:hover {
      background: #f1f5f9 !important;
      color: #0f766e !important;
    }
    .dropdown-btn.active {
      background: #f0fdf4 !important;
      color: #0f766e !important;
    }
    .dropdown-content {
      display: none;
      position: absolute;
      right: 0;
      background-color: #ffffff;
      min-width: 200px;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      z-index: 1000;
      padding: 6px 0;
      margin-top: 4px;
    }
    .dropdown-content a {
      color: #334155 !important;
      padding: 8px 16px !important;
      text-decoration: none !important;
      display: block !important;
      font-weight: 500 !important;
      font-size: 14px !important;
      transition: all 0.2s ease !important;
      text-align: left !important;
      border-radius: 0 !important;
      background: none !important;
    }
    .dropdown-content a:hover {
      background-color: #f1f5f9 !important;
      color: #0f766e !important;
    }
    .dropdown-content a.active {
      background-color: #f0fdf4 !important;
      color: #0f766e !important;
      font-weight: 700 !important;
    }
    .dropdown:hover .dropdown-content {
      display: block;
    }
    
    /* Demo Mode Banner */
    .demo-banner {
      background: linear-gradient(90deg, #b91c1c, #dc2626) !important;
      color: #ffffff !important;
      text-align: center !important;
      padding: 8px 16px !important;
      font-size: 14px !important;
      font-weight: bold !important;
      position: sticky !important;
      top: 0 !important;
      z-index: 9999 !important;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
      gap: 12px !important;
    }
    .demo-banner a {
      color: #fef08a !important;
      text-decoration: underline !important;
      cursor: pointer !important;
      margin-left: 8px !important;
      font-weight: bold !important;
    }
    .demo-banner a:hover {
      color: #fde047 !important;
    }
  `;
  document.head.appendChild(style);

  // 2. Locate existing navigation container or <nav class="nav-links">
  const navPlaceholder = document.querySelector('.nav-links');
  if (navPlaceholder) {
    const currentPath = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const resourceParam = urlParams.get('resource');

    // Define helper to check active status
    const isDashboardActive = currentPath === '/dashboard.html';
    const isJobCardsActive = currentPath === '/job-cards.html' || currentPath === '/print-job-card.html';
    const isCustomersActive = currentPath === '/masters.html' && (!resourceParam || resourceParam === 'customers');
    const isTechniciansActive = currentPath === '/technicians.html';
    const isInventoryActive = currentPath === '/inventory.html';
    const isInvoicesActive = currentPath === '/invoices.html';

    const moreActive = !isDashboardActive && !isJobCardsActive && !isCustomersActive && !isTechniciansActive && !isInventoryActive && !isInvoicesActive;

    // Create new navigation html
    let navHtml = `
      <a href="/dashboard.html" class="${isDashboardActive ? 'active' : ''}">Dashboard</a>
      <a href="/job-cards.html" class="${isJobCardsActive ? 'active' : ''}">Job Cards</a>
      <a href="/masters.html?resource=customers" class="${isCustomersActive ? 'active' : ''}">Customers</a>
      <a href="/technicians.html" class="${isTechniciansActive ? 'active' : ''}">Technicians</a>
      <a href="/inventory.html" class="${isInventoryActive ? 'active' : ''}">Inventory</a>
      <a href="/invoices.html" class="${isInvoicesActive ? 'active' : ''}">Invoices</a>
      
      <div class="dropdown">
        <button type="button" class="dropdown-btn ${moreActive ? 'active' : ''}">
          More ▾
        </button>
        <div class="dropdown-content">
          <a href="/gst-reports.html" class="${currentPath === '/gst-reports.html' ? 'active' : ''}">GST Reports</a>
          <a href="/expenses.html" class="${currentPath === '/expenses.html' ? 'active' : ''}">Expenses</a>
          <a href="/supplier-ledger.html" class="${currentPath === '/supplier-ledger.html' ? 'active' : ''}">Supplier Ledger</a>
          <a href="/service-history.html" class="${currentPath === '/service-history.html' ? 'active' : ''}">Service History</a>
          <a href="/stock-verification.html" class="${currentPath === '/stock-verification.html' ? 'active' : ''}">Stock Verification</a>
          <a href="/assets.html" class="${currentPath === '/assets.html' ? 'active' : ''}">Assets Register</a>
          <a href="/purchasing.html" class="${currentPath === '/purchasing.html' ? 'active' : ''}">Purchasing</a>
          <a href="/audit-logs.html" class="${currentPath === '/audit-logs.html' ? 'active' : ''}">Audit Logs</a>
          <a href="/tally-export.html" class="${currentPath === '/tally-export.html' ? 'active' : ''}">Tally Export</a>
          <a href="/settings.html" class="${currentPath === '/settings.html' ? 'active' : ''}">Settings</a>
        </div>
      </div>
    `;
    navPlaceholder.innerHTML = navHtml;
  }

  // 3. Fetch Demo Mode Status and render banner if active
  fetch('/api/v1/demo/status')
    .then(res => res.json())
    .then(body => {
      if (body.status === 'success' && body.data.demoMode) {
        // Prepend warning banner at the top of the page body
        const banner = document.createElement('div');
        banner.className = 'demo-banner';
        banner.innerHTML = `
          <span>⚠️ DEMO MODE ACTIVE - You are viewing test records.</span>
          <a id="demo-exit-link">Return to Production</a>
        `;
        document.body.insertBefore(banner, document.body.firstChild);

        document.getElementById('demo-exit-link')?.addEventListener('click', async (e) => {
          e.preventDefault();
          try {
            const res = await fetch('/api/v1/demo/toggle', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enable: false })
            });
            const result = await res.json();
            if (result.status === 'success') {
              window.location.reload();
            } else {
              alert('Failed to exit Demo Mode: ' + (result.error?.message || 'Unknown error'));
            }
          } catch (err) {
            alert('Failed to exit Demo Mode: ' + err.message);
          }
        });
      }
    })
    .catch(err => {
      console.warn('Failed to fetch demo status:', err);
    });
});
