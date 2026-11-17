/**
 * RFC-4180 style delimited-text parser shared by the importers.
 *
 * - Double-quoted fields may contain the delimiter, CR, LF and `""` (an escaped quote).
 * - A quote opens a quoted field only at the start of a field; elsewhere it is literal.
 * - Records end with LF or CRLF. A lone CR outside quotes is ordinary content.
 * - A leading BOM is stripped. A final newline does not produce an extra empty record, but
 *   blank records elsewhere are kept as `['']`.
 * - Cells are verbatim: no trimming.
 *
 * Linear time: fields are built from slices, never character by character.
 */
export function parseDelimited(text: string, delimiter: ',' | '\t'): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const n = src.length;
  const records: string[][] = [];
  let pos = 0;

  while (pos < n) {
    const row: string[] = [];
    // Parse fields until the record ends.
    for (;;) {
      let field: string;
      if (src[pos] === '"') {
        const parts: string[] = [];
        let i = pos + 1;
        for (;;) {
          const q = src.indexOf('"', i);
          if (q === -1) {
            parts.push(src.slice(i)); // unterminated: take the rest
            i = n;
            break;
          }
          parts.push(src.slice(i, q));
          if (src[q + 1] === '"') {
            parts.push('"');
            i = q + 2;
          } else {
            i = q + 1;
            break;
          }
        }
        // Tolerate junk between the closing quote and the next delimiter.
        const end = scanUnquoted(src, i, delimiter);
        if (end > i) parts.push(src.slice(i, end));
        field = parts.join('');
        pos = end;
      } else {
        const end = scanUnquoted(src, pos, delimiter);
        field = src.slice(pos, end);
        pos = end;
      }
      row.push(field);

      if (pos >= n) break;
      if (src[pos] === delimiter) {
        pos += 1;
        if (pos >= n) {
          row.push(''); // trailing delimiter at EOF: one more empty field
          break;
        }
        continue;
      }
      // Record terminator: LF or CRLF.
      pos += src[pos] === '\r' ? 2 : 1;
      break;
    }
    records.push(row);
  }
  return records;
}

/** Index of the next delimiter, LF, CRLF start, or end of input at or after `from`. */
function scanUnquoted(src: string, from: number, delimiter: string): number {
  const n = src.length;
  for (let i = from; i < n; i++) {
    const c = src[i];
    if (c === delimiter || c === '\n') return i;
    if (c === '\r' && src[i + 1] === '\n') return i;
  }
  return n;
}
