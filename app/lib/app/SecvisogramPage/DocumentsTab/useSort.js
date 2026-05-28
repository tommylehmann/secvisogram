import React from 'react'
import { getComparator } from './columns.js'

/**
 * @typedef {{ columnId: string, direction: 'asc' | 'desc' }} SortState
 */

/**
 * Hook that derives a sorted view of the given rows and exposes the current
 * sort state plus a toggler that cycles `null → asc → desc → null` for the
 * same column, or resets to `asc` when a different column is selected.
 *
 * When `sort` is `null` the rows are returned untouched (insertion order from
 * the backend response).
 *
 * @template {Record<string, unknown>} TRow
 * @param {readonly TRow[]} rows
 * @param {ReadonlyArray<{ id: string, sortable: boolean }>} columns
 * @returns {{
 *   sortedRows: readonly TRow[],
 *   sort: SortState | null,
 *   toggleSort: (columnId: string) => void,
 *   sortableColumnIds: ReadonlySet<string>,
 * }}
 */
export default function useSort(rows, columns) {
  const [sort, setSort] = React.useState(/** @type {SortState | null} */ (null))

  const sortableColumnIds = React.useMemo(
    () =>
      new Set(
        columns.filter((column) => column.sortable).map((column) => column.id),
      ),
    [columns],
  )

  const toggleSort = React.useCallback(
    /** @param {string} columnId */
    (columnId) => {
      setSort((previous) => {
        if (!previous || previous.columnId !== columnId) {
          return { columnId, direction: 'asc' }
        }
        if (previous.direction === 'asc') {
          return { columnId, direction: 'desc' }
        }
        return null
      })
    },
    [],
  )

  const sortedRows = React.useMemo(() => {
    if (!sort) return rows
    if (!sortableColumnIds.has(sort.columnId)) return rows
    const comparator = getComparator(sort.columnId, sort.direction)
    const copy = rows.slice()
    copy.sort(comparator)
    return copy
  }, [rows, sort, sortableColumnIds])

  return { sortedRows, sort, toggleSort, sortableColumnIds }
}
