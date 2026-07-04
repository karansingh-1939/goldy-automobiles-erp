import React, { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, ArrowUpDown, Loader2, AlertCircle } from 'lucide-react';

export default function DataTable({
  columns,
  data = [],
  isLoading = false,
  error = null,
  onRowClick = null,
  bulkActions = null,
  emptyStateMessage = 'No records found.',
  enablePagination = true,
  pageSize = 10,
}) {
  const [sorting, setSorting] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [currentPageSize, setCurrentPageSize] = useState(pageSize);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: enablePagination ? getPaginationRowModel() : undefined,
    onPaginationChange: (updater) => {
      // Handle page size and index updates via react-table state internally
      const nextState = typeof updater === 'function' ? updater(table.getState().pagination) : updater;
      table.setPagination(nextState);
    },
    initialState: {
      pagination: {
        pageSize: currentPageSize,
      },
    },
  });

  const handlePageSizeChange = (e) => {
    const size = Number(e.target.value);
    setCurrentPageSize(size);
    table.setPageSize(size);
  };

  return (
    <div className="flex flex-col h-full w-full space-y-4" role="grid" aria-colcount={columns.length} aria-rowcount={data.length}>
      {/* Search and Bulk Actions header */}
      {(bulkActions || table.getColumnCanGlobalFilter) && (
        <div className="flex items-center justify-between gap-4">
          {bulkActions && <div className="flex items-center gap-2">{bulkActions}</div>}
        </div>
      )}

      {/* Table Container */}
      <div className="flex-1 overflow-auto border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 shadow-sm relative min-h-[250px] focus:outline-none focus:ring-1 focus:ring-brand-500/20" tabIndex={0}>
        <table className="w-full border-collapse text-left text-sm text-gray-500 dark:text-gray-400">
          <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10 backdrop-blur-md shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-6 py-3 text-xs uppercase tracking-wider font-bold border-r border-gray-100 dark:border-gray-800/40 last:border-r-0"
                    style={{ width: header.column.columnDef.width }}
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        onClick={header.column.getToggleSortingHandler()}
                        className={`flex items-center gap-1.5 ${
                          header.column.getCanSort() ? 'cursor-pointer select-none hover:text-gray-900 dark:hover:text-white' : ''
                        }`}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
                        )}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {isLoading ? (
              // Premium skeleton rows with animation
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {columns.map((_, colIndex) => (
                    <td key={colIndex} className="px-6 py-4">
                      <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4"></div>
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={columns.length} className="py-12">
                  <div className="flex flex-col items-center justify-center gap-2 text-red-500">
                    <AlertCircle className="h-8 w-8" />
                    <span className="text-sm font-semibold">Failed to fetch data</span>
                    <span className="text-xs text-gray-500">{error.message || String(error)}</span>
                  </div>
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-16 text-center text-gray-400">
                  {emptyStateMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick && onRowClick(row.original)}
                  className={`hover:bg-gray-50/70 dark:hover:bg-gray-850/50 transition-colors border-r border-transparent last:border-b-0 ${
                    onRowClick ? 'cursor-pointer' : ''
                  }`}
                  role="row"
                  tabIndex={onRowClick ? 0 : -1}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && onRowClick) {
                      onRowClick(row.original);
                    }
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-6 py-4 border-r border-gray-100 dark:border-gray-800/40 last:border-r-0">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {enablePagination && !isLoading && !error && (
        <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-855 pt-4">
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500">
              Showing {table.getRowModel().rows.length} of {data.length} records
            </span>
            
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span>Rows per page:</span>
              <select
                value={currentPageSize}
                onChange={handlePageSizeChange}
                className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-0.5 focus-ring"
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
          
          {table.getPageCount() > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="p-1.5 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-150 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              
              <span className="text-xs text-gray-500">
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
              </span>

              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="p-1.5 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-150 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
