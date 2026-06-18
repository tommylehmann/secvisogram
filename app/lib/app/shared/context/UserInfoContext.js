import React from 'react'

/**
 * @typedef {object} UserInfoContext
 * @property {string} user
 * @property {string} email
 * @property {string} preferredUsername
 * @property {string[] | null} groups
 */

export default React.createContext(/** @type {UserInfoContext | null} */ (null))

/**
 * True once the getUserInfo effect in App has resolved (either with a user
 * object or definitively null). False on the first render and while the async
 * getUserInfo fetch is in flight. Consumers that need to distinguish "auth not
 * yet settled" from "settled and definitely logged out" should read this.
 */
export const UserInfoSettledContext = React.createContext(false)
