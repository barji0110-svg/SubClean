/**
 * SubClean Extension - Shared Types
 */

/**
 * @typedef {Object} SyncResult
 * @property {string} serviceName
 * @property {string} planName
 * @property {'trial'|'active'|'cancelled'|'expired'|'unknown'} status
 * @property {number|null} price
 * @property {string} currency
 * @property {string|null} nextBillingDate - ISO date string
 * @property {boolean} cancelAtPeriodEnd
 * @property {string} syncedAt - ISO datetime string
 */

/**
 * @typedef {Object} SyncRequest
 * @property {string} service - service identifier
 * @property {string} action - 'sync'
 */

/**
 * @typedef {Object} SyncResponse
 * @property {boolean} success
 * @property {SyncResult|null} data
 * @property {string|null} error
 */
