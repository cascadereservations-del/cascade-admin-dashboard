import Papa from 'papaparse';

// ACC09/UX20: exports carry property, period, basis, generation time and
// completeness in a header block and use the same rows as the screen. Papa's
// formula escaping is enabled so guest text like "=1+1" cannot execute in a
// spreadsheet. Downloads are triggered only by a user click.
export function exportCsv(filename: string, rows: Record<string, unknown>[], meta: Record<string, string>) {
  const header = Object.entries(meta).map(([k, v]) => `# ${k}: ${v}`).join('\n');
  const body = Papa.unparse(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)]))), { escapeFormulae: true });
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
