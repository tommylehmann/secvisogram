import { getLoginEnabledConfig } from '../../fixtures/appConfigData.js'
import { getUserInfo, getUsers } from '../../fixtures/cmsBackendData.js'

const STORAGE_KEY = 'secvisogram.documentsTab.columnVisibility.v1'

/**
 * Builds a list-of-advisories payload tailored to a single sort scenario.
 * Returned objects only carry the fields the View consumes — keeping each
 * scenario self-contained avoids bleeding into the shared fixture.
 *
 * @param {ReadonlyArray<{
 *   advisoryId: string
 *   title: string
 *   workflowState?: string
 *   version?: string | null
 *   currentReleaseDate?: string | null
 * }>} rows
 */
function makeAdvisoryListResponse(rows) {
  return rows.map((row) => {
    /** @type {Record<string, unknown>} */
    const response = {
      advisoryId: row.advisoryId,
      workflowState: row.workflowState ?? 'Draft',
      documentTrackingId: `tracking-${row.advisoryId}`,
      title: row.title,
      owner: 'tester',
      changeable: false,
      deletable: false,
      canCreateVersion: false,
      allowedStateChanges: [],
    }
    if (row.version !== null && row.version !== undefined) {
      response.version = row.version
    }
    if (
      row.currentReleaseDate !== null &&
      row.currentReleaseDate !== undefined
    ) {
      response.currentReleaseDate = row.currentReleaseDate
    }
    return response
  })
}

/**
 * Reads the data-testid of every visible row in document order. Useful when
 * asserting on sort outcomes.
 */
function getOrderedAdvisoryIds() {
  return cy.get('tbody tr[data-testid$="-list_entry"]').then(($rows) => {
    const ids = /** @type {string[]} */ ([])
    $rows.each((_, el) => {
      const testid = el.getAttribute('data-testid')
      if (!testid) return
      const match = testid.match(/^advisory-(.+)-list_entry$/)
      if (match) ids.push(match[1])
    })
    return ids
  })
}

/**
 * Convenience selector for a sort button by column id.
 *
 * @param {string} columnId
 */
function sortButton(columnId) {
  return cy.get(`[data-testid="documentsTab-columnSortButton-${columnId}"]`)
}

/**
 * Convenience selector for a column header `<th>` by column id.
 *
 * @param {string} columnId
 */
function columnHeader(columnId) {
  return cy.get(`[data-testid="documentsTab-columnHeader-${columnId}"]`)
}

/**
 * Convenience selector for a picker checkbox by column id.
 *
 * @param {string} columnId
 */
function pickerCheckbox(columnId) {
  return cy.get(
    `[data-testid="documentsTab-columnsPickerCheckbox-${columnId}"]`,
  )
}

describe('SecvisogramPage / DocumentsTab — columns, sort, persistence', function () {
  const [editor] = getUsers()

  beforeEach(function () {
    // Reset preference state so every test starts from documented defaults.
    cy.clearLocalStorage()
    cy.intercept(
      '/.well-known/appspecific/de.bsi.secvisogram.json',
      getLoginEnabledConfig(),
    ).as('wellKnownAppConfig')
    cy.intercept(getLoginEnabledConfig().userInfoUrl, getUserInfo(editor)).as(
      'apiGetUserInfo',
    )
  })

  describe('TT1 — sort by Document/title', function () {
    const advisories = makeAdvisoryListResponse([
      {
        advisoryId: 'aaaa1111-0000-0000-0000-000000000001',
        title: 'Zeta vulnerability disclosure',
        version: '1.0.0',
        currentReleaseDate: '2023-01-01T00:00:00.000Z',
      },
      {
        advisoryId: 'aaaa1111-0000-0000-0000-000000000002',
        title: 'Alpha vulnerability disclosure',
        version: '1.0.0',
        currentReleaseDate: '2023-02-01T00:00:00.000Z',
      },
      {
        advisoryId: 'aaaa1111-0000-0000-0000-000000000003',
        title: 'Mu vulnerability disclosure',
        version: '1.0.0',
        currentReleaseDate: '2023-03-01T00:00:00.000Z',
      },
    ])

    beforeEach(function () {
      cy.intercept('/api/v1/advisories', advisories).as('apiGetAdvisories')
      cy.visit('?tab=DOCUMENTS')
      cy.wait('@wellKnownAppConfig')
      cy.wait('@apiGetUserInfo')
      cy.wait('@apiGetAdvisories')
    })

    it('cycles unsorted → asc → desc → unsorted (insertion order)', function () {
      // Default: insertion order.
      getOrderedAdvisoryIds().should('deep.equal', [
        'aaaa1111-0000-0000-0000-000000000001',
        'aaaa1111-0000-0000-0000-000000000002',
        'aaaa1111-0000-0000-0000-000000000003',
      ])

      // First click → ascending.
      sortButton('title').click()
      columnHeader('title').should('have.attr', 'aria-sort', 'ascending')
      getOrderedAdvisoryIds().should('deep.equal', [
        'aaaa1111-0000-0000-0000-000000000002', // Alpha
        'aaaa1111-0000-0000-0000-000000000003', // Mu
        'aaaa1111-0000-0000-0000-000000000001', // Zeta
      ])

      // Second click → descending.
      sortButton('title').click()
      columnHeader('title').should('have.attr', 'aria-sort', 'descending')
      getOrderedAdvisoryIds().should('deep.equal', [
        'aaaa1111-0000-0000-0000-000000000001',
        'aaaa1111-0000-0000-0000-000000000003',
        'aaaa1111-0000-0000-0000-000000000002',
      ])

      // Third click → back to insertion order.
      sortButton('title').click()
      columnHeader('title').should('have.attr', 'aria-sort', 'none')
      getOrderedAdvisoryIds().should('deep.equal', [
        'aaaa1111-0000-0000-0000-000000000001',
        'aaaa1111-0000-0000-0000-000000000002',
        'aaaa1111-0000-0000-0000-000000000003',
      ])
    })
  })

  describe('TT2 — sort by Advisory ID', function () {
    const advisories = makeAdvisoryListResponse([
      {
        advisoryId: 'cccc-3333-id',
        title: 'middle row',
        version: '1.0.0',
        currentReleaseDate: '2023-01-01T00:00:00.000Z',
      },
      {
        advisoryId: 'aaaa-1111-id',
        title: 'first sorted row',
        version: '1.0.0',
        currentReleaseDate: '2023-01-01T00:00:00.000Z',
      },
      {
        advisoryId: 'bbbb-2222-id',
        title: 'last in insertion',
        version: '1.0.0',
        currentReleaseDate: '2023-01-01T00:00:00.000Z',
      },
    ])

    beforeEach(function () {
      cy.intercept('/api/v1/advisories', advisories).as('apiGetAdvisories')
      cy.visit('?tab=DOCUMENTS')
      cy.wait('@wellKnownAppConfig')
      cy.wait('@apiGetUserInfo')
      cy.wait('@apiGetAdvisories')
    })

    it('requires enabling the column first, then sorts asc and desc', function () {
      // Column is hidden by default.
      cy.get('[data-testid="documentsTab-columnHeader-advisoryId"]').should(
        'not.exist',
      )

      // Enable via picker.
      cy.get('[data-testid="documentsTab-columnsPickerButton"]').click()
      cy.get('[data-testid="documentsTab-columnsPickerDialog"]').should(
        'be.visible',
      )
      pickerCheckbox('advisoryId').check()
      cy.get(
        '[data-testid="documentsTab-columnsPickerDialog"] button[type="submit"]',
      )
        .last()
        .click()
      cy.get('[data-testid="documentsTab-columnsPickerDialog"]').should(
        'not.exist',
      )

      // Column now visible.
      columnHeader('advisoryId').should('exist')

      // The cell renders the CSAF tracking ID (document.tracking.id),
      // not the CMS-internal UUID — confirms `source: documentTrackingId`.
      cy.get(
        '[data-testid="advisory-aaaa-1111-id-list_entry-advisory_id"]',
      ).should('contain.text', 'tracking-aaaa-1111-id')

      // Sort asc.
      sortButton('advisoryId').click()
      columnHeader('advisoryId').should('have.attr', 'aria-sort', 'ascending')
      getOrderedAdvisoryIds().should('deep.equal', [
        'aaaa-1111-id',
        'bbbb-2222-id',
        'cccc-3333-id',
      ])

      // Sort desc.
      sortButton('advisoryId').click()
      columnHeader('advisoryId').should('have.attr', 'aria-sort', 'descending')
      getOrderedAdvisoryIds().should('deep.equal', [
        'cccc-3333-id',
        'bbbb-2222-id',
        'aaaa-1111-id',
      ])
    })
  })

  describe('TT3 — sort by Last edit time', function () {
    const advisories = makeAdvisoryListResponse([
      {
        advisoryId: 'date-row-newest',
        title: 'newest by date',
        version: '1.0.0',
        currentReleaseDate: '2024-06-15T08:30:00.000Z',
      },
      {
        advisoryId: 'date-row-no-timestamp',
        title: 'no release date',
        version: '1.0.0',
        currentReleaseDate: null, // omitted from response
      },
      {
        advisoryId: 'date-row-oldest',
        title: 'oldest by date',
        version: '1.0.0',
        currentReleaseDate: '2020-01-01T00:00:00.000Z',
      },
      {
        advisoryId: 'date-row-middle',
        title: 'middle by date',
        version: '1.0.0',
        currentReleaseDate: '2022-03-10T12:00:00.000Z',
      },
    ])

    beforeEach(function () {
      cy.intercept('/api/v1/advisories', advisories).as('apiGetAdvisories')
      cy.visit('?tab=DOCUMENTS')
      cy.wait('@wellKnownAppConfig')
      cy.wait('@apiGetUserInfo')
      cy.wait('@apiGetAdvisories')
    })

    it('orders chronologically in both directions; rows without a date go last in both', function () {
      // Ascending — earliest first, missing last.
      sortButton('lastEdit').click()
      columnHeader('lastEdit').should('have.attr', 'aria-sort', 'ascending')
      getOrderedAdvisoryIds().should('deep.equal', [
        'date-row-oldest',
        'date-row-middle',
        'date-row-newest',
        'date-row-no-timestamp',
      ])

      // Descending — newest first, missing still last.
      sortButton('lastEdit').click()
      columnHeader('lastEdit').should('have.attr', 'aria-sort', 'descending')
      getOrderedAdvisoryIds().should('deep.equal', [
        'date-row-newest',
        'date-row-middle',
        'date-row-oldest',
        'date-row-no-timestamp',
      ])
    })
  })

  describe('TT4 — sort by Version', function () {
    it('orders semver values by semver precedence', function () {
      cy.intercept(
        '/api/v1/advisories',
        makeAdvisoryListResponse([
          {
            advisoryId: 'sv-row-c',
            title: 'c',
            version: '1.0.1',
            currentReleaseDate: '2023-01-01T00:00:00.000Z',
          },
          {
            advisoryId: 'sv-row-a',
            title: 'a',
            version: '0.0.3',
            currentReleaseDate: '2023-01-01T00:00:00.000Z',
          },
          {
            advisoryId: 'sv-row-b',
            title: 'b',
            version: '2.0.0',
            currentReleaseDate: '2023-01-01T00:00:00.000Z',
          },
        ]),
      ).as('apiGetAdvisories')

      cy.visit('?tab=DOCUMENTS')
      cy.wait('@wellKnownAppConfig')
      cy.wait('@apiGetUserInfo')
      cy.wait('@apiGetAdvisories')

      sortButton('version').click()
      getOrderedAdvisoryIds().should('deep.equal', [
        'sv-row-a', // 0.0.3
        'sv-row-c', // 1.0.1
        'sv-row-b', // 2.0.0
      ])

      sortButton('version').click()
      getOrderedAdvisoryIds().should('deep.equal', [
        'sv-row-b',
        'sv-row-c',
        'sv-row-a',
      ])
    })

    it('orders all-integer version strings numerically (not lexicographically)', function () {
      cy.intercept(
        '/api/v1/advisories',
        makeAdvisoryListResponse([
          {
            advisoryId: 'int-row-10',
            title: 'ten',
            version: '10',
            currentReleaseDate: '2023-01-01T00:00:00.000Z',
          },
          {
            advisoryId: 'int-row-1',
            title: 'one',
            version: '1',
            currentReleaseDate: '2023-01-01T00:00:00.000Z',
          },
          {
            advisoryId: 'int-row-2',
            title: 'two',
            version: '2',
            currentReleaseDate: '2023-01-01T00:00:00.000Z',
          },
        ]),
      ).as('apiGetAdvisories')

      cy.visit('?tab=DOCUMENTS')
      cy.wait('@wellKnownAppConfig')
      cy.wait('@apiGetUserInfo')
      cy.wait('@apiGetAdvisories')

      sortButton('version').click()
      getOrderedAdvisoryIds().should('deep.equal', [
        'int-row-1',
        'int-row-2',
        'int-row-10',
      ])
    })

    it('sorts missing/empty versions last in both directions, with mixed schemes falling back', function () {
      cy.intercept(
        '/api/v1/advisories',
        makeAdvisoryListResponse([
          {
            advisoryId: 'mix-row-semver',
            title: 's',
            version: '1.0.0',
            currentReleaseDate: '2023-01-01T00:00:00.000Z',
          },
          {
            advisoryId: 'mix-row-empty',
            title: 'e',
            version: null,
            currentReleaseDate: '2023-01-01T00:00:00.000Z',
          },
          {
            advisoryId: 'mix-row-integer',
            title: 'i',
            version: '2',
            currentReleaseDate: '2023-01-01T00:00:00.000Z',
          },
        ]),
      ).as('apiGetAdvisories')

      cy.visit('?tab=DOCUMENTS')
      cy.wait('@wellKnownAppConfig')
      cy.wait('@apiGetUserInfo')
      cy.wait('@apiGetAdvisories')

      sortButton('version').click()
      // Ascending: the two present values compare via locale-numeric string
      // compare ("1.0.0" vs "2"). With Intl.Collator { numeric: true } that
      // yields "1.0.0" < "2". The empty row sorts last in both directions.
      getOrderedAdvisoryIds().should('deep.equal', [
        'mix-row-semver',
        'mix-row-integer',
        'mix-row-empty',
      ])

      sortButton('version').click()
      getOrderedAdvisoryIds().should('deep.equal', [
        'mix-row-integer',
        'mix-row-semver',
        'mix-row-empty',
      ])
    })
  })

  describe('TT5 — column-visibility persistence', function () {
    const advisories = makeAdvisoryListResponse([
      {
        advisoryId: 'persist-1',
        title: 'persisted title',
        version: '1.0.0',
        currentReleaseDate: '2023-01-01T00:00:00.000Z',
      },
    ])

    beforeEach(function () {
      cy.intercept('/api/v1/advisories', advisories).as('apiGetAdvisories')
    })

    it('keeps the user’s choice across a hard reload', function () {
      cy.visit('?tab=DOCUMENTS')
      cy.wait('@wellKnownAppConfig')
      cy.wait('@apiGetUserInfo')
      cy.wait('@apiGetAdvisories')

      // Workflow State is visible by default.
      columnHeader('workflowState').should('exist')

      // Hide it via the picker.
      cy.get('[data-testid="documentsTab-columnsPickerButton"]').click()
      pickerCheckbox('workflowState').uncheck()
      cy.get(
        '[data-testid="documentsTab-columnsPickerDialog"] button[type="submit"]',
      )
        .last()
        .click()

      cy.get('[data-testid="documentsTab-columnHeader-workflowState"]').should(
        'not.exist',
      )

      // Persistence in storage.
      cy.window().then((win) => {
        const raw = win.localStorage.getItem(STORAGE_KEY)
        expect(raw, 'storage payload').to.not.be.null
        const parsed = JSON.parse(/** @type {string} */ (raw))
        expect(parsed.workflowState).to.equal(false)
      })

      // Hard reload — value still respected.
      cy.reload()
      cy.wait('@wellKnownAppConfig')
      cy.wait('@apiGetUserInfo')
      cy.wait('@apiGetAdvisories')
      cy.get('[data-testid="documentsTab-columnHeader-workflowState"]').should(
        'not.exist',
      )
    })

    it('disables the last visible data column’s checkbox so it cannot be hidden', function () {
      cy.visit('?tab=DOCUMENTS')
      cy.wait('@wellKnownAppConfig')
      cy.wait('@apiGetUserInfo')
      cy.wait('@apiGetAdvisories')

      cy.get('[data-testid="documentsTab-columnsPickerButton"]').click()

      // Hide every data column except `title`.
      pickerCheckbox('version').uncheck()
      pickerCheckbox('lastEdit').uncheck()
      pickerCheckbox('workflowState').uncheck()

      // The last remaining data column's checkbox is now disabled.
      pickerCheckbox('title').should('be.disabled').and('be.checked')

      // Action-kind columns (stateAction) are not data columns and remain
      // toggleable.
      pickerCheckbox('stateAction').should('not.be.disabled')
    })
  })

  describe('TT6 — localStorage unavailable', function () {
    const advisories = makeAdvisoryListResponse([
      {
        advisoryId: 'no-storage-1',
        title: 'still rendered',
        version: '1.0.0',
        currentReleaseDate: '2023-01-01T00:00:00.000Z',
      },
    ])

    it('renders defaults and lets the user toggle for the session even when setItem throws', function () {
      cy.intercept('/api/v1/advisories', advisories).as('apiGetAdvisories')
      // No console errors should bubble up.
      const consoleErrorSpy = cy.spy().as('consoleError')

      cy.visit('?tab=DOCUMENTS', {
        onBeforeLoad(win) {
          const realGetItem = win.localStorage.getItem.bind(win.localStorage)
          // Both reads and writes raise — defensive code should swallow both.
          cy.stub(win.localStorage, 'setItem').callsFake(() => {
            throw new Error('QuotaExceededError (test stub)')
          })
          cy.stub(win.localStorage, 'getItem').callsFake((key) => {
            if (key === STORAGE_KEY) {
              throw new Error('Access denied (test stub)')
            }
            return realGetItem(key)
          })
          cy.stub(win.console, 'error').callsFake(consoleErrorSpy)
        },
      })
      cy.wait('@wellKnownAppConfig')
      cy.wait('@apiGetUserInfo')
      cy.wait('@apiGetAdvisories')

      // Defaults applied — Workflow State column visible (per spec §4).
      columnHeader('workflowState').should('exist')

      // Toggling still works for the session even though writes throw.
      cy.get('[data-testid="documentsTab-columnsPickerButton"]').click()
      pickerCheckbox('workflowState').uncheck()
      cy.get(
        '[data-testid="documentsTab-columnsPickerDialog"] button[type="submit"]',
      )
        .last()
        .click()
      cy.get('[data-testid="documentsTab-columnHeader-workflowState"]').should(
        'not.exist',
      )

      // No uncaught console.error from the persistence failure (a console.warn
      // is allowed and not asserted on here).
      cy.get('@consoleError').should('not.have.been.called')
    })
  })

  describe('TT7 — accessibility of sort headers', function () {
    const advisories = makeAdvisoryListResponse([
      {
        advisoryId: 'a11y-1',
        title: 'first',
        version: '1.0.0',
        currentReleaseDate: '2023-01-01T00:00:00.000Z',
      },
      {
        advisoryId: 'a11y-2',
        title: 'second',
        version: '1.0.0',
        currentReleaseDate: '2023-01-02T00:00:00.000Z',
      },
    ])

    beforeEach(function () {
      cy.intercept('/api/v1/advisories', advisories).as('apiGetAdvisories')
      cy.visit('?tab=DOCUMENTS')
      cy.wait('@wellKnownAppConfig')
      cy.wait('@apiGetUserInfo')
      cy.wait('@apiGetAdvisories')
    })

    it('exposes aria-sort in all three states across sortable headers', function () {
      // No sort applied yet — every sortable header reports `none`.
      for (const id of ['title', 'version', 'lastEdit', 'workflowState']) {
        columnHeader(id).should('have.attr', 'aria-sort', 'none')
      }

      // Active asc.
      sortButton('title').click()
      columnHeader('title').should('have.attr', 'aria-sort', 'ascending')
      // Other sortable headers still report `none`.
      columnHeader('version').should('have.attr', 'aria-sort', 'none')

      // Active desc.
      sortButton('title').click()
      columnHeader('title').should('have.attr', 'aria-sort', 'descending')

      // Non-sortable headers must not declare an aria-sort value at all (the
      // attribute should be absent rather than set to `none`).
      columnHeader('stateAction').should('not.have.attr', 'aria-sort')
      columnHeader('rowActions').should('not.have.attr', 'aria-sort')
    })

    it('renders sort headers as focusable native buttons (Enter/Space activates them via the platform)', function () {
      // The semantic guarantee in the spec is "render as <button> inside <th>"
      // — native buttons receive Enter/Space activation from the platform for
      // free, so testing the structure is the meaningful contract.
      sortButton('title')
        .should('have.prop', 'tagName', 'BUTTON')
        .and('not.have.attr', 'disabled')
      sortButton('title').focus()
      sortButton('title').should('be.focused')

      // Triggering the button's click handler (the same path the browser uses
      // when Enter is pressed on a focused button) must cycle aria-sort.
      sortButton('title').click()
      columnHeader('title').should('have.attr', 'aria-sort', 'ascending')
      sortButton('title').click()
      columnHeader('title').should('have.attr', 'aria-sort', 'descending')
      sortButton('title').click()
      columnHeader('title').should('have.attr', 'aria-sort', 'none')
    })
  })
})
