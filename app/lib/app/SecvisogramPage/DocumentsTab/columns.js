import semver from 'semver'

/**
 * @typedef {'string' | 'date' | 'version' | 'action'} ColumnKind
 */

/**
 * @typedef {object} ColumnDefinition
 * @property {string} id
 * @property {string} labelKey
 * @property {boolean} defaultVisible
 * @property {boolean} sortable
 * @property {ColumnKind} kind
 */

/**
 * Ordered list of columns rendered in the Documents tab. The order of this
 * array drives both the column-picker order and the visible column order.
 *
 * @type {ReadonlyArray<ColumnDefinition>}
 */
export const columns = Object.freeze([
  {
    id: 'title',
    labelKey: 'menu.documentsTab.columns.title',
    defaultVisible: true,
    sortable: true,
    kind: 'string',
  },
  {
    id: 'advisoryId',
    labelKey: 'menu.documentsTab.columns.advisoryId',
    defaultVisible: false,
    sortable: true,
    kind: 'string',
  },
  {
    id: 'version',
    labelKey: 'menu.documentsTab.columns.version',
    defaultVisible: true,
    sortable: true,
    kind: 'version',
  },
  {
    id: 'lastEdit',
    labelKey: 'menu.documentsTab.columns.lastEdit',
    defaultVisible: true,
    sortable: true,
    kind: 'date',
  },
  {
    id: 'workflowState',
    labelKey: 'menu.documentsTab.columns.workflowState',
    defaultVisible: true,
    sortable: true,
    kind: 'string',
  },
  {
    id: 'stateAction',
    labelKey: 'menu.documentsTab.columns.stateAction',
    defaultVisible: true,
    sortable: false,
    kind: 'action',
  },
  {
    id: 'rowActions',
    labelKey: 'menu.documentsTab.columns.rowActions',
    defaultVisible: true,
    sortable: false,
    kind: 'action',
  },
])

/**
 * Default visibility map derived from the column descriptors.
 *
 * @returns {Record<string, boolean>}
 */
export function getDefaultVisibility() {
  /** @type {Record<string, boolean>} */
  const map = {}
  for (const column of columns) {
    map[column.id] = column.defaultVisible
  }
  return map
}

const collator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
})

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPresentString(value) {
  return typeof value === 'string' && value.length > 0
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number}
 */
function compareStrings(a, b) {
  const aPresent = isPresentString(a)
  const bPresent = isPresentString(b)
  if (!aPresent && !bPresent) return 0
  if (!aPresent) return 1
  if (!bPresent) return -1
  return collator.compare(/** @type {string} */ (a), /** @type {string} */ (b))
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function parseDate(value) {
  if (typeof value !== 'string' || value.length === 0) return NaN
  return new Date(value).getTime()
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number}
 */
function compareDates(a, b) {
  const aTime = parseDate(a)
  const bTime = parseDate(b)
  const aValid = Number.isFinite(aTime)
  const bValid = Number.isFinite(bTime)
  if (!aValid && !bValid) return 0
  if (!aValid) return 1
  if (!bValid) return -1
  return aTime - bTime
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number}
 */
function compareVersions(a, b) {
  const aPresent = isPresentString(a)
  const bPresent = isPresentString(b)
  if (!aPresent && !bPresent) return 0
  if (!aPresent) return 1
  if (!bPresent) return -1
  const aStr = /** @type {string} */ (a)
  const bStr = /** @type {string} */ (b)
  if (semver.valid(aStr) && semver.valid(bStr)) {
    return semver.compare(aStr, bStr)
  }
  const aNum = Number(aStr)
  const bNum = Number(bStr)
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
    return aNum - bNum
  }
  return collator.compare(aStr, bStr)
}

/**
 * Build a comparator that orders advisory rows by the given column.
 *
 * Missing or unparseable values always sort to the end, regardless of
 * `direction`. The comparator inverts the sign of "present vs present"
 * comparisons when `direction === 'desc'`, while keeping the "missing rows
 * last" rule constant in both directions.
 *
 * @param {string} columnId
 * @param {'asc' | 'desc'} [direction]
 * @returns {(a: Record<string, unknown>, b: Record<string, unknown>) => number}
 */
export function getComparator(columnId, direction = 'asc') {
  const column = columns.find((c) => c.id === columnId)
  if (!column || !column.sortable) {
    return () => 0
  }
  const sign = direction === 'desc' ? -1 : 1
  switch (column.kind) {
    case 'date':
      return (a, b) =>
        directionalCompare(
          a[columnId],
          b[columnId],
          sign,
          compareDates,
          isDatePresent,
        )
    case 'version':
      return (a, b) =>
        directionalCompare(
          a[columnId],
          b[columnId],
          sign,
          compareVersions,
          isPresentString,
        )
    case 'string':
    default:
      return (a, b) =>
        directionalCompare(
          a[columnId],
          b[columnId],
          sign,
          compareStrings,
          isPresentString,
        )
  }
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isDatePresent(value) {
  return Number.isFinite(parseDate(value))
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @param {1 | -1} sign
 * @param {(a: unknown, b: unknown) => number} compare
 * @param {(value: unknown) => boolean} isPresent
 * @returns {number}
 */
function directionalCompare(a, b, sign, compare, isPresent) {
  const aPresent = isPresent(a)
  const bPresent = isPresent(b)
  if (!aPresent && !bPresent) return 0
  if (!aPresent) return 1
  if (!bPresent) return -1
  return sign * compare(a, b)
}
