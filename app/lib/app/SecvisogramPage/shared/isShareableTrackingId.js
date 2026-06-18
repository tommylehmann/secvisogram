/**
 * Returns true when the given tracking id is suitable for a shareable
 * permalink: the value must be a non-empty string with no `-TEMP-` segment.
 *
 * Used both to gate the Copy-link button in View.js and to guard URL writes
 * in SecvisogramPage.js so both paths apply the same rule.
 *
 * @param {string | undefined} tid
 * @returns {boolean}
 */
export default function isShareableTrackingId(tid) {
  return typeof tid === 'string' && tid.length > 0 && !tid.includes('-TEMP-')
}
