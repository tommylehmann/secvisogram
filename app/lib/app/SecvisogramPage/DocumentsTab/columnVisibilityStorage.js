/**
 * localStorage helpers for the Documents-tab column visibility map.
 *
 * Both helpers are defensive: malformed JSON, blocked storage, or a quota
 * exhaustion never throws to the caller. Persistence failure is logged via
 * `console.warn` only — a toast would be too loud for a preference.
 */

export const STORAGE_KEY = 'secvisogram.documentsTab.columnVisibility.v1'

/**
 * @param {Record<string, boolean>} defaults
 * @returns {Record<string, boolean>}
 */
export function loadColumnVisibility(defaults) {
  /** @type {Storage | undefined} */
  let storage
  try {
    storage = typeof window === 'undefined' ? undefined : window.localStorage
  } catch (_err) {
    // Accessing `window.localStorage` itself can throw when storage is fully
    // disabled (e.g. some Safari private-mode configurations).
    return { ...defaults }
  }
  if (!storage) return { ...defaults }

  let raw
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch (_err) {
    return { ...defaults }
  }
  if (raw === null) return { ...defaults }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (_err) {
    return { ...defaults }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ...defaults }
  }

  /** @type {Record<string, boolean>} */
  const merged = { ...defaults }
  for (const id of Object.keys(defaults)) {
    const value = /** @type {Record<string, unknown>} */ (parsed)[id]
    if (typeof value === 'boolean') {
      merged[id] = value
    }
  }
  return merged
}

/**
 * @param {Record<string, boolean>} visibility
 */
export function saveColumnVisibility(visibility) {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility))
  } catch (err) {
    console.warn(
      'Failed to persist Documents-tab column visibility to localStorage.',
      err,
    )
  }
}
