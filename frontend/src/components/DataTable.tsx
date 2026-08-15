import type { ReactNode } from 'react'
import { LoadingBlock } from './States'

export type Column<T> = {
  key: string
  header: string
  /** Cell content. */
  render: (row: T) => ReactNode
  /** Hidden on narrow screens when the table scrolls; still shown in card view. */
  secondary?: boolean
}

/**
 * One table implementation for the whole application.
 *
 * Wide screens get a real <table>. Narrow screens get a definition-style card
 * per row, which keeps every value readable and never forces the page to
 * scroll horizontally.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  loading = false,
  loadingLabel = 'Loading data',
  empty,
  rowActions,
}: {
  caption: string
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  loading?: boolean
  loadingLabel?: string
  empty?: ReactNode
  rowActions?: (row: T) => ReactNode
}) {
  if (loading) return <LoadingBlock label={loadingLabel} rows={4} />
  if (rows.length === 0) return <>{empty}</>

  return (
    <>
      <div className="table-wrap" role="region" aria-label={caption} tabIndex={0}>
        <table className="table">
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col">
                  {column.header}
                </th>
              ))}
              {rowActions && (
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column, index) => (
                  <td key={column.key} data-primary={index === 0 || undefined}>
                    {column.render(row)}
                  </td>
                ))}
                {rowActions && <td className="table__actions">{rowActions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="record-cards" aria-label={caption}>
        {rows.map((row) => (
          <li className="record-card" key={rowKey(row)}>
            <dl>
              {columns.map((column) => (
                <div className="record-card__row" key={column.key}>
                  <dt>{column.header}</dt>
                  <dd>{column.render(row)}</dd>
                </div>
              ))}
            </dl>
            {rowActions && <div className="record-card__actions">{rowActions(row)}</div>}
          </li>
        ))}
      </ul>
    </>
  )
}
