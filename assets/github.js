/** GitHub Search API client with a browser-friendly rate limiter. */

import { sleep } from './util.js?v=20261120-2'

const SEARCH_BASE = 'https://api.github.com/search/repositories'
const API_VERSION = '2022-11-28'
const MAX_PAGE = 10

export class GitHubError extends Error {
  /**
   * @param {'auth' | 'rate-limit' | 'network' | 'http' | 'bad-query'} kind
   * @param {string} message
   * @param {{ status?: number, resetAt?: number, payload?: unknown }} [details]
   */
  constructor(kind, message, details = {}) {
    super(message)
    this.name = 'GitHubError'
    this.kind = kind
    this.status = details.status
    this.resetAt = details.resetAt
    this.payload = details.payload
  }
}

/** @param {string} topic */
export function normalizeTopic(topic) {
  const value = String(topic || '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(value)) {
    throw new GitHubError('bad-query', `Invalid GitHub topic: ${JSON.stringify(topic)}`)
  }
  return value
}

/**
 * @param {string} topic
 * @param {{ query?: string | (() => string) }} window
 */
export function buildSearchQuery(topic, window) {
  const safeTopic = normalizeTopic(topic)
  const parts = [`topic:${safeTopic}`, 'fork:false']
  const extra = typeof window.query === 'function' ? window.query() : window.query
  if (typeof extra === 'string' && extra.trim()) parts.push(extra.trim())
  return parts.join(' ')
}

/**
 * @param {{ topic: string, window: any, page: number, perPage?: number }} options
 * @returns {string}
 */
export function buildSearchUrl({ topic, window, page, perPage = 100 }) {
  const url = new URL(SEARCH_BASE)
  url.searchParams.set('q', buildSearchQuery(topic, window))
  url.searchParams.set('per_page', String(Math.min(100, Math.max(1, Number(perPage) || 100))))
  url.searchParams.set('page', String(Math.min(MAX_PAGE, Math.max(1, Number(page) || 1))))
  if (window.sort && window.sort !== 'best') {
    url.searchParams.set('sort', String(window.sort))
    url.searchParams.set('order', window.order === 'asc' ? 'asc' : 'desc')
  }
  return url.href
}

/**
 * @param {Headers | { get(name: string): string | null } | null | undefined} headers
 */
export function parseRateLimit(headers) {
  /** @param {string} name */
  const read = (name) => {
    try {
      const value = headers && typeof headers.get === 'function' ? headers.get(name) : null
      return value === null || value === undefined ? null : String(value)
    } catch {
      return null
    }
  }
  /** @param {string | null} value */
  const number = (value) => {
    if (value === null || value === '') return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  const limit = number(read('x-ratelimit-limit'))
  const remaining = number(read('x-ratelimit-remaining'))
  const reset = number(read('x-ratelimit-reset'))
  const used = number(read('x-ratelimit-used'))
  const retryAfter = number(read('retry-after'))
  return {
    limit,
    remaining,
    reset,
    resetAt: reset ? reset * 1_000 : 0,
    used,
    retryAfter,
    resource: read('x-ratelimit-resource'),
    authenticated: limit !== null && limit > 10,
  }
}

/**
 * @param {number} status
 * @param {unknown} payload
 * @param {{ resetAt: number, retryAfter: number | null, remaining: number | null }} rate
 * @param {number} [now]
 */
export function classifyGitHubError(status, payload, rate, now = Date.now()) {
  const message =
    payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
      ? payload.message
      : `GitHub returned HTTP ${status}`
  if (status === 401) {
    return new GitHubError('auth', 'GitHub token is invalid or expired', { status, payload })
  }
  if (status === 403 || status === 429) {
    const resetAt = rate.retryAfter
      ? now + rate.retryAfter * 1_000 + 1_000
      : rate.resetAt && rate.resetAt > now
        ? rate.resetAt + 1_000
        : now + 60_000
    return new GitHubError('rate-limit', message, { status, resetAt, payload })
  }
  if (status === 422) {
    return new GitHubError('bad-query', message, { status, payload })
  }
  return new GitHubError('http', message, { status, payload })
}

export class GitHubClient {
  /**
   * @param {{
   *   getToken?: () => string,
   *   onRate?: (rate: ReturnType<typeof parseRateLimit>) => void,
   *   fetchImpl?: typeof fetch,
   *   sleepImpl?: (ms: number, signal?: AbortSignal) => Promise<void>,
   * }} [options]
   */
  constructor(options = {}) {
    this.getToken = options.getToken || (() => '')
    this.onRate = options.onRate || (() => {})
    const fetchImpl = options.fetchImpl || globalThis.fetch
    this.fetchImpl = fetchImpl.bind(globalThis)
    this.sleepImpl = options.sleepImpl || sleep
    /** @type {number} */
    this.lastRequestAt = 0
    /** @type {number} */
    this.blockedUntil = 0
  }

  get minIntervalMs() {
    return this.getToken() ? 2_150 : 6_100
  }

  /** @param {AbortSignal} [signal] */
  async wait(signal) {
    while (true) {
      const now = Date.now()
      const target = Math.max(this.lastRequestAt + this.minIntervalMs, this.blockedUntil)
      if (now >= target) return
      await this.sleepImpl(target - now, signal)
    }
  }

  /** @param {number} milliseconds */
  blockFor(milliseconds) {
    this.blockedUntil = Math.max(this.blockedUntil, Date.now() + Math.max(0, milliseconds))
  }

  clearBlock() {
    this.blockedUntil = 0
  }

  /**
   * @param {{
   *   topic: string,
   *   window: any,
   *   page: number,
   *   perPage?: number,
   *   signal?: AbortSignal,
   * }} options
   */
  async search({ topic, window, page, perPage = 100, signal }) {
    await this.wait(signal)
    const url = buildSearchUrl({ topic, window, page, perPage })
    /** @type {Record<string, string>} */
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION,
    }
    const token = this.getToken().trim()
    if (token) headers.Authorization = `Bearer ${token}`

    let response
    try {
      response = await this.fetchImpl(url, {
        headers,
        signal,
        cache: 'no-store',
      })
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') throw error
      throw new GitHubError('network', `Could not reach api.github.com: ${error?.message || String(error)}`, { payload: error })
    }

    this.lastRequestAt = Date.now()
    const rate = parseRateLimit(response.headers)
    this.onRate(rate)

    if (!response.ok) {
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      const error = classifyGitHubError(response.status, payload, rate, Date.now())
      if (error.kind === 'rate-limit' && error.resetAt) {
        this.blockFor(error.resetAt - Date.now())
      }
      throw error
    }

    let data
    try {
      data = await response.json()
    } catch (error) {
      throw new GitHubError('http', 'GitHub returned malformed JSON', { status: response.status, payload: error })
    }

    return {
      items: Array.isArray(data?.items) ? data.items : [],
      totalCount: Number.isFinite(data?.total_count) ? data.total_count : null,
      incomplete: data?.incomplete_results === true,
      rate,
    }
  }
}

export { MAX_PAGE }
