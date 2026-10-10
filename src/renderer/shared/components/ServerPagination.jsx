import React from 'react';

export default function ServerPagination({ page, totalPages = 1, onChange, disabled = false }) {
  return (
    <nav aria-label="Record pages" className="flex items-center justify-end gap-3 text-sm">
      <button
        className="rounded border px-3 py-2 disabled:opacity-50"
        disabled={disabled || page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Previous page
      </button>
      <span>
        Page {page} of {Math.max(1, totalPages)}
      </span>
      <button
        className="rounded border px-3 py-2 disabled:opacity-50"
        disabled={disabled || page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Next page
      </button>
    </nav>
  );
}
