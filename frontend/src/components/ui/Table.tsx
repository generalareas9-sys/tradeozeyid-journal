import { Children } from 'react';
import type { ReactNode } from 'react';

export interface TableProps {
  /** Visible caption, rendered as a real `<caption>`. */
  caption?: ReactNode;
  /** Column headers, in order. */
  headers: ReactNode[];
  /** Per-column alignment. Defaults to `left` for every column. */
  align?: Array<'left' | 'right' | 'center'>;
  /** Rows: `<tr>` elements supplied by the caller. */
  children?: ReactNode;
  /** Shown in place of rows when no rows are supplied. */
  empty?: ReactNode;
  /** Columns spanned by the empty row. Defaults to the header count. */
  emptyColSpan?: number;
}

const ALIGN = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const;

/**
 * A semantic table with a scroll container for narrow viewports.
 *
 * Deliberately passive: no sorting, filtering or pagination. Those arrive with
 * the feature phases, and owning them here would mean every page re-implemented
 * them differently.
 *
 * The horizontal scroll container is what keeps a wide table from pushing the
 * page into horizontal overflow at 390px.
 */
export function Table({
  caption,
  headers,
  align,
  children,
  empty,
  emptyColSpan,
}: TableProps) {
  const rowCount = Children.count(children);
  const showEmpty = rowCount === 0 && empty !== undefined;
  const colSpan = emptyColSpan ?? headers.length;

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
      <table className="w-full border-collapse text-sm">
        {caption ? (
          <caption className="border-b border-border px-5 py-4 text-left text-sm font-semibold text-text">
            {caption}
          </caption>
        ) : null}

        <thead>
          <tr className="border-b border-border bg-background">
            {headers.map((header, index) => (
              <th
                key={index}
                scope="col"
                className={`px-5 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted ${ALIGN[
                  align?.[index] ?? 'left'
                ]}`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {showEmpty ? (
            <tr>
              <td colSpan={colSpan} className="px-5 py-10 text-center text-sm text-text-muted">
                {empty}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}