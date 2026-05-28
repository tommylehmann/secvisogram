import React from 'react'
import { columns, getDefaultVisibility } from './columns.js'
import {
  loadColumnVisibility,
  saveColumnVisibility,
} from './columnVisibilityStorage.js'

/**
 * Custom hook that tracks which columns are visible in the Documents tab and
 * persists the user's choice to `localStorage`. Falls back to the default
 * visibility (see `columns.js`) on first load or when the stored value is
 * malformed.
 *
 * The hook enforces the invariant "at least one data column is visible". A
 * call to `setColumnVisible('foo', false)` is silently ignored if hiding
 * `foo` would leave the table with no data columns.
 *
 * @returns {{
 *   visibility: Record<string, boolean>,
 *   setColumnVisible: (id: string, visible: boolean) => void,
 *   visibleColumnCount: number,
 * }}
 */
export default function useColumnVisibility() {
  const [visibility, setVisibility] = React.useState(() =>
    loadColumnVisibility(getDefaultVisibility()),
  )

  const setColumnVisible = React.useCallback(
    /**
     * @param {string} id
     * @param {boolean} visible
     */
    (id, visible) => {
      setVisibility((previous) => {
        if (previous[id] === visible) return previous
        const next = { ...previous, [id]: visible }
        if (!visible) {
          // Refuse to hide the last visible data column. Action-kind columns
          // (`stateAction`, `rowActions`) do not count as data columns.
          const remainingDataColumns = columns.filter(
            (column) => column.kind !== 'action' && next[column.id],
          )
          if (remainingDataColumns.length === 0) {
            return previous
          }
        }
        saveColumnVisibility(next)
        return next
      })
    },
    [],
  )

  const visibleColumnCount = React.useMemo(
    () => columns.filter((column) => visibility[column.id]).length,
    [visibility],
  )

  return { visibility, setColumnVisible, visibleColumnCount }
}
