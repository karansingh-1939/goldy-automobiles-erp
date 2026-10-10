import { localDate } from '../../../../public/local-date.js';
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/api-client.js';
import { useAppStore } from '../../shared/store/use-app-store.js';

import { Calendar, Download, Printer, FileSpreadsheet, BookOpen, AlertCircle } from 'lucide-react';

export default function ReportsManager() {
  const addNotification = useAppStore((state) => state.addNotification);

  // States
  const [activeTab, setActiveTab] = useState('tax');
  const [reportType, setReportType] = useState('tb'); // tb (Trial Balance), pl (Profit & Loss), bs (Balance Sheet)

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return localDate(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [endDate, setEndDate] = useState(() => localDate());
  const [asOfDate, setAsOfDate] = useState(() => localDate());

  // ==========================================
  // QUERY 1: GST Summaries & GSTR-1
  // ==========================================
  const {
    data: gstResponse,
    isLoading: gstLoading,
    error: gstError,
  } = useQuery({
    queryKey: ['gst-summary', startDate, endDate],
    queryFn: () => api.get(`/api/v1/gst/summary?dateFrom=${startDate}&dateTo=${endDate}`),
    enabled: activeTab === 'tax',
  });

  const {
    data: gstr1Response,
    isLoading: gstr1Loading,
    error: gstr1Error,
  } = useQuery({
    queryKey: ['gstr1-details', startDate, endDate],
    queryFn: () => api.get(`/api/v1/gst/gstr1?dateFrom=${startDate}&dateTo=${endDate}`),
    enabled: activeTab === 'tax',
  });

  const gst = gstResponse?.data || {
    invoiceCount: 0,
    taxableValue: 0,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 0,
    totalTax: 0,
  };
  const gstr1 = gstr1Response?.data || [];

  // ==========================================
  // QUERY 2: Accounting Reports (TB, P&L, BS)
  // ==========================================
  const {
    data: tbResponse,
    isLoading: tbLoading,
    error: tbError,
  } = useQuery({
    queryKey: ['report-trial-balance', asOfDate],
    queryFn: () => api.get(`/api/v1/accounting/reports/trial-balance?asOfDate=${asOfDate}`),
    enabled: activeTab === 'accounting' && reportType === 'tb',
  });

  const {
    data: plResponse,
    isLoading: plLoading,
    error: plError,
  } = useQuery({
    queryKey: ['report-profit-loss', startDate, endDate],
    queryFn: () =>
      api.get(`/api/v1/accounting/reports/profit-loss?startDate=${startDate}&endDate=${endDate}`),
    enabled: activeTab === 'accounting' && reportType === 'pl',
  });

  const {
    data: bsResponse,
    isLoading: bsLoading,
    error: bsError,
  } = useQuery({
    queryKey: ['report-balance-sheet', asOfDate],
    queryFn: () => api.get(`/api/v1/accounting/reports/balance-sheet?asOfDate=${asOfDate}`),
    enabled: activeTab === 'accounting' && reportType === 'bs',
  });

  const trialBalance = tbResponse?.data || { ledgers: [], totals: { debits: 0, credits: 0 } };
  const profitLoss = plResponse?.data || {
    revenue: { items: [], total: 0 },
    costOfGoodsSold: 0,
    grossProfit: 0,
    expenses: { items: [], total: 0 },
    netProfit: 0,
  };
  const balanceSheet = bsResponse?.data || {
    assets: { items: [], total: 0 },
    liabilities: { items: [], total: 0 },
    equity: { items: [], total: 0 },
    totals: { isBalanced: true },
  };
  const reportError =
    activeTab === 'tax'
      ? gstError || gstr1Error
      : reportType === 'tb'
        ? tbError
        : reportType === 'pl'
          ? plError
          : bsError;
  const reportLoading =
    activeTab === 'tax'
      ? gstLoading || gstr1Loading
      : reportType === 'tb'
        ? tbLoading
        : reportType === 'pl'
          ? plLoading
          : bsLoading;

  // ==========================================
  // EXPORT UTILITIES (CSV)
  // ==========================================
  const handleExportCsv = (filename, headers, rows) => {
    try {
      const csvContent =
        '\uFEFF' +
        [
          ['Company name', 'Goldy Automobiles Workshop ERP'],
          ['Report title', filename.replace(/_/g, ' ')],
          ['Generated at', new Date().toLocaleString()],
          [],
          headers,
          ...rows,
        ]
          .map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(','))
          .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}_${localDate()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      addNotification('CSV report downloaded.', 'success');
    } catch (err) {
      addNotification('Failed to generate CSV export.', 'error');
    }
  };

  const handleExportTally = async () => {
    try {
      const blob = await api.get(
        `/api/v1/profit/tally-export?type=all&dateFrom=${startDate}&dateTo=${endDate}`,
        { responseType: 'blob' },
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Tally_Import_${startDate}_to_${endDate}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      addNotification('Tally Prime XML exported.', 'success');
    } catch (err) {
      addNotification(err.message || 'Failed to export Tally XML.', 'error');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Dynamic style block to strip layout margins and sidebar panels during print */}
      <style>{`
        @media print {
          aside, nav, header, button, .no-print {
            display: none !important;
          }
          main, .print-container {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }
          body {
            background-color: white !important;
            color: black !important;
          }
        }
      `}</style>

      {/* Header section */}
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Reporting & Compliance Hub
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Generate statements, file tax returns, audit ledger balances, and download Tally XML
            sheets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={Boolean(reportError) || reportLoading}
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            Print Report
          </button>
        </div>
      </div>

      {reportError && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {reportError.message}
        </p>
      )}

      {/* Tabs list bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 gap-6 no-print">
        <button
          onClick={() => setActiveTab('tax')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'tax'
              ? 'border-brand-600 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-gray-450 hover:text-gray-950 dark:hover:text-white'
          }`}
        >
          <FileSpreadsheet className="h-4.5 w-4.5" />
          Tax & Compliance
        </button>
        <button
          onClick={() => setActiveTab('accounting')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'accounting'
              ? 'border-brand-600 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-gray-450 hover:text-gray-950 dark:hover:text-white'
          }`}
        >
          <BookOpen className="h-4.5 w-4.5" />
          Financial Statements
        </button>
      </div>

      {/* Dynamic Date Filter toolbar */}
      <div className="flex items-center gap-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 rounded-xl shadow-sm no-print">
        {activeTab === 'accounting' && (reportType === 'tb' || reportType === 'bs') ? (
          <>
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-400">
              <Calendar className="h-4 w-4 text-brand-600" />
              <span>Statement Date:</span>
            </div>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white px-3 py-1 text-xs focus-ring"
            />
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-400">
              <Calendar className="h-4 w-4 text-brand-600" />
              <span>Reporting Period:</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white px-3 py-1 text-xs focus-ring"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white px-3 py-1 text-xs focus-ring"
              />
            </div>
          </>
        )}

        {activeTab === 'tax' && (
          <button
            onClick={handleExportTally}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export Tally Prime XML
          </button>
        )}
      </div>

      {/* PRINT-FRIENDLY COMPANY LOGO HEADER (rendered only during print layouts) */}
      <div className="hidden print:block border-b border-gray-450 pb-4 mb-6">
        <h2 className="text-xl font-bold">Goldy Automobiles Workshop ERP</h2>
        <p className="text-xs text-gray-500">Automated Accounting & Operations Ledger Statement</p>
        <p className="text-xs text-gray-500">Date Compiled: {new Date().toLocaleString()}</p>
      </div>

      {/* TAB CONTAINER 1: Compliance & GSTR-1 */}
      {activeTab === 'tax' && (
        <div className="space-y-6 print-container">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 no-print">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase">Taxable Turn-over</p>
              <p className="text-xl font-bold text-gray-950 dark:text-white mt-1">
                ₹{gst.taxableValue?.toLocaleString('en-IN') || '0.00'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase">CGST Collected</p>
              <p className="text-xl font-bold text-gray-950 dark:text-white mt-1">
                ₹{gst.cgstAmount?.toLocaleString('en-IN') || '0.00'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase">SGST Collected</p>
              <p className="text-xl font-bold text-gray-950 dark:text-white mt-1">
                ₹{gst.sgstAmount?.toLocaleString('en-IN') || '0.00'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm bg-gradient-to-br from-brand-50 to-white dark:from-brand-950/20 dark:to-gray-900">
              <p className="text-xs font-bold text-brand-600 dark:text-brand-400 uppercase">
                Total GST Liabilities
              </p>
              <p className="text-xl font-black text-brand-600 dark:text-brand-400 mt-1">
                ₹{gst.totalTax?.toLocaleString('en-IN') || '0.00'}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-brand-600" />
                <h2 className="text-base font-bold text-gray-900 dark:text-white">
                  GSTR-1 Outward Supplies Details
                </h2>
              </div>
              <button
                disabled={Boolean(reportError) || reportLoading}
                onClick={() =>
                  handleExportCsv(
                    'GSTR1_Outward_Supplies',
                    [
                      'Document Type',
                      'Original Invoice',
                      'Document No',
                      'Customer Name',
                      'GSTIN',
                      'Taxable Value',
                      'CGST',
                      'SGST',
                      'IGST',
                      'Line Total',
                    ],
                    gstr1.map((row) => [
                      row.documentType,
                      row.originalInvoiceNumber || '',
                      row.invoiceNumber,
                      row.customerName,
                      row.customerGstin || 'Unregistered',
                      row.taxableValue,
                      row.cgstAmount,
                      row.sgstAmount,
                      row.igstAmount,
                      row.lineTotal,
                    ]),
                  )
                }
                className="flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-300 dark:border-gray-700 rounded text-gray-600 dark:text-gray-300 no-print"
              >
                Download CSV
              </button>
            </div>

            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
              {gstLoading || gstr1Loading ? (
                <div className="p-12 text-center text-xs text-gray-400">
                  Compiling tax registers...
                </div>
              ) : gstr1.length === 0 ? (
                <div className="p-16 text-center text-xs text-gray-400">
                  No invoices recorded in this filing range.
                </div>
              ) : (
                <table className="w-full border-collapse text-left text-sm text-gray-500 dark:text-gray-400 font-mono text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-850/50 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-800">
                    <tr className="font-sans">
                      <th className="px-6 py-3">Document Type</th>
                      <th className="px-6 py-3">Original Invoice</th>
                      <th className="px-6 py-3">Document Number</th>
                      <th className="px-6 py-3">Customer Name</th>
                      <th className="px-6 py-3">GSTIN</th>
                      <th className="px-6 py-3 text-right">Taxable (₹)</th>
                      <th className="px-6 py-3 text-right">CGST (₹)</th>
                      <th className="px-6 py-3 text-right">SGST (₹)</th>
                      <th className="px-6 py-3 text-right">IGST (₹)</th>
                      <th className="px-6 py-3 text-right">Line Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {gstr1.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                        <td className="px-6 py-3.5">{row.documentType}</td>
                        <td className="px-6 py-3.5">{row.originalInvoiceNumber || '-'}</td>
                        <td className="px-6 py-3.5 font-bold text-gray-950 dark:text-white">
                          {row.invoiceNumber}
                        </td>
                        <td className="px-6 py-3.5 font-sans text-sm">{row.customerName}</td>
                        <td className="px-6 py-3.5">{row.customerGstin || 'Unregistered'}</td>
                        <td className="px-6 py-3.5 text-right">₹{row.taxableValue?.toFixed(2)}</td>
                        <td className="px-6 py-3.5 text-right">₹{row.cgstAmount?.toFixed(2)}</td>
                        <td className="px-6 py-3.5 text-right">₹{row.sgstAmount?.toFixed(2)}</td>
                        <td className="px-6 py-3.5 text-right">₹{row.igstAmount?.toFixed(2)}</td>
                        <td className="px-6 py-3.5 text-right font-bold text-gray-950 dark:text-white">
                          ₹{row.lineTotal?.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTAINER 2: Financial Statements */}
      {activeTab === 'accounting' && (
        <div className="space-y-6 print-container">
          <div className="flex border-b border-gray-200 dark:border-gray-800 gap-4 no-print">
            <button
              onClick={() => setReportType('tb')}
              className={`pb-2 text-xs font-bold transition-colors ${
                reportType === 'tb'
                  ? 'text-brand-600 border-b-2 border-brand-600'
                  : 'text-gray-500 hover:text-gray-950'
              }`}
            >
              Trial Balance
            </button>
            <button
              onClick={() => setReportType('pl')}
              className={`pb-2 text-xs font-bold transition-colors ${
                reportType === 'pl'
                  ? 'text-brand-600 border-b-2 border-brand-600'
                  : 'text-gray-500 hover:text-gray-950'
              }`}
            >
              Profit & Loss
            </button>
            <button
              onClick={() => setReportType('bs')}
              className={`pb-2 text-xs font-bold transition-colors ${
                reportType === 'bs'
                  ? 'text-brand-600 border-b-2 border-brand-600'
                  : 'text-gray-500 hover:text-gray-950'
              }`}
            >
              Balance Sheet
            </button>
          </div>

          {/* Sub-report 1: Trial Balance */}
          {reportType === 'tb' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between no-print">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Trial Balance Statement
                </h3>
                <button
                  disabled={Boolean(reportError) || reportLoading}
                  onClick={() =>
                    handleExportCsv(
                      'Trial_Balance',
                      ['Ledger Name', 'Group Nature', 'Debit Balance', 'Credit Balance'],
                      trialBalance.ledgers.map((l) => [
                        l.ledgerName,
                        l.groupName,
                        l.balanceType === 'DEBIT' ? l.balance : 0,
                        l.balanceType === 'CREDIT' ? l.balance : 0,
                      ]),
                    )
                  }
                  className="flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-300 dark:border-gray-700 rounded text-gray-600 dark:text-gray-300"
                >
                  Download CSV
                </button>
              </div>

              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
                {tbLoading ? (
                  <div className="p-12 text-center text-xs text-gray-400">
                    Compiling trial ledger balances...
                  </div>
                ) : trialBalance.ledgers.length === 0 ? (
                  <div className="p-16 text-center text-xs text-gray-400">
                    No active accounts balances found.
                  </div>
                ) : (
                  <table className="w-full border-collapse text-left text-sm text-gray-500 dark:text-gray-400 font-mono text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-850/50 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-800">
                      <tr className="font-sans">
                        <th className="px-6 py-3">Ledger Name</th>
                        <th className="px-6 py-3">Account Group</th>
                        <th className="px-6 py-3 text-right">Debit (₹)</th>
                        <th className="px-6 py-3 text-right">Credit (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                      {trialBalance.ledgers.map((l, i) => (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-850">
                          <td className="px-6 py-3 font-semibold text-gray-900 dark:text-white">
                            {l.ledgerName}
                          </td>
                          <td className="px-6 py-3 text-gray-500">{l.groupName}</td>
                          <td className="px-6 py-3 text-right text-indigo-650">
                            {l.balanceType === 'DEBIT' && l.balance > 0
                              ? `₹${l.balance.toFixed(2)}`
                              : '-'}
                          </td>
                          <td className="px-6 py-3 text-right text-emerald-650">
                            {l.balanceType === 'CREDIT' && l.balance > 0
                              ? `₹${l.balance.toFixed(2)}`
                              : '-'}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 dark:bg-gray-850 font-bold border-t border-gray-300">
                        <td className="px-6 py-4 font-sans text-sm" colSpan={2}>
                          Grand Total
                        </td>
                        <td className="px-6 py-4 text-right text-indigo-650">
                          ₹{trialBalance.totals?.debits?.toFixed(2) || '0.00'}
                        </td>
                        <td className="px-6 py-4 text-right text-emerald-650">
                          ₹{trialBalance.totals?.credits?.toFixed(2) || '0.00'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Sub-report 2: Profit & Loss */}
          {reportType === 'pl' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between no-print">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Profit & Loss Statement
                </h3>
                <button
                  disabled={Boolean(reportError) || reportLoading}
                  onClick={() =>
                    handleExportCsv(
                      'Profit_Loss',
                      ['Ledger Category', 'Ledger Name', 'Amount'],
                      [
                        ...profitLoss.revenue.items.map((i) => ['Revenue', i.ledgerName, i.amount]),
                        ['Revenue Total', '', profitLoss.revenue.total],
                        ['COGS', '', profitLoss.costOfGoodsSold],
                        ['Gross Profit', '', profitLoss.grossProfit],
                        ...profitLoss.expenses.items.map((i) => [
                          'Expense',
                          i.ledgerName,
                          i.amount,
                        ]),
                        ['Expense Total', '', profitLoss.expenses.total],
                        ['Net Profit', '', profitLoss.netProfit],
                      ],
                    )
                  }
                  className="flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-300 dark:border-gray-700 rounded text-gray-600 dark:text-gray-300"
                >
                  Download CSV
                </button>
              </div>

              {plLoading ? (
                <div className="p-12 text-center text-xs text-gray-400">
                  Compiling financial performance...
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  {/* Revenue / Incomes side */}
                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4 shadow-sm">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-gray-500 border-b pb-2">
                      Revenue / Trading Accounts
                    </h4>
                    <div className="space-y-3 min-h-[150px]">
                      {profitLoss.revenue.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-gray-700 dark:text-gray-300">
                            {item.ledgerName}
                          </span>
                          <span className="font-mono font-semibold text-gray-900 dark:text-white">
                            ₹{item.amount?.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t pt-3 flex justify-between font-bold text-sm text-gray-900 dark:text-white">
                      <span>Total Revenue</span>
                      <span className="font-mono">₹{profitLoss.revenue.total?.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Expenses / Spending side */}
                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4 shadow-sm">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-gray-500 border-b pb-2">
                      Operating Expenses
                    </h4>
                    <div className="space-y-3 min-h-[150px]">
                      {profitLoss.expenses.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-gray-700 dark:text-gray-300">
                            {item.ledgerName}
                          </span>
                          <span className="font-mono font-semibold text-gray-900 dark:text-white text-red-500">
                            ₹{item.amount?.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t pt-3 flex justify-between font-bold text-sm text-gray-900 dark:text-white">
                      <span>Total Expenses</span>
                      <span className="font-mono">₹{profitLoss.expenses.total?.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Summary Block */}
                  <div className="col-span-2 bg-gradient-to-r from-brand-600 to-indigo-650 text-white rounded-xl p-6 flex items-center justify-between shadow-md">
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider opacity-85">
                        Net Profit Margin
                      </h4>
                      <p className="text-3xl font-black mt-1">
                        ₹{profitLoss.netProfit?.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right text-xs opacity-90">
                      <p>Cost of Goods Sold (COGS): ₹{profitLoss.costOfGoodsSold?.toFixed(2)}</p>
                      <p className="mt-1">
                        Trading Gross Profit: ₹{profitLoss.grossProfit?.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sub-report 3: Balance Sheet */}
          {reportType === 'bs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between no-print">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Balance Sheet Statement
                </h3>
                <button
                  disabled={Boolean(reportError) || reportLoading}
                  onClick={() =>
                    handleExportCsv(
                      'Balance_Sheet',
                      ['Category', 'Ledger Name', 'Amount'],
                      [
                        ...balanceSheet.assets.items.map((i) => ['Asset', i.ledgerName, i.amount]),
                        ['Asset Total', '', balanceSheet.assets.total],
                        ...balanceSheet.liabilities.items.map((i) => [
                          'Liability',
                          i.ledgerName,
                          i.amount,
                        ]),
                        ['Liability Total', '', balanceSheet.liabilities.total],
                        ...balanceSheet.equity.items.map((i) => ['Equity', i.ledgerName, i.amount]),
                        ['Equity Total', '', balanceSheet.equity.total],
                      ],
                    )
                  }
                  className="flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-300 dark:border-gray-700 rounded text-gray-600 dark:text-gray-300"
                >
                  Download CSV
                </button>
              </div>

              {bsLoading ? (
                <div className="p-12 text-center text-xs text-gray-400">
                  Compiling financial balance sheet...
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  {/* Assets Grid */}
                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4 shadow-sm">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-indigo-600 border-b pb-2">
                      Assets (Use of Funds)
                    </h4>
                    <div className="space-y-3 min-h-[150px]">
                      {balanceSheet.assets.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-gray-700 dark:text-gray-300">
                            {item.ledgerName}
                          </span>
                          <span className="font-mono font-semibold text-gray-900 dark:text-white">
                            ₹{item.amount?.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t pt-3 flex justify-between font-bold text-sm text-gray-900 dark:text-white">
                      <span>Total Assets</span>
                      <span className="font-mono">₹{balanceSheet.assets.total?.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Liabilities + Equity Grid */}
                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4 shadow-sm flex flex-col justify-between">
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-600 border-b pb-2">
                        Liabilities & Equity (Source of Funds)
                      </h4>
                      <div className="space-y-3 min-h-[120px] mt-4">
                        {balanceSheet.liabilities.items.map((item, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-gray-700 dark:text-gray-300">
                              {item.ledgerName} (Liability)
                            </span>
                            <span className="font-mono font-semibold text-gray-900 dark:text-white">
                              ₹{item.amount?.toFixed(2)}
                            </span>
                          </div>
                        ))}
                        {balanceSheet.equity.items.map((item, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-gray-700 dark:text-gray-300">
                              {item.ledgerName} (Equity)
                            </span>
                            <span className="font-mono font-semibold text-gray-900 dark:text-white">
                              ₹{item.amount?.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="border-t pt-3 flex justify-between font-bold text-sm text-gray-900 dark:text-white">
                      <span>Total Equity & Liabilities</span>
                      <span className="font-mono">
                        ₹{(balanceSheet.liabilities.total + balanceSheet.equity.total)?.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Reconciliation Checker */}
                  {!balanceSheet.totals?.isBalanced && (
                    <div className="col-span-2 p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-center gap-2">
                      <AlertCircle className="h-4.5 w-4.5" />
                      <span>
                        Warning: Accounting ledger contains unbalanced entries. Review the affected
                        vouchers and opening balances with your accountant.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
