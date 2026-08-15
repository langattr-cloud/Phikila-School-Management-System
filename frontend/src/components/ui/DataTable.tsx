import { useMemo, useState } from 'react'

export interface Column<T> {
  key: string
  header: string
  sortable?: boolean
  className?: string
  render?: (row: T) => React.ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  searchable?: boolean
  searchPlaceholder?: string
  searchKeys?: string[]
  pageSize?: number
  emptyIcon?: string
  emptyTitle?: string
  emptyDescription?: string
  actions?: React.ReactNode
  onRowClick?: (row: T) => void
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  searchable = true,
  searchPlaceholder = 'Search…',
  searchKeys,
  pageSize = 10,
  emptyIcon = '📋',
  emptyTitle = 'No results',
  emptyDescription = 'No items match your search.',
  actions,
  onRowClick,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)

  // Filter
  const filtered = useMemo(() => {
    if (!search.trim()) return data
    const q = search.toLowerCase()
    const keys = searchKeys ?? columns.map((c) => c.key)
    return data.filter((row) =>
      keys.some((key) => {
        const val = row[key]
        return val != null && String(val).toLowerCase().includes(q)
      })
    )
  }, [data, search, searchKeys, columns])

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      const cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir])

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const paged = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize)

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(0)
  }

  function handleSearch(value: string) {
    setSearch(value)
    setPage(0)
  }

  if (data.length === 0 && !search) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">{emptyIcon}</span>
        <h3 className="empty-state-title">{emptyTitle}</h3>
        <p className="empty-state-desc">{emptyDescription}</p>
        {actions && <div className="empty-state-action">{actions}</div>}
      </div>
    )
  }

  return (
    <div>
      {searchable && (
        <div className="dt-toolbar">
          <div className="dt-search">
            <span className="dt-search-icon">🔍</span>
            <input
              type="text"
              className="dt-search-input"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {search && (
              <button className="dt-search-clear" type="button" onClick={() => handleSearch('')} aria-label="Clear search">
                ✕
              </button>
            )}
          </div>
          {actions && <div className="dt-actions">{actions}</div>}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="empty-state" style={{ padding: '2rem' }}>
          <span className="empty-state-icon">{emptyIcon}</span>
          <h3 className="empty-state-title">{emptyTitle}</h3>
          <p className="empty-state-desc">{emptyDescription}</p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`${col.sortable ? 'th-sortable' : ''} ${col.className ?? ''}`}
                      onClick={col.sortable ? () => handleSort(col.key) : undefined}
                    >
                      <span className="th-content">
                        {col.header}
                        {col.sortable && sortKey === col.key && (
                          <span className="th-sort-icon">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((row, i) => (
                  <tr
                    key={i}
                    className={onRowClick ? 'tr-clickable' : ''}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={col.className ?? ''}>
                        {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="dt-pagination">
              <span className="dt-page-info">
                {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} of {sorted.length}
              </span>
              <div className="dt-page-buttons">
                <button
                  className="btn btn--small btn--ghost"
                  type="button"
                  disabled={safePage === 0}
                  onClick={() => setPage(0)}
                >
                  «
                </button>
                <button
                  className="btn btn--small btn--ghost"
                  type="button"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ‹
                </button>
                <span className="dt-page-number">
                  {safePage + 1} / {totalPages}
                </span>
                <button
                  className="btn btn--small btn--ghost"
                  type="button"
                  disabled={safePage >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  ›
                </button>
                <button
                  className="btn btn--small btn--ghost"
                  type="button"
                  disabled={safePage >= totalPages - 1}
                  onClick={() => setPage(totalPages - 1)}
                >
                  »
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
