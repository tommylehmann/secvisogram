import React, { useEffect, useState } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import ErrorScreen from './App/ErrorScreen.js'
import useHistory from './App/useHistory.js'
import * as api from './shared/api.js'
import AppConfigContext from './shared/context/AppConfigContext.js'
import AppErrorContext from './shared/context/AppErrorContext.js'
import HistoryContext from './shared/context/HistoryContext.js'
import UserInfoContext, {
  UserInfoSettledContext,
} from './shared/context/UserInfoContext.js'

/**
 * @param {object} props
 * @param {JSX.Element} props.secvisogramPage
 * @returns
 */
export default function App({ secvisogramPage }) {
  const history = useHistory()

  const defaultAppConfig = React.useContext(AppConfigContext)
  const [appConfig, setAppConfig] = useState(defaultAppConfig)

  useEffect(() => {
    api.appConfig.getAppConfig().then((response) => {
      const mergedConfig = { ...defaultAppConfig, ...response }
      setAppConfig(mergedConfig)
    })
  }, [defaultAppConfig])

  const defaultUserInfo = React.useContext(UserInfoContext)
  const [userInfo, setUserInfo] = useState(defaultUserInfo)

  // Track which loginAvailable value the last getUserInfo round-trip settled
  // for. Deriving userInfoSettled from this comparison means it automatically
  // becomes false whenever loginAvailable changes — no effect-based reset
  // needed, and no risk that a child's effect sees a stale-true flag between
  // the loginAvailable state update and the parent's useEffect re-running.
  const [settledForLoginAvailable, setSettledForLoginAvailable] = useState(
    /** @type {boolean | null} */ (null),
  )
  const userInfoSettled = settledForLoginAvailable === appConfig.loginAvailable

  const [applicationError, setApplicationError] = React.useState(
    /** @type {React.ContextType<typeof AppErrorContext>} */ ({
      applicationError: null,
      handleError(error) {
        setApplicationError((state) => ({ ...state, applicationError: error }))
      },
    }),
  )

  useEffect(() => {
    if (appConfig.loginAvailable) {
      api.auth
        .getUserInfo(appConfig.userInfoUrl)
        .then(
          (result) => {
            setUserInfo(result)
            setSettledForLoginAvailable(true)
          },
          (error) => {
            if (401 !== error.status) throw error
            setUserInfo(null)
            setSettledForLoginAvailable(true)
          },
        )
        .catch(applicationError.handleError)
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserInfo(null)
      // Standalone mode: auth is trivially settled (no login available).
      setSettledForLoginAvailable(false)
    }
  }, [
    applicationError.handleError,
    appConfig.loginAvailable,
    appConfig.userInfoUrl,
  ])

  return (
    <AppErrorContext.Provider value={applicationError}>
      <AppConfigContext.Provider value={appConfig}>
        <UserInfoSettledContext.Provider value={userInfoSettled}>
          <UserInfoContext.Provider value={userInfo}>
            <HistoryContext.Provider value={history}>
              <ErrorBoundary FallbackComponent={ErrorScreen}>
                {secvisogramPage}
              </ErrorBoundary>
            </HistoryContext.Provider>
          </UserInfoContext.Provider>
        </UserInfoSettledContext.Provider>
      </AppConfigContext.Provider>
    </AppErrorContext.Provider>
  )
}
