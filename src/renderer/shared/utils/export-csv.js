export function csvText(headers, rows) {
  return (
    '\uFEFF' +
    [headers, ...rows]
      .map((row) =>
        row
          .map((value) => {
            let text = String(value ?? '');
            if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
            return `"${text.replace(/"/g, '""')}"`;
          })
          .join(','),
      )
      .join('\r\n')
  );
}

export function downloadCsv(filename, headers, rows) {
  const url = URL.createObjectURL(
    new Blob([csvText(headers, rows)], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
