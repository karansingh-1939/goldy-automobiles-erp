import React, { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender
} from '@tanstack/react-table';

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/**
 * Recent Sales Table Component.
 * Employs TanStack Table v8 for client-side sorting and column management.
 * 
 * @param {object} props
 * @param {Array} props.sales - List of recent finalized sales invoices from the API
 * @param {boolean} props.isLoading - Whether the component is in a loading state
 */
export function RecentSalesTable({ sales, isLoading }) {
  const [sorting, setSorting] = useState([{ id: 'invoiceDate', desc: true }]);

  const columns = useMemo(() => [
    {
      accessorKey: 'invoiceNumber',
      header: 'Invoice Number',
      enableSorting: false, // Sorting not required for alphanumeric invoice IDs
      cell: (info) => (
        <span className="font-mono font-semibold text-gray-900">
          {info.getValue()}
        </span>
      )
    },
    {
      accessorKey: 'invoiceDate',
      header: 'Invoice Date',
      cell: (info) => {
        const dateVal = info.getValue();
        if (!dateVal) return '-';
        try {
          const d = new Date(dateVal);
          return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
          return dateVal;
        }
      }
    },
    {
      accessorKey: 'customerName',
      header: 'Customer',
      enableSorting: false,
      cell: (info) => <span className="text-gray-700">{info.getValue() || 'Walk-in Customer'}</span>
    },
    {
      accessorKey: 'grandTotal',
      header: 'Grand Total',
      cell: (info) => (
        <span className="font-bold text-gray-900">
          {inrFormatter.format(info.getValue() || 0)}
        </span>
      )
    }
  ], []);

  const tableData = useMemo(() => sales || [], [sales]);

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col min-h-[380px]">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900 tracking-tight">
          Recent Sales Activity
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Latest finalized sales invoices sorted by date. Click headers to sort.
        </p>
      </div>

      <div className="flex-1 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-left border-collapse">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  
                  return (
                    <th
                      key={header.id}
                      className="px-4 py-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider select-none border-b border-gray-200"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="flex items-center gap-1.5 hover:text-gray-700 focus:outline-none transition group"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span className="text-gray-400 group-hover:text-gray-600">
                            {sortDir === 'desc' ? '▼' : sortDir === 'asc' ? '▲' : '⇅'}
                          </span>
                        </button>
                      ) : (
                        <span>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {isLoading ? (
              // Loading Skeleton State
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse" aria-hidden="true">
                  <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-2/3" /></td>
                  <td className="px-4 py-4"><div className="h-4 bg-gray-150 rounded w-3/4" /></td>
                  <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-1/2" /></td>
                  <td className="px-4 py-4"><div className="h-4 bg-gray-150 rounded w-1/3" /></td>
                </tr>
              ))
            ) : tableData.length === 0 ? (
              // Empty State
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm font-medium text-gray-400"
                >
                  No recent sales available.
                </td>
              </tr>
            ) : (
              // Render Table Rows
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50/70 transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3.5 text-sm whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
