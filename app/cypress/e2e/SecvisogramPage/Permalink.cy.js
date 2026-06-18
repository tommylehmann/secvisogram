import { getLoginEnabledConfig } from '../../fixtures/appConfigData.js'
import {
  getGetAdvisoriesResponse,
  getUserInfo,
  getUsers,
} from '../../fixtures/cmsBackendData.js'

/**
 * Fixture advisory with a proper csaf.document.tracking.id so the permalink
 * feature can read advisory.csaf.document.tracking.id.
 */
const ADVISORY_ID = '11111111-1111-1111-1111-111111111111'
const TRACKING_ID = 'TEST-2024-0001'
const TRACKING_ID_WITH_SPACE = 'TEST ADVISORY 2024'
const TEMP_ADVISORY_ID = '22222222-2222-2222-2222-222222222222'
const TEMP_TRACKING_ID = 'TEST-TEMP-2024-001-0001'

/** Build an advisory detail response with a known tracking id. */
function makeAdvisoryDetail(
  advisoryId = ADVISORY_ID,
  trackingId = TRACKING_ID,
) {
  return {
    advisoryId,
    workflowState: 'Draft',
    documentTrackingId: trackingId,
    title: 'Permalink Test Advisory',
    owner: 'Tester',
    changeable: true,
    deletable: false,
    revision: '1-abc123',
    csaf: {
      document: {
        title: 'Permalink Test Advisory',
        tracking: {
          id: trackingId,
          status: 'draft',
          version: '1',
          initial_release_date: '2024-01-01T00:00:00.000Z',
          current_release_date: '2024-01-01T00:00:00.000Z',
          revision_history: [
            {
              number: '1',
              date: '2024-01-01T00:00:00.000Z',
              summary: 'Initial',
            },
          ],
        },
      },
    },
  }
}

/** Resolution response: one entry carrying the matching advisoryId. */
function makeResolutionList(advisoryId = ADVISORY_ID) {
  return [
    {
      advisoryId,
      workflowState: 'Draft',
      documentTrackingId: TRACKING_ID,
      title: 'Permalink Test Advisory',
      owner: 'Tester',
      changeable: true,
      deletable: false,
      revision: '1-abc123',
    },
  ]
}

const user = getUsers()[0]
const loginConfig = getLoginEnabledConfig()

function interceptLoginEnabled() {
  cy.intercept(
    '/.well-known/appspecific/de.bsi.secvisogram.json',
    loginConfig,
  ).as('wellKnownAppConfig')
}

function interceptUserInfo(/** @type {any} */ statusOrBody) {
  if (typeof statusOrBody === 'number') {
    cy.intercept(loginConfig.userInfoUrl, {
      statusCode: statusOrBody,
    }).as('apiGetUserInfo')
  } else {
    cy.intercept(loginConfig.userInfoUrl, getUserInfo(statusOrBody)).as(
      'apiGetUserInfo',
    )
  }
}

/**
 * Intercept the tracking-id resolution request.
 * The URL is /api/v1/advisories?expression=<JSON-encoded filter>.
 * We match on the query parameter being present using a regex.
 */
function interceptResolution(
  advisoryId = ADVISORY_ID,
  alias = 'apiResolveTrackingId',
) {
  cy.intercept(
    { method: 'GET', url: /\/api\/v1\/advisories\?expression=/ },
    makeResolutionList(advisoryId),
  ).as(alias)
}

function interceptEmptyResolution(alias = 'apiResolveTrackingIdEmpty') {
  cy.intercept(
    { method: 'GET', url: /\/api\/v1\/advisories\?expression=/ },
    [],
  ).as(alias)
}

function interceptAdvisoryDetail(
  /** @type {string} */ advisoryId,
  /** @type {any} */ detail,
) {
  cy.intercept(
    `/api/v1/advisories/${advisoryId}`,
    detail ?? makeAdvisoryDetail(advisoryId),
  ).as('apiGetAdvisoryDetail')
}

describe('SecvisogramPage / Permalink', function () {
  // -------------------------------------------------------------------------
  // AC1: Valid permalink loads advisory and shows loading indicator
  // -------------------------------------------------------------------------
  it('AC1: visiting a valid permalink resolves and opens the advisory', function () {
    interceptLoginEnabled()
    interceptUserInfo(user)
    interceptResolution(ADVISORY_ID)
    interceptAdvisoryDetail(ADVISORY_ID, undefined)

    cy.visit(`?tab=EDITOR&trackingId=${encodeURIComponent(TRACKING_ID)}`)
    cy.wait('@wellKnownAppConfig')
    cy.wait('@apiGetUserInfo')
    cy.wait('@apiResolveTrackingId')
    cy.wait('@apiGetAdvisoryDetail')
    cy.get('[data-testid="loading_indicator"]').should('not.exist')

    // The advisory_id span must carry the internal UUID once the advisory is open
    cy.get('[data-testid="advisory_id"]').should('have.text', ADVISORY_ID)
  })

  // -------------------------------------------------------------------------
  // AC2: Opening from Documents tab updates URL to include trackingId
  // -------------------------------------------------------------------------
  it('AC2: opening an advisory from the Documents tab writes trackingId to the URL', function () {
    interceptLoginEnabled()
    interceptUserInfo(user)
    cy.intercept('/api/v1/advisories', getGetAdvisoriesResponse()).as(
      'apiGetAdvisories',
    )

    const firstAdvisory = getGetAdvisoriesResponse()[0]
    // Provide a detail fixture that carries a proper csaf.document.tracking.id
    cy.intercept(
      `/api/v1/advisories/${firstAdvisory.advisoryId}`,
      makeAdvisoryDetail(
        firstAdvisory.advisoryId,
        firstAdvisory.documentTrackingId,
      ),
    ).as('apiGetFirstAdvisoryDetail')

    cy.visit('?tab=DOCUMENTS')
    cy.wait('@wellKnownAppConfig')
    cy.wait('@apiGetUserInfo')
    cy.wait('@apiGetAdvisories')

    cy.get(
      `[data-testid="advisory-${firstAdvisory.advisoryId}-list_entry-open_button"]`,
    ).click()
    cy.wait('@apiGetFirstAdvisoryDetail')
    cy.get('[data-testid="loading_indicator"]').should('not.exist')

    // URL must now include the tracking id
    cy.location('search').should(
      'include',
      `trackingId=${encodeURIComponent(firstAdvisory.documentTrackingId)}`,
    )
    cy.location('search').should('include', 'tab=EDITOR')
  })

  // -------------------------------------------------------------------------
  // AC3: Saving a new advisory updates the URL to include the tracking id
  // -------------------------------------------------------------------------
  it('AC3: saving a new advisory updates the URL to include the tracking id', function () {
    interceptLoginEnabled()
    interceptUserInfo(user)

    const newAdvisoryId = '33333333-3333-3333-3333-333333333333'
    const newTrackingId = 'MY-NEW-2024-001'
    cy.setCookie('XSRF-TOKEN', 'test-Value-123')
    cy.intercept('POST', '/api/v1/advisories', {
      statusCode: 201,
      body: { id: newAdvisoryId, revision: '1-newrev' },
    }).as('apiCreateAdvisory')
    interceptAdvisoryDetail(
      newAdvisoryId,
      makeAdvisoryDetail(newAdvisoryId, newTrackingId),
    )

    cy.visit('?tab=EDITOR')
    cy.wait('@wellKnownAppConfig')
    cy.wait('@apiGetUserInfo')

    // Click the save button to trigger the create flow (new document)
    cy.get('[data-testid="save_button"]').click()

    // The VersionSummaryDialog appears — fill summary and submit
    cy.get('[data-testid="submit_version"]').should('exist')
    cy.get('[data-testid="submit_version-summary-textarea"]').type(
      'initial version',
    )
    cy.get('[data-testid="submit_version-submit"]').click()

    cy.wait('@apiCreateAdvisory')
    cy.wait('@apiGetAdvisoryDetail')

    cy.location('search').should(
      'include',
      `trackingId=${encodeURIComponent(newTrackingId)}`,
    )
  })

  // -------------------------------------------------------------------------
  // AC4: Unknown tracking id shows not-found toast and falls back to fresh editor
  // -------------------------------------------------------------------------
  it('AC4: an unknown tracking id shows a not-found toast and opens a fresh document', function () {
    interceptLoginEnabled()
    interceptUserInfo(user)
    interceptEmptyResolution()

    cy.visit('?tab=EDITOR&trackingId=UNKNOWN-ID-9999')
    cy.wait('@wellKnownAppConfig')
    cy.wait('@apiGetUserInfo')
    cy.wait('@apiResolveTrackingIdEmpty')

    // Error toast must appear with the generic not-accessible message
    cy.get('[data-testid="error_toast_message"]')
      .should('exist')
      .and('contain.text', 'Advisory not found or not accessible.')

    // App must remain usable: editor tabs should be present
    cy.get('[data-testid="tab_button-EDITOR"]').should('exist')
  })

  // -------------------------------------------------------------------------
  // AC5: Userinfo 401 — logged-out permalink redirects to login URL
  // -------------------------------------------------------------------------
  it('AC5: when not logged in (401 userinfo) visiting a permalink redirects to the login URL', function () {
    interceptLoginEnabled()
    interceptUserInfo(401)

    // Intercept the login URL so Cypress does not follow the real OAuth2
    // redirect (which would time out on an external IdP). Returning a 200
    // stub lets Cypress load the "page" and lets us assert the navigation
    // happened without a real login round-trip.
    cy.intercept('GET', '/oauth2/sign_in*', {
      statusCode: 200,
      body: '<html><body>login stub</body></html>',
    }).as('loginRedirect')

    cy.visit(`?tab=EDITOR&trackingId=${encodeURIComponent(TRACKING_ID)}`)

    // The app must redirect to the login URL once auth settles and the user is
    // found to be not logged in. Assert the intercepted login request fired.
    cy.wait('@loginRedirect', { timeout: 30000 })
  })

  // -------------------------------------------------------------------------
  // AC6: Standalone mode — no copy button, trackingId param is ignored
  // -------------------------------------------------------------------------
  it('AC6: in standalone mode the copy-link button is absent and trackingId param is ignored', function () {
    cy.intercept('/.well-known/appspecific/de.bsi.secvisogram.json', {
      statusCode: 404,
    }).as('wellKnownAppConfig')

    cy.visit(`?tab=EDITOR&trackingId=${encodeURIComponent(TRACKING_ID)}`)
    cy.wait('@wellKnownAppConfig')

    // No copy-link button in standalone (loginAvailable=false) mode
    cy.get('[data-testid="copy_permalink_button"]').should('not.exist')

    // No advisory was loaded — the advisory_id span is absent
    cy.get('[data-testid="advisory_id"]').should('not.exist')
  })

  // -------------------------------------------------------------------------
  // AC7a: Copy-link button copies correct permalink + shows confirmation toast
  // -------------------------------------------------------------------------
  it('AC7: the copy-link button copies the correct permalink and shows a confirmation toast', function () {
    interceptLoginEnabled()
    interceptUserInfo(user)
    interceptResolution(ADVISORY_ID)
    interceptAdvisoryDetail(ADVISORY_ID, undefined)

    cy.visit(`?tab=EDITOR&trackingId=${encodeURIComponent(TRACKING_ID)}`)
    cy.wait('@wellKnownAppConfig')
    cy.wait('@apiGetUserInfo')
    cy.wait('@apiResolveTrackingId')
    cy.wait('@apiGetAdvisoryDetail')
    cy.get('[data-testid="loading_indicator"]').should('not.exist')

    // Stub clipboard before clicking
    cy.window().then((/** @type {any} */ win) => {
      cy.stub(win.navigator.clipboard, 'writeText').resolves()
    })

    cy.get('[data-testid="copy_permalink_button"]').should('be.visible').click()

    // Clipboard must have been called with a URL containing the tracking id
    cy.window().then((/** @type {any} */ win) => {
      const writeTextStub = /** @type {sinon.SinonStub} */ (
        win.navigator.clipboard.writeText
      )
      expect(writeTextStub).to.have.been.calledOnce
      const calledWith = writeTextStub.getCall(0).args[0]
      expect(calledWith).to.include(
        `trackingId=${encodeURIComponent(TRACKING_ID)}`,
      )
      expect(calledWith).to.include('tab=EDITOR')
    })

    // Confirmation toast should appear (green toast reuses error_toast_message testid)
    cy.get('[data-testid="error_toast_message"]').should('exist')
  })

  // -------------------------------------------------------------------------
  // AC7b: Copy-link button is hidden for a -TEMP- tracking id
  // -------------------------------------------------------------------------
  it('AC7: the copy-link button is hidden for a temporary tracking id (-TEMP-)', function () {
    interceptLoginEnabled()
    interceptUserInfo(user)
    interceptResolution(TEMP_ADVISORY_ID)
    interceptAdvisoryDetail(
      TEMP_ADVISORY_ID,
      makeAdvisoryDetail(TEMP_ADVISORY_ID, TEMP_TRACKING_ID),
    )

    cy.visit(`?tab=EDITOR&trackingId=${encodeURIComponent(TEMP_TRACKING_ID)}`)
    cy.wait('@wellKnownAppConfig')
    cy.wait('@apiGetUserInfo')
    cy.wait('@apiResolveTrackingId')
    cy.wait('@apiGetAdvisoryDetail')
    cy.get('[data-testid="loading_indicator"]').should('not.exist')

    // The button must be absent because the tracking id contains -TEMP-
    cy.get('[data-testid="copy_permalink_button"]').should('not.exist')
  })

  // -------------------------------------------------------------------------
  // AC8: Tracking id with a space round-trips correctly through URL + resolution
  // -------------------------------------------------------------------------
  it('AC8: a tracking id containing a space is correctly encoded in the resolution request', function () {
    const spaceAdvisoryId = '44444444-4444-4444-4444-444444444444'
    interceptLoginEnabled()
    interceptUserInfo(user)

    cy.intercept(
      { method: 'GET', url: /\/api\/v1\/advisories\?expression=/ },
      (req) => {
        req.alias = 'apiResolveSpaceTrackingId'
        req.reply(makeResolutionList(spaceAdvisoryId))
      },
    )
    interceptAdvisoryDetail(
      spaceAdvisoryId,
      makeAdvisoryDetail(spaceAdvisoryId, TRACKING_ID_WITH_SPACE),
    )

    cy.visit(
      `?tab=EDITOR&trackingId=${encodeURIComponent(TRACKING_ID_WITH_SPACE)}`,
    )
    cy.wait('@wellKnownAppConfig')
    cy.wait('@apiGetUserInfo')
    cy.wait('@apiResolveSpaceTrackingId').then((interception) => {
      const rawUrl = interception.request.url
      const url = new URL(rawUrl, 'http://localhost')
      const expression = JSON.parse(url.searchParams.get('expression') ?? '{}')
      // The value must be the unencoded tracking id — the URL encoding is for
      // transport only; the JSON payload holds the literal string
      expect(expression.value).to.equal(TRACKING_ID_WITH_SPACE)
      expect(expression.type).to.equal('Operator')
      expect(expression.operatorType).to.equal('Equal')
      expect(expression.selector).to.deep.equal([
        'csaf',
        'document',
        'tracking',
        'id',
      ])
    })
    cy.wait('@apiGetAdvisoryDetail')
    cy.get('[data-testid="loading_indicator"]').should('not.exist')

    // Advisory must open successfully
    cy.get('[data-testid="advisory_id"]').should('have.text', spaceAdvisoryId)
  })
})
