import { backend } from '../../shared/api.js'

export async function getData() {
  const advisories = await backend.getAdvisories()
  // Normalise into a stable view shape. The CMS backend may not yet expose
  // `version` (see questions.md Q1) and there is no separate edit timestamp
  // field; until the backend exposes a dedicated last-modification time we
  // alias `currentReleaseDate` as `lastEdit`.
  const normalised = advisories.map(
    (/** @type {Record<string, unknown>} */ advisory) => ({
      ...advisory,
      version:
        typeof advisory.version === 'string' ? advisory.version : undefined,
      lastEdit:
        typeof advisory.currentReleaseDate === 'string'
          ? advisory.currentReleaseDate
          : undefined,
    }),
  )
  return { advisories: normalised }
}

/**
 * @param {object} params
 * @param {string} params.advisoryId
 */
export async function deleteAdvisory({ advisoryId }) {
  const advisoryDetail = await backend.getAdvisoryDetail({ advisoryId })
  await backend.deleteAdvisory({
    advisoryId,
    revision: advisoryDetail.revision,
  })
}

/**
 * @param {object} params
 * @param {string} params.advisoryId
 * @param {string} params.workflowState
 * @param {string | null} params.documentTrackingStatus
 * @param {Date | null} params.proposedTime
 */
export async function changeWorkflowState({
  advisoryId,
  workflowState,
  documentTrackingStatus,
  proposedTime,
}) {
  const { revision } = await backend.getAdvisoryDetail({ advisoryId })
  await backend.changeWorkflowState({
    advisoryId,
    revision,
    workflowState,
    documentTrackingStatus,
    proposedTime,
  })
}
