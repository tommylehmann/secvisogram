import { coreRecord } from '#lib/core.js'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import createFileName from '../shared/createFileName.js'
import DocumentsTab from './SecvisogramPage/DocumentsTab.js'
import isShareableTrackingId from './SecvisogramPage/shared/isShareableTrackingId.js'
import { loadAdvisory } from './SecvisogramPage/service.js'
import View from './SecvisogramPage/View.js'
import { backend, validationService } from './shared/api.js'
import ApiRequest from './shared/ApiRequest.js'
import AppConfigContext from './shared/context/AppConfigContext.js'
import AppErrorContext from './shared/context/AppErrorContext.js'
import HistoryContext from './shared/context/HistoryContext.js'
import UserInfoContext, {
  UserInfoSettledContext,
} from './shared/context/UserInfoContext.js'
import downloadFile from './shared/download.js'
import sitemap from './shared/sitemap.js'

/**
 * Holds the application-state and provides memoized callbacks for the view
 * to communicate with the core.
 */
const SecvisogramPage = () => {
  const { pushState, location } = React.useContext(HistoryContext)
  const { t } = useTranslation()
  const appConfig = React.useContext(AppConfigContext)
  const userInfo = React.useContext(UserInfoContext)
  const userInfoSettled = React.useContext(UserInfoSettledContext)
  const searchParams = new URL(location.href).searchParams
  const [
    {
      isLoading,
      isTabLocked,
      errors,
      alert,
      stripResult,
      previewResult,
      uiSchemaVersion,
      pendingBeta21Doc,
    },
    setState,
  ] = React.useState({
    isLoading: false,
    alert: /**
     * @type {{
     *   confirmLabel: string
     *   cancelLabel: string
     *   label: string
     *   description: string
     *   onConfirm(): void
     *   onCancel(): void
     * } | null}
     */ (null),
    errors:
      /** @type {import('#lib/core/typedValidationError.js').TypedValidationError[]} */ ([]),
    stripResult: /**
     * @type {{
     *    strippedPaths: Array<{ instancePath: string; message: string; error: boolean }>
     *    doc: {}
     * } | null}
     */ (null),
    previewResult: /**
     * @type {{
     *    doc: {}
     * } | null}
     */ (null),
    activeTab: /** @type {React.ComponentProps<typeof View>['activeTab']} */ (
      'EDITOR'
    ),
    isTabLocked: false,
    /** @type {import('../uiSchemas.js').UiSchemaVersion} */
    uiSchemaVersion: 'v2.0',
    /** @type {{ document?: { csaf_version?: string } } | null} */
    pendingBeta21Doc: null,
  })
  const core = coreRecord[uiSchemaVersion]
  const [doc, setDoc] = React.useState(core.newDocMin())
  const data = React.useMemo(() => ({ doc }), [doc])

  const { handleError } = React.useContext(AppErrorContext)

  const alertSaveInvalidTranslationStrings = useMemo(() => {
    return {
      label: t('alert.saveInvalidTitle'),
      description: t('alert.saveInvalidDescription'),
      cancelLabel: t('alert.saveInvalidCancel'),
      confirmLabel: t('alert.saveInvalidConfirm'),
    }
  }, [t])

  // Permalink initial load: if ?trackingId= is present in server mode, handle
  // based on auth state once it has settled:
  //   - logged-out  → redirect to loginUrl (AC5)
  //   - logged-in   → resolve tracking id and load advisory
  //   - standalone  → ignore (AC6)
  //
  // NOTE: App renders SecvisogramPage inside context providers populated by
  // async effects (getAppConfig, getUserInfo). The first render therefore sees
  // the context defaults (loginAvailable: false, userInfo: null). We wait for
  // userInfoSettled to become true before acting, so we never confuse "auth
  // not yet settled" with "settled and definitely logged out". hasLoadedRef
  // ensures the one-shot resolution fires at most once even as deps re-settle.
  const trackingIdParam = searchParams.get('trackingId')
  const [defaultAdvisoryState, setDefaultAdvisoryState] = React.useState(
    /** @type {import('./SecvisogramPage/shared/types.js').AdvisoryState | null} */ (
      null
    ),
  )
  const [permalinkLoading, setPermalinkLoading] = React.useState(false)
  const hasLoadedRef = React.useRef(false)
  React.useEffect(() => {
    // Wait until trackingId is present, server mode is confirmed, and auth has
    // fully settled (getUserInfo completed in App).
    if (!trackingIdParam || !appConfig.loginAvailable || !userInfoSettled)
      return
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    // AC5: settled auth with no user → redirect to login so the advisory opens
    // after sign-in. The server login flow is expected to return the user to
    // the current permalink URL.
    if (!userInfo) {
      window.location.href = appConfig.loginUrl
      return
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPermalinkLoading(true)
    backend
      .resolveAdvisoryIdByTrackingId({ trackingId: trackingIdParam })
      .then((advisoryId) => {
        if (!advisoryId) {
          // No match — treat as not found
          const notFoundError = /** @type {any} */ (
            new Error(t('error.advisoryNotFound'))
          )
          notFoundError.status = 404
          return Promise.reject(notFoundError)
        }
        return loadAdvisory({ advisoryId })
      })
      .then((advisory) => {
        setDefaultAdvisoryState({ type: 'ADVISORY', advisory })
      })
      .catch((/** @type {any} */ error) => {
        if (error.status === 401 && appConfig.loginAvailable) {
          window.location.href = appConfig.loginUrl
          return
        }
        // 403, 404, and no-match all collapse to the same generic message so
        // there is no observable discrepancy between "not found" and "not
        // authorized" (defense-in-depth per plan's generic-handling intent).
        if (error.status === 403 || error.status === 404) {
          handleError({ message: t('error.advisoryNotAccessible') })
        } else {
          handleError(error)
        }
      })
      .finally(() => {
        setPermalinkLoading(false)
      })
    // Re-run when loginAvailable, userInfo, or userInfoSettled settle (async
    // App effects). hasLoadedRef ensures resolution fires at most once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appConfig.loginAvailable, userInfo, userInfoSettled])

  const onAdvisoryUrlChange = React.useCallback(
    (
      /** @type {import('./SecvisogramPage/shared/types.js').Advisory | null} */ advisory,
      /** @type {string | undefined} */ targetTab,
    ) => {
      const tab = targetTab ?? searchParams.get('tab') ?? 'EDITOR'
      const tid = advisory?.csaf.document?.tracking?.id
      if (isShareableTrackingId(tid)) {
        pushState(
          null,
          '',
          sitemap.home.href([
            ['tab', tab],
            ['trackingId', /** @type {string} */ (tid)],
          ]),
        )
      } else {
        pushState(null, '', sitemap.home.href([['tab', tab]]))
      }
    },
    [pushState, searchParams],
  )

  return (
    <View
      uiSchemaVersion={uiSchemaVersion}
      activeTab={
        searchParams.get('tab') === 'DOCUMENTS'
          ? 'DOCUMENTS'
          : searchParams.get('tab') === 'EDITOR'
            ? 'EDITOR'
            : searchParams.get('tab') === 'SOURCE'
              ? 'SOURCE'
              : searchParams.get('tab') === 'PREVIEW'
                ? 'PREVIEW'
                : searchParams.get('tab') === 'CSAF-JSON'
                  ? 'CSAF-JSON'
                  : 'EDITOR'
      }
      isTabLocked={isTabLocked}
      isLoading={isLoading || permalinkLoading}
      errors={errors}
      stripResult={stripResult}
      previewResult={previewResult}
      data={data}
      defaultAdvisoryState={defaultAdvisoryState}
      alert={alert}
      DocumentsTab={DocumentsTab}
      generatorEngineData={core.getGeneratorEngineData()}
      onLoadAdvisory={loadAdvisory}
      onUpdateAdvisory={({
        advisoryId,
        csaf,
        revision,
        summary,
        legacyVersion,
      }) => {
        return backend.updateAdvisory({
          advisoryId,
          csaf,
          revision,
          summary,
          legacyVersion,
        })
      }}
      onLockTab={React.useCallback(() => {
        setState((state) => ({ ...state, isTabLocked: true }))
      }, [setState])}
      onUnlockTab={React.useCallback(() => {
        setState((state) => ({ ...state, isTabLocked: false }))
      }, [setState])}
      onDownload={(doc) => {
        core
          .validate({ document: doc })
          .then(({ isValid }) => {
            const fileName = createFileName(doc, isValid, 'json')
            if (!isValid) {
              setState((state) => ({
                ...state,
                alert: {
                  ...alertSaveInvalidTranslationStrings,
                  onConfirm() {
                    downloadFile(JSON.stringify(doc, null, 2), fileName)
                    setState({ ...state, alert: null })
                  },
                  onCancel() {
                    setState({ ...state, alert: null })
                  },
                },
              }))
            } else {
              downloadFile(JSON.stringify(doc, null, 2), fileName)
            }
          })
          .catch(handleError)
      }}
      onOpen={(file) => {
        setState((state) => ({ ...state, isLoading: true }))
        return new Promise((resolve, reject) => {
          const fileReader = new FileReader()
          fileReader.onerror = reject
          fileReader.onload = (e) => {
            try {
              const parsedDoc = JSON.parse(
                /** @type {string | undefined} */ (e.target?.result) ?? '',
              )
              const detectedVersion = parsedDoc?.document?.csaf_version

              if (detectedVersion === '2.1' && uiSchemaVersion !== 'v2.1') {
                // When opening a csaf document we first check the version.
                // Since the csaf 2.1 functionality is still beta we warn the
                // user before opening a document with that version ...

                setState((state) => ({
                  ...state,
                  isLoading: false,
                  pendingBeta21Doc: parsedDoc,
                }))
              } else {
                // ... otherwise we just proceed loading the file

                setState((state) => ({
                  ...state,
                  isLoading: false,
                }))
                setDoc(parsedDoc)
              }
              resolve(parsedDoc)
            } catch (err) {
              reject(err)
            }
          }
          fileReader.readAsText(file)
        }).catch(handleError)
      }}
      onChangeTab={(tab, document) => {
        if (isTabLocked) return
        setState((state) => ({ ...state, isLoading: true }))
        core
          .validate({ document })
          .then((result) => {
            setState((state) => ({
              ...state,
              isLoading: false,
              errors: result.errors,
            }))
            pushState(null, '', sitemap.home.href([['tab', tab]]))
          })
          .catch(handleError)
      }}
      onValidate={React.useCallback(
        (doc) => {
          core
            .validate({ document: doc })
            .then((result) => {
              setState((state) => ({
                ...state,
                errors: result.errors,
              }))
            })
            .catch(handleError)
        },
        [handleError, core, setState],
      )}
      onCollectProductIds={React.useCallback(
        async (document) => {
          try {
            const ids = await core.collectProductIds({ document })
            return ids
          } catch (/** @type {any} */ error) {
            return handleError(error)
          }
        },
        [handleError, core],
      )}
      onCollectGroupIds={React.useCallback(
        async (document) => {
          try {
            const ids = await core.collectGroupIds({ document })
            return ids
          } catch (/** @type {any} */ error) {
            return handleError(error)
          }
        },
        [handleError, core],
      )}
      onGetDocMin={async () => {
        return core.newDocMin()
      }}
      onGetDocMax={async () => {
        return core.newDocMax()
      }}
      onCreateAdvisory={({ csaf, summary, legacyVersion }) => {
        return backend.createAdvisory({ csaf, summary, legacyVersion })
      }}
      onStrip={React.useCallback(
        (document) => {
          core
            .strip({ document })
            .then(({ document: doc, strippedPaths }) => {
              setState((state) => ({
                ...state,
                stripResult: {
                  strippedPaths,
                  doc,
                },
              }))
            })
            .catch(handleError)
        },
        [handleError, core, setState],
      )}
      onPreview={React.useCallback(
        (document) => {
          core
            .preview({ document })
            .then(({ document: doc }) => {
              setState((state) => ({
                ...state,
                previewResult: {
                  doc,
                },
              }))
            })
            .catch(handleError)
        },
        [handleError, core, setState],
      )}
      onPrepareDocumentForTemplate={React.useCallback(
        (document) => core.preview({ document }),
        [core],
      )}
      onExportCSAF={React.useCallback(
        (document) => {
          core
            .validate({ document: document })
            .then(({ isValid }) => {
              const fileName = createFileName(document, isValid, 'json')
              if (!isValid) {
                setState((state) => ({
                  ...state,
                  alert: {
                    ...alertSaveInvalidTranslationStrings,
                    onConfirm() {
                      core
                        .strip({ document })
                        .then(({ document: doc }) => {
                          setState({ ...state, alert: null })
                          downloadFile(JSON.stringify(doc, null, 2), fileName)
                        })
                        .catch(handleError)
                    },
                    onCancel() {
                      setState({ ...state, alert: null })
                    },
                  },
                }))
              } else {
                core
                  .strip({ document })
                  .then(({ document: doc }) => {
                    downloadFile(JSON.stringify(doc, null, 2), fileName)
                  })
                  .catch(handleError)
              }
            })
            .catch(handleError)
        },
        [handleError, alertSaveInvalidTranslationStrings, core, setState],
      )}
      onExportHTML={React.useCallback(
        (html, doc) => {
          core.validate({ document: doc }).then(({ isValid }) => {
            const fileName = createFileName(doc, isValid, 'html')
            if (!isValid) {
              setState((state) => ({
                ...state,
                alert: {
                  ...alertSaveInvalidTranslationStrings,
                  onConfirm() {
                    downloadFile(html, fileName, 'text/html')
                    setState({ ...state, alert: null })
                  },
                  onCancel() {
                    setState({ ...state, alert: null })
                  },
                },
              }))
            } else {
              downloadFile(html, fileName, 'text/html')
            }
          })
        },
        [alertSaveInvalidTranslationStrings, core, setState],
      )}
      onServiceValidate={({ validatorUrl, csaf }) => {
        return validationService
          .validateCSAF(validatorUrl, { csaf })
          .catch((error) => {
            throw {
              message:
                t('error.errorReachingValidationServiceWithCode') +
                error.status,
            }
          })
      }}
      onGetTemplates={() => {
        return new ApiRequest(new Request('/api/v1/advisories/templates'))
          .setContentType('application/json')
          .send()
          .then((res) => res.json())
      }}
      onGetTemplateContent={({ templateId }) => {
        return new ApiRequest(
          new Request(`/api/v1/advisories/templates/${templateId}`),
        )
          .setContentType('application/json')
          .send()
          .then((templateContentRes) => templateContentRes.json())
      }}
      onGetBackendInfo={backend.getAboutInfo}
      onSetUiVersion={(uiSchemaVersion) => {
        setState((state) => ({ ...state, uiSchemaVersion }))
      }}
      pendingBeta21Doc={pendingBeta21Doc}
      onConfirmBeta21Open={React.useCallback(() => {
        if (!pendingBeta21Doc) return

        // If the user accepts opening a csaf 2.1 document despite being beta we
        // switch to the new mode and load the document from the
        // `pendingBeta21Doc` state.
        setState((state) => ({
          ...state,
          uiSchemaVersion: 'v2.1',
          pendingBeta21Doc: null,
        }))
        setDoc(pendingBeta21Doc)
      }, [pendingBeta21Doc, setState, setDoc])}
      onCancelBeta21Open={React.useCallback(() => {
        setState((state) => ({ ...state, pendingBeta21Doc: null }))
      }, [setState])}
      onAdvisoryUrlChange={onAdvisoryUrlChange}
    />
  )
}

export default SecvisogramPage
