import { t } from 'i18next'
import React from 'react'
import AppErrorContext from '../../shared/context/AppErrorContext.js'
import HistoryContext from '../../shared/context/HistoryContext.js'
import sitemap from '../../shared/sitemap.js'
import { columns as columnDefinitions } from './columns.js'
import useColumnVisibility from './useColumnVisibility.js'
import useSort from './useSort.js'
import LoadingIndicator from '../View/LoadingIndicator.js'
import Alert from '../View/shared/Alert.js'
import ColumnsPickerDialog from './View/ColumnsPickerDialog.js'
import EditWorkflowStateDialog from './View/EditWorkflowStateDialog.js'

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/**
 * @param {string | undefined} value
 * @returns {string}
 */
function formatLastEdit(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return t('menu.documentsTab.empty')
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return t('menu.documentsTab.empty')
  }
  return dateTimeFormatter.format(date)
}

/**
 * @param {string | undefined} value
 * @returns {string}
 */
function formatVersion(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return t('menu.documentsTab.empty')
  }
  return value
}

/**
 * @param {import('./View/types.js').Props} props
 * @returns
 */
export default function DocumentsTabView({
  defaultData = null,
  onOpenAdvisory,
  onGetData,
  onDeleteAdvisory,
  onChangeWorkflowState,
  onCreateNewVersion,
}) {
  const history = React.useContext(HistoryContext)
  const { handleError } = React.useContext(AppErrorContext)

  const [alert, setAlert] = React.useState(
    /** @type {React.ComponentProps<typeof Alert> | null} */ (null),
  )
  const [data, setData] = React.useState(defaultData)
  const [isLoading, setLoading] = React.useState(!defaultData)

  const { visibility, setColumnVisible } = useColumnVisibility()

  const visibleColumns = React.useMemo(
    () => columnDefinitions.filter((column) => visibility[column.id]),
    [visibility],
  )

  const advisories = data?.advisories ?? []
  const { sortedRows, sort, toggleSort } = useSort(advisories)

  const [editWorkflowStateDialogProps, setEditWorkflowStateDialogProps] =
    React.useState(
      /** @type {React.ComponentProps<typeof EditWorkflowStateDialog> | null} */ (
        null
      ),
    )
  /** @type {React.MutableRefObject<any>} */
  const editWorkflowStateDialogRef = React.useRef()
  React.useEffect(() => {
    if (editWorkflowStateDialogProps) {
      editWorkflowStateDialogRef.current.showModal()
    }
  }, [editWorkflowStateDialogProps])

  const [isColumnsPickerOpen, setColumnsPickerOpen] = React.useState(false)
  /** @type {React.MutableRefObject<any>} */
  const columnsPickerDialogRef = React.useRef()
  React.useEffect(() => {
    if (isColumnsPickerOpen) {
      columnsPickerDialogRef.current.showModal()
    }
  }, [isColumnsPickerOpen])

  React.useEffect(() => {
    let active = true

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    onGetData()
      .then((data) => {
        if (!active) return
        setData(data)
      })
      .catch(handleError)
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [onGetData, handleError])

  /**
   * @param {object} params
   * @param {string} params.advisoryId
   */
  const onEditAdvisory = ({ advisoryId }) => {
    onOpenAdvisory({ advisoryId }, () => {
      history.pushState(null, '', sitemap.home.href([['tab', 'EDITOR']]))
    })
  }

  return (
    <>
      {editWorkflowStateDialogProps && (
        <EditWorkflowStateDialog
          {...editWorkflowStateDialogProps}
          ref={editWorkflowStateDialogRef}
        />
      )}
      {isColumnsPickerOpen && (
        <ColumnsPickerDialog
          ref={columnsPickerDialogRef}
          columns={columnDefinitions}
          visibility={visibility}
          onToggle={setColumnVisible}
          onClose={() => setColumnsPickerOpen(false)}
        />
      )}
      <div className="bg-white h-full">
        {isLoading ? (
          <LoadingIndicator label={t('menu.loading')} />
        ) : (
          <>
            <div className="pt-4 mx-auto w-full max-w-4xl">
              <div className="flex justify-end pb-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 py-1 px-2 rounded border border-gray-300 hover:bg-gray-100"
                  aria-haspopup="dialog"
                  aria-label={t('menu.documentsTab.columnsButton')}
                  data-testid="documentsTab-columnsPickerButton"
                  onClick={() => setColumnsPickerOpen(true)}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                  {t('menu.documentsTab.columnsButton')}
                </button>
              </div>
              <table className="border w-full">
                <thead>
                  <tr className="bg-gray-200 text-left">
                    {visibleColumns.map((column) => (
                      <HeaderCell
                        key={column.id}
                        column={column}
                        sort={sort}
                        onToggleSort={toggleSort}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((advisory) => (
                    <tr
                      key={advisory.advisoryId}
                      data-testid={`advisory-${advisory.advisoryId}-list_entry`}
                    >
                      {visibleColumns.map((column) => (
                        <td className="p-2" key={column.id}>
                          {renderCell({
                            column,
                            advisory,
                            onEditAdvisory,
                            onCreateNewVersion,
                            onChangeWorkflowState,
                            onGetData,
                            setData,
                            setLoading,
                            setAlert,
                            setEditWorkflowStateDialogProps,
                            onDeleteAdvisory,
                            handleError,
                          })}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isLoading && <LoadingIndicator label="Loading ..." />}
          </>
        )}
        {alert && <Alert {...alert} />}
      </div>
    </>
  )
}

/**
 * @param {object} params
 * @param {import('./columns.js').ColumnDefinition} params.column
 * @param {import('./useSort.js').SortState | null} params.sort
 * @param {(columnId: string) => void} params.onToggleSort
 */
function HeaderCell({ column, sort, onToggleSort }) {
  const isActive = sort?.columnId === column.id
  const ariaSort = !column.sortable
    ? undefined
    : isActive
      ? sort.direction === 'asc'
        ? 'ascending'
        : 'descending'
      : 'none'
  const label =
    column.id === 'rowActions' || !column.labelKey ? '' : t(column.labelKey)
  const nextSortAnnouncement = !column.sortable
    ? ''
    : !isActive
      ? t('menu.documentsTab.sortNone')
      : sort.direction === 'asc'
        ? t('menu.documentsTab.sortAscending')
        : t('menu.documentsTab.sortDescending')

  return (
    <th
      className="p-2"
      aria-sort={ariaSort}
      data-testid={`documentsTab-columnHeader-${column.id}`}
      scope="col"
    >
      {column.sortable ? (
        <button
          type="button"
          className="font-bold inline-flex items-center gap-1"
          data-testid={`documentsTab-columnSortButton-${column.id}`}
          onClick={() => onToggleSort(column.id)}
        >
          <span>{label}</span>
          <span aria-hidden="true" className={isActive ? 'text-blue-600' : ''}>
            {isActive ? (sort.direction === 'asc' ? '▲' : '▼') : ''}
          </span>
          <span className="sr-only">, {nextSortAnnouncement}</span>
        </button>
      ) : (
        label
      )}
    </th>
  )
}

/**
 * @param {object} params
 * @param {import('./columns.js').ColumnDefinition} params.column
 * @param {any} params.advisory
 * @param {(params: { advisoryId: string }) => void} params.onEditAdvisory
 * @param {(params: { advisoryId: string }) => Promise<void>} params.onCreateNewVersion
 * @param {(params: { advisoryId: string; workflowState: string; documentTrackingStatus: string | null; proposedTime: Date | null }) => Promise<void>} params.onChangeWorkflowState
 * @param {() => Promise<any>} params.onGetData
 * @param {(data: any) => void} params.setData
 * @param {(loading: boolean) => void} params.setLoading
 * @param {(alert: any) => void} params.setAlert
 * @param {(props: any) => void} params.setEditWorkflowStateDialogProps
 * @param {(params: { advisoryId: string }) => Promise<void>} params.onDeleteAdvisory
 * @param {(err: any) => void} params.handleError
 */
function renderCell({
  column,
  advisory,
  onEditAdvisory,
  onCreateNewVersion,
  onChangeWorkflowState,
  onGetData,
  setData,
  setLoading,
  setAlert,
  setEditWorkflowStateDialogProps,
  onDeleteAdvisory,
  handleError,
}) {
  switch (column.id) {
    case 'title':
      return (
        <button
          className="underline"
          data-testid={`advisory-${advisory.advisoryId}-list_entry-open_button`}
          type="button"
          onClick={() => {
            onEditAdvisory({ advisoryId: advisory.advisoryId })
          }}
        >
          {advisory.title}
        </button>
      )
    case 'advisoryId':
      return (
        <span
          className="font-mono truncate block"
          data-testid={`advisory-${advisory.advisoryId}-list_entry-advisory_id`}
          title={advisory.documentTrackingId}
        >
          {advisory.documentTrackingId}
        </span>
      )
    case 'version':
      return (
        <span
          data-testid={`advisory-${advisory.advisoryId}-list_entry-version`}
        >
          {formatVersion(advisory.version)}
        </span>
      )
    case 'lastEdit':
      return (
        <span
          data-testid={`advisory-${advisory.advisoryId}-list_entry-last_edit`}
        >
          {formatLastEdit(advisory.lastEdit)}
        </span>
      )
    case 'workflowState':
      return (
        <span
          className="block"
          data-testid={`advisory-${advisory.advisoryId}-list_entry-workflow_state`}
        >
          {advisory.workflowState}
        </span>
      )
    case 'stateAction':
      if (advisory.canCreateVersion) {
        return (
          <button
            className="underline"
            type="button"
            data-testid={`advisory-${advisory.advisoryId}-list_entry-create_new_version_button`}
            onClick={() => {
              setLoading(true)
              onCreateNewVersion({
                advisoryId: advisory.advisoryId,
              })
                .then(async () => {
                  setData(await onGetData())
                })
                .catch(handleError)
                .finally(() => {
                  setLoading(false)
                })
            }}
          >
            Create new version
          </button>
        )
      }
      if (advisory.allowedStateChanges.length) {
        return (
          <button
            className="underline"
            type="button"
            data-testid={`advisory-${advisory.advisoryId}-list_entry-edit_workflow_state_button`}
            onClick={() => {
              setEditWorkflowStateDialogProps({
                data: {
                  advisoryId: advisory.advisoryId,
                  allowedStateChanges: advisory.allowedStateChanges,
                  currentReleaseDate: advisory.currentReleaseDate,
                },
                /**
                 * @param {{ workflowState: string; documentTrackingStatus: string | null; proposedTime: Date | null }} params
                 */
                onSubmit({
                  workflowState,
                  documentTrackingStatus,
                  proposedTime,
                }) {
                  setLoading(true)
                  onChangeWorkflowState({
                    advisoryId: advisory.advisoryId,
                    workflowState,
                    documentTrackingStatus,
                    proposedTime,
                  })
                    .then(async () => {
                      setData(await onGetData())
                    })
                    .catch(handleError)
                    .finally(() => {
                      setLoading(false)
                    })
                },
                onClose: () => setEditWorkflowStateDialogProps(null),
              })
            }}
          >
            Edit
          </button>
        )
      }
      return null
    case 'rowActions':
      return (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => {
              onEditAdvisory({
                advisoryId: advisory.advisoryId,
              })
            }}
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
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
          {advisory.deletable && (
            <button
              data-testid={`advisory-${advisory.advisoryId}-list_entry-delete_button`}
              onClick={() => {
                setAlert({
                  description: t('menu.reallyDeleteAdvisory'),
                  cancelLabel: t('menu.cancel'),
                  confirmLabel: t('menu.delete'),
                  onCancel() {
                    setAlert(null)
                  },
                  onConfirm() {
                    setAlert(null)
                    setLoading(true)
                    onDeleteAdvisory({
                      advisoryId: advisory.advisoryId,
                    })
                      .then(async () => {
                        setData(await onGetData())
                      })
                      .catch(handleError)
                      .finally(() => {
                        setLoading(false)
                      })
                  },
                })
              }}
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
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
        </div>
      )
    default:
      return null
  }
}
