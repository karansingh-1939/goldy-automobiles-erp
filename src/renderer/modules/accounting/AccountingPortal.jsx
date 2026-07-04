import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/apiClient.js';
import { useAppStore } from '../../shared/store/useAppStore.js';
import { Search, Plus, BookOpen, FileText, CheckCircle, X, ChevronRight } from 'lucide-react';

export default function AccountingPortal() {
  const queryClient = useQueryClient();
  const addNotification = useAppStore((state) => state.addNotification);

  const [activeTab, setActiveTab] = useState('trial-balance');
  const [showAddVoucher, setShowAddVoucher] = useState(false);

  // Form State (New Voucher)
  const [voucherType, setVoucherType] = useState('Journal');
  const [voucherDate, setVoucherDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [narration, setNarration] = useState('');
  
  // Voucher Entries
  const [entries, setEntries] = useState([
    { ledgerId: '', type: 'DEBIT', amount: '', narration: '' },
    { ledgerId: '', type: 'CREDIT', amount: '', narration: '' }
  ]);

  // Fetch ledgers for creation dropdowns
  const { data: ledgersResponse } = useQuery({ queryKey: ['ledgers-list'], queryFn: () => api.get('/api/v1/accounting/ledgers') });
  const ledgers = ledgersResponse?.data || [];

  // Fetch Trial Balance
  const { data: tbResponse, isLoading: loadingTB } = useQuery({
    queryKey: ['trial-balance'],
    queryFn: () => api.get('/api/v1/accounting/reports/trial-balance'),
    enabled: activeTab === 'trial-balance'
  });

  // Fetch Profit & Loss
  const { data: plResponse, isLoading: loadingPL } = useQuery({
    queryKey: ['profit-loss'],
    queryFn: () => api.get('/api/v1/accounting/reports/profit-loss'),
    enabled: activeTab === 'profit-loss'
  });

  // Fetch Day Book (Vouchers)
  const { data: dayBookResponse, isLoading: loadingVouchers } = useQuery({
    queryKey: ['daybook-vouchers'],
    queryFn: () => api.get('/api/v1/accounting/vouchers'),
    enabled: activeTab === 'day-book'
  });

  const trialBalance = tbResponse?.data || [];
  const plData = plResponse?.data || { revenues: [], expenses: [], grossProfit: 0, netProfit: 0 };
  const vouchers = dayBookResponse?.data || [];

  // Create Voucher Mutation
  const createVoucherMutation = useMutation({
    mutationFn: (payload) => api.post('/api/v1/accounting/vouchers', payload),
    onSuccess: () => {
      queryClient.invalidateQueries(['daybook-vouchers']);
      queryClient.invalidateQueries(['trial-balance']);
      queryClient.invalidateQueries(['profit-loss']);
      addNotification('Voucher posted successfully to General Ledger.', 'success');
      setShowAddVoucher(false);
      setNarration('');
      setEntries([
        { ledgerId: '', type: 'DEBIT', amount: '', narration: '' },
        { ledgerId: '', type: 'CREDIT', amount: '', narration: '' }
      ]);
    },
    onError: (err) => {
      addNotification(err.message || 'Failed to post voucher.', 'error');
    }
  });

  const handleAddEntryLine = () => {
    setEntries([...entries, { ledgerId: '', type: 'DEBIT', amount: '', narration: '' }]);
  };

  const handleRemoveEntryLine = (index) => {
    setEntries(entries.filter((_, i) => i !== index));
  };

  const handleEntryChange = (index, field, value) => {
    const updated = [...entries];
    updated[index][field] = value;
    setEntries(updated);
  };

  const handleSubmitVoucher = (e) => {
    e.preventDefault();
    
    // Validate entries
    const formattedEntries = entries.map(e => ({
      ledgerId: Number(e.ledgerId),
      type: e.type,
      amount: Number(e.amount),
      narration: e.narration || undefined
    }));

    const debits = formattedEntries.filter(e => e.type === 'DEBIT').reduce((s, e) => s + e.amount, 0);
    const credits = formattedEntries.filter(e => e.type === 'CREDIT').reduce((s, e) => s + e.amount, 0);

    if (Math.abs(debits - credits) > 0.001) {
      addNotification(`Voucher out of balance by ₹${Math.abs(debits - credits).toFixed(2)}. Debits: ₹${debits}, Credits: ₹${credits}`, 'error');
      return;
    }

    createVoucherMutation.mutate({
      voucherType,
      voucherDate,
      narration,
      entries: formattedEntries
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">General Ledger & Vouchers</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">View real-time Trial Balance sheets, Profit & Loss summaries, and record Journal Entries.</p>
        </div>
        <button
          onClick={() => setShowAddVoucher(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Voucher
        </button>
      </div>

      {/* Tabs Binders */}
      <div className="flex border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setActiveTab('trial-balance')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'trial-balance'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          Trial Balance
        </button>
        <button
          onClick={() => setActiveTab('profit-loss')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'profit-loss'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          Profit & Loss
        </button>
        <button
          onClick={() => setActiveTab('day-book')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'day-book'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          Day Book
        </button>
      </div>

      {/* Tab Panels */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
        {activeTab === 'trial-balance' && (
          loadingTB ? (
            <div className="p-12 text-center text-sm text-gray-500">Generating Trial Balance...</div>
          ) : trialBalance.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">No account balances found.</div>
          ) : (
            <table className="w-full border-collapse text-left text-sm text-gray-500 dark:text-gray-400">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-800">
                <tr>
                  <th className="px-6 py-3">Account / Ledger Name</th>
                  <th className="px-6 py-3">Nature</th>
                  <th className="px-6 py-3 text-right">Debit Balance (₹)</th>
                  <th className="px-6 py-3 text-right">Credit Balance (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800 font-mono text-xs">
                {trialBalance.map((ledger) => (
                  <tr key={ledger.ledgerId} className="hover:bg-gray-50 dark:hover:bg-gray-850">
                    <td className="px-6 py-3.5 font-sans text-sm font-semibold text-gray-900 dark:text-white">{ledger.ledgerName}</td>
                    <td className="px-6 py-3.5 capitalize font-sans">{ledger.nature}</td>
                    <td className="px-6 py-3.5 text-right text-gray-950 dark:text-white font-bold">
                      {ledger.nature === 'Debit' ? `₹${ledger.amount.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-6 py-3.5 text-right text-gray-950 dark:text-white font-bold">
                      {ledger.nature === 'Credit' ? `₹${ledger.amount.toFixed(2)}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {activeTab === 'profit-loss' && (
          loadingPL ? (
            <div className="p-12 text-center text-sm text-gray-500">Generating Profit & Loss statements...</div>
          ) : (
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                {/* Revenues */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-950 dark:text-white uppercase tracking-wider">Revenues (Credit accounts)</h3>
                  <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 space-y-2">
                    {plData.revenues.map((r, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span>{r.ledgerName}</span>
                        <span className="font-bold">₹{r.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    {plData.revenues.length === 0 && <div className="text-xs text-gray-400">No revenue logs.</div>}
                  </div>
                </div>
                {/* Expenses */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-950 dark:text-white uppercase tracking-wider">Expenses (Debit accounts)</h3>
                  <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 space-y-2">
                    {plData.expenses.map((e, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span>{e.ledgerName}</span>
                        <span className="font-bold">₹{e.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    {plData.expenses.length === 0 && <div className="text-xs text-gray-400">No expenses logged.</div>}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-6 border-t border-gray-200 dark:border-gray-800 pt-4">
                <div className="text-right">
                  <p className="text-xs text-gray-500 uppercase">Gross Profit</p>
                  <p className="text-lg font-bold text-green-600">₹{plData.grossProfit.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 uppercase">Net Profit</p>
                  <p className="text-lg font-bold text-green-700">₹{plData.netProfit.toFixed(2)}</p>
                </div>
              </div>
            </div>
          )
        )}

        {activeTab === 'day-book' && (
          loadingVouchers ? (
            <div className="p-12 text-center text-sm text-gray-500">Loading Day Book Vouchers...</div>
          ) : vouchers.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">No vouchers recorded for this period.</div>
          ) : (
            <table className="w-full border-collapse text-left text-sm text-gray-500 dark:text-gray-400">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-800">
                <tr>
                  <th className="px-6 py-3">Voucher Date</th>
                  <th className="px-6 py-3">Voucher Number</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Narration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800 font-mono text-xs">
                {vouchers.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-850">
                    <td className="px-6 py-3.5 font-sans text-sm">{v.voucher_date}</td>
                    <td className="px-6 py-3.5 font-bold text-gray-950 dark:text-white">{v.voucher_number}</td>
                    <td className="px-6 py-3.5 capitalize font-sans font-semibold">{v.voucher_type}</td>
                    <td className="px-6 py-3.5 font-sans truncate max-w-xs">{v.narration || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* Add Voucher Modal */}
      {showAddVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
                <BookOpen className="h-5 w-5" />
                <h3 className="text-lg font-bold">Post Double-Entry Voucher</h3>
              </div>
              <button
                onClick={() => setShowAddVoucher(false)}
                className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <form onSubmit={handleSubmitVoucher} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="modal-v-type" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Voucher Type *</label>
                  <select
                    id="modal-v-type"
                    value={voucherType}
                    onChange={(e) => setVoucherType(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  >
                    <option value="Journal">Journal Voucher</option>
                    <option value="Payment">Payment</option>
                    <option value="Receipt">Receipt</option>
                    <option value="Contra">Contra</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="modal-v-date" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Voucher Date *</label>
                  <input
                    id="modal-v-date"
                    type="date"
                    required
                    value={voucherDate}
                    onChange={(e) => setVoucherDate(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
                <div className="col-span-2">
                  <label htmlFor="modal-v-narration" className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Narration / Note</label>
                  <input
                    id="modal-v-narration"
                    type="text"
                    value={narration}
                    onChange={(e) => setNarration(e.target.value)}
                    placeholder="General description of transactions..."
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 text-sm focus-ring text-gray-950 dark:text-white"
                  />
                </div>
              </div>

              {/* Entries lines */}
              <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Journal Entries</h4>
                  <button
                    type="button"
                    onClick={handleAddEntryLine}
                    className="text-xs text-brand-600 dark:text-brand-400 font-semibold hover:underline"
                  >
                    + Add Account Line
                  </button>
                </div>

                <div className="space-y-2">
                  {entries.map((entry, index) => (
                    <div key={index} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-850 p-3 rounded-lg border border-gray-200 dark:border-gray-800/80 animate-fade-in">
                      <select
                        required
                        value={entry.ledgerId}
                        onChange={(e) => handleEntryChange(index, 'ledgerId', e.target.value)}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800 text-xs focus-ring text-gray-950 dark:text-white"
                      >
                        <option value="">Select Ledger Account...</option>
                        {ledgers.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                      
                      <select
                        value={entry.type}
                        onChange={(e) => handleEntryChange(index, 'type', e.target.value)}
                        className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800 text-xs focus-ring text-gray-950 dark:text-white"
                      >
                        <option value="DEBIT">DEBIT (Dr)</option>
                        <option value="CREDIT">CREDIT (Cr)</option>
                      </select>

                      <input
                        type="number"
                        required
                        value={entry.amount}
                        onChange={(e) => handleEntryChange(index, 'amount', e.target.value)}
                        placeholder="₹0.00"
                        className="w-28 rounded-lg border border-gray-300 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800 text-xs focus-ring text-gray-950 dark:text-white text-right"
                      />

                      {entries.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveEntryLine(index)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                        >
                          <X className="h-4.5 w-4.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowAddVoucher(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createVoucherMutation.isPending}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  Post Voucher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
