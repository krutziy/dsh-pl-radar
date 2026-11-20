/** Read and validate a repository's root package.json. No GitHub API needed. */

import { isObject, safeHttpUrl } from './util.js?v=20261120-2'

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/
const PACKAGE_NAME_MAX = 214
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/
const REPO_NAME = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

/** @param {unknown} value */
export function isValidPackageName(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= PACKAGE_NAME_MAX && PACKAGE_NAME.test(value)
}

/** @param {unknown} value */
export function isValidVersion(value) {
  return typeof value === 'string' && SEMVER.test(value)
}

/**
 * Turn npm repository values into a displayed web URL. This is cosmetic only;
 * it is never used as an install source.
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeRepository(value) {
  let raw = null
  if (typeof value === 'string') raw = value
  else if (isObject(value) && typeof value.url === 'string') raw = value.url
  if (!raw) return null
  let text = raw.trim()
  if (!text) return null
  if (text.startsWith('github:')) text = `https://github.com/${text.slice('github:'.length)}`
  else if (text.startsWith('gitlab:')) text = `https://gitlab.com/${text.slice('gitlab:'.length)}`
  else if (text.startsWith('bitbucket:')) text = `https://bitbucket.org/${text.slice('bitbucket:'.length)}`
  else if (text.startsWith('git+')) text = text.slice(4)
  else if (text.startsWith('git://')) text = `https://${text.slice('git://'.length)}`
  else if (/^[\w.-]+\/[\w.-]+$/.test(text)) text = `https://github.com/${text}`
  text = text.replace(/#.*$/, '').replace(/\.git$/, '')
  return safeHttpUrl(text)
}

/** @param {unknown} value */
function normalizeLicense(value) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (isObject(value) && typeof value.type === 'string' && value.type.trim()) return value.type.trim()
  return null
}

/** @param {unknown} value */
function normalizeKeywords(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim()))]
}

/** @param {unknown} value */
function normalizePatch(value) {
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  if (Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === 'string' && entry.trim())) {
    return value.map((entry) => entry.trim())
  }
  return null
}

/** @param {unknown} value */
function normalizeEngines(value) {
  if (!isObject(value)) return null
  const dsh = value.dsh
  if (typeof dsh === 'string' && dsh.trim()) return dsh.trim()
  return null
}

/** @param {unknown} pkg */
function normalizePeerRanges(pkg) {
  if (!isObject(pkg) || !isObject(pkg.peerDependencies)) return null
  const ranges = []
  for (const [name, range] of Object.entries(pkg.peerDependencies)) {
    if (typeof range !== 'string') continue
    if (name !== '@deepseek-ai/dsh' && !name.startsWith('@deepseek-ai/dsh-')) continue
    if (range.startsWith('workspace:')) continue
    if (range.trim() === '*') continue
    ranges.push(range.trim())
  }
  return ranges.length ? [...new Set(ranges)].join(', ') : null
}

/**
 * Pure manifest check. `verified` means the package declares a non-empty
 * `dsh.bundle.patch`, not that the code is safe.
 * @param {unknown} pkg
 * @returns {{
 *   status: 'verified' | 'private' | 'missing' | 'invalid',
 *   reason?: string,
 *   packageName?: string,
 *   version?: string,
 *   description?: string,
 *   keywords?: string[],
 *   license?: string | null,
 *   repository?: string | null,
 *   homepage?: string | null,
 *   enginesDsh?: string | null,
 *   patch?: string[],
 *   webUi?: boolean,
 * }}
 */
export function extractManifest(pkg) {
  if (!isObject(pkg)) return { status: 'invalid', reason: 'not-object' }
  if (pkg.private === true) return { status: 'private', reason: 'private' }

  const name = typeof pkg.name === 'string' ? pkg.name.trim() : ''
  if (!isValidPackageName(name)) return { status: 'invalid', reason: 'invalid-name' }

  const version = typeof pkg.version === 'string' ? pkg.version.trim() : ''
  if (!isValidVersion(version)) return { status: 'invalid', reason: 'invalid-version' }

  const dsh = isObject(pkg.dsh) ? pkg.dsh : null
  const bundle = dsh && isObject(dsh.bundle) ? dsh.bundle : null
  const patch = bundle ? normalizePatch(bundle.patch) : null
  if (!patch) return { status: 'missing', reason: 'no-bundle' }

  return {
    status: 'verified',
    packageName: name,
    version,
    description: typeof pkg.description === 'string' ? pkg.description.trim() : '',
    keywords: normalizeKeywords(pkg.keywords),
    license: normalizeLicense(pkg.license),
    repository: normalizeRepository(pkg.repository),
    homepage: typeof pkg.homepage === 'string' ? safeHttpUrl(pkg.homepage) : null,
    enginesDsh: normalizeEngines(pkg.engines) || normalizePeerRanges(pkg),
    patch,
    webUi: Boolean(dsh?.client),
  }
}

/**
 * @param {string} text
 * @returns {{ ok: true, value: unknown } | { ok: false }}
 */
export function parsePackageJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

/**
 * @param {string} url
 * @param {{ fetchImpl: typeof fetch, timeoutMs: number, maxBytes: number, signal?: AbortSignal }} options
 */
async function fetchText(url, { fetchImpl, timeoutMs, maxBytes, signal }) {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, Math.max(1, timeoutMs))
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-cache',
      signal: controller.signal,
    })
    if (response.status === 404) return { status: 404 }
    if (!response.ok) return { status: response.status }
    const length = Number(response.headers?.get?.('content-length') || 0)
    if (length > maxBytes) return { tooLarge: true }
    const text = await response.text()
    if (text.length > maxBytes) return { tooLarge: true }
    return { text }
  } catch (error) {
    if (signal?.aborted) throw error
    if (timedOut) return { timeout: true }
    return { error }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Fetch the root package.json through raw.githubusercontent.com, falling back
 * to jsDelivr when the raw host is unreachable. HEAD always resolves to the
 * repository's default branch, avoiding branch-name path ambiguity.
 *
 * @param {string} fullName
 * @param {{
 *   signal?: AbortSignal,
 *   fetchImpl?: typeof fetch,
 *   rawTimeoutMs?: number,
 *   cdnTimeoutMs?: number,
 *   maxBytes?: number,
 *   now?: () => number,
 * }} [options]
 */
export async function fetchManifest(fullName, options = {}) {
  const checkedAt = (options.now || Date.now)()
  const fetchImpl = options.fetchImpl || fetch
  const rawTimeoutMs = options.rawTimeoutMs ?? 4_000
  const cdnTimeoutMs = options.cdnTimeoutMs ?? 8_000
  const maxBytes = options.maxBytes ?? 512 * 1_024
  const signal = options.signal

  if (typeof fullName !== 'string' || !REPO_NAME.test(fullName)) {
    return { status: 'invalid', reason: 'invalid-repository', checkedAt }
  }

  const sources = [
    { source: 'raw', url: `https://raw.githubusercontent.com/${fullName}/HEAD/package.json`, timeoutMs: rawTimeoutMs },
    { source: 'cdn', url: `https://cdn.jsdelivr.net/gh/${fullName}@HEAD/package.json`, timeoutMs: cdnTimeoutMs },
  ]

  let lastFailure = null
  for (const candidate of sources) {
    const result = await fetchText(candidate.url, {
      fetchImpl,
      timeoutMs: candidate.timeoutMs,
      maxBytes,
      signal,
    })

    if (result.status === 404) {
      return {
        status: 'missing',
        reason: 'file-missing',
        checkedAt,
        source: candidate.source,
        manifestUrl: candidate.url,
      }
    }
    if (result.tooLarge) {
      return {
        status: 'invalid',
        reason: 'too-large',
        checkedAt,
        source: candidate.source,
        manifestUrl: candidate.url,
      }
    }
    if (result.timeout || result.error || result.status) {
      lastFailure = result
      continue
    }
    if (typeof result.text !== 'string') {
      lastFailure = result
      continue
    }

    const parsed = parsePackageJson(result.text)
    if (!parsed.ok) {
      return {
        status: 'invalid',
        reason: 'invalid-json',
        checkedAt,
        source: candidate.source,
        manifestUrl: candidate.url,
      }
    }
    const manifest = extractManifest(parsed.value)
    return {
      ...manifest,
      checkedAt,
      source: candidate.source,
      manifestUrl: candidate.url,
    }
  }

  return {
    status: 'unreachable',
    reason: lastFailure?.timeout ? 'timeout' : 'network',
    checkedAt,
    source: null,
    manifestUrl: null,
  }
}
