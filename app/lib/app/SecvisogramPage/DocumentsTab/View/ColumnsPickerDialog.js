import { t } from 'i18next'
import React from 'react'

export default React.forwardRef(
  /**
   * @param {import('./ColumnsPickerDialog/types.js').Props} props
   */
  ({ columns, visibility, onToggle, onClose }, ref) => {
    // `rowActions` is always shown — it carries the per-row edit/delete
    // icons. Everything else (including the workflow-state action button
    // column) is user-configurable.
    const pickableColumns = columns.filter(
      (column) => column.id !== 'rowActions',
    )
    const visibleDataColumnIds = columns
      .filter((column) => column.kind !== 'action' && visibility[column.id])
      .map((column) => column.id)

    return (
      <dialog
        className="rounded p-0 w-full max-w-sm shadow"
        ref={ref}
        data-testid="documentsTab-columnsPickerDialog"
        onClose={onClose}
      >
        <form method="dialog" id="documentsTab-columnsPicker-close_form" />
        <header className="w-full flex items-center justify-between border-b p-2">
          <h2 id="documentsTab-columnsPicker-heading" className="text-lg">
            {t('menu.documentsTab.columnsDialogTitle')}
          </h2>
          <button
            type="submit"
            name="cancel"
            form="documentsTab-columnsPicker-close_form"
            aria-label={t('menu.documentsTab.columnsDialogClose')}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </header>
        <div
          className="p-4"
          aria-labelledby="documentsTab-columnsPicker-heading"
        >
          <ul className="flex flex-col gap-2">
            {pickableColumns.map((column) => {
              const isVisible = Boolean(visibility[column.id])
              const isLastDataColumn =
                column.kind !== 'action' &&
                isVisible &&
                visibleDataColumnIds.length === 1 &&
                visibleDataColumnIds[0] === column.id
              const checkboxId = `documentsTab-columnsPickerCheckbox-${column.id}`
              return (
                <li key={column.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={checkboxId}
                    data-testid={`documentsTab-columnsPickerCheckbox-${column.id}`}
                    checked={isVisible}
                    disabled={isLastDataColumn}
                    onChange={(event) =>
                      onToggle(column.id, event.target.checked)
                    }
                  />
                  <label htmlFor={checkboxId}>{t(column.labelKey)}</label>
                </li>
              )
            })}
          </ul>
        </div>
        <footer className="p-2 border-t flex justify-end items-center">
          <button
            className="py-1 px-3 rounded shadow border border-blue-400 bg-blue-400 text-white hover:text-blue-400 hover:bg-white"
            type="submit"
            form="documentsTab-columnsPicker-close_form"
          >
            {t('menu.documentsTab.columnsDialogClose')}
          </button>
        </footer>
      </dialog>
    )
  },
)
