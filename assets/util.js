/** Shared browser/Node helpers. No DOM access at module evaluation time. */

/** @param {unknown} value */
export function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** @param {number} value @param {number} min @param {number} max */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/** @param {string} value */
export function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
}

/** @param {string} value */
export function initials(value) {
  const text = String(value || '').trim()
  if (!text) return '?'
  const first = Array.from(text)[0]
  return first.toUpperCase()
}

/** @param {string} value */
export function hashString(value) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

/** @param {string} value @param {number} [tones] */
export function avatarTone(value, tones = 8) {
  return hashString(value) % tones
}

/**
 * Only http(s) URLs survive. javascript:, data:, and malformed values return
 * null so they can never become an href.
 * @param {unknown} value
 * @returns {string | null}
 */
export function safeHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.href
  } catch {
    return null
  }
}

/**
 * GitHub avatar URLs only. The page never accepts arbitrary image hosts.
 * @param {unknown} value
 * @returns {string | null}
 */
export function safeAvatarUrl(value) {
  const url = safeHttpUrl(value)
  if (!url) return null
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if (host === 'avatars.githubusercontent.com' || host === 'github.com' || host === 'www.github.com') {
      return parsed.href
    }
  } catch {
    return null
  }
  return null
}

/** @param {unknown} value */
export function parseDate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value) return 0
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : 0
}

/** @param {number} value @param {string} lang */
export function formatCount(value, lang) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  if (Math.abs(number) >= 10_000) {
    try {
      return new Intl.NumberFormat(lang, { notation: 'compact', maximumFractionDigits: 1 }).format(number)
    } catch {
      return String(number)
    }
  }
  try {
    return new Intl.NumberFormat(lang).format(number)
  } catch {
    return String(number)
  }
}

/** @param {string | number} value @param {string} lang @param {number} [now] */
export function formatRelative(value, lang, now = Date.now()) {
  const time = parseDate(value)
  if (!time) return '—'
  const diffSeconds = (time - now) / 1_000
  const abs = Math.abs(diffSeconds)
  let unit = 'second'
  let amount = Math.round(diffSeconds)
  if (abs >= 45 && abs < 3_600) {
    unit = 'minute'
    amount = Math.round(diffSeconds / 60)
  } else if (abs >= 3_600 && abs < 86_400) {
    unit = 'hour'
    amount = Math.round(diffSeconds / 3_600)
  } else if (abs >= 86_400 && abs < 86_400 * 30) {
    unit = 'day'
    amount = Math.round(diffSeconds / 86_400)
  } else if (abs >= 86_400 * 30 && abs < 86_400 * 365) {
    unit = 'month'
    amount = Math.round(diffSeconds / (86_400 * 30))
  } else if (abs >= 86_400 * 365) {
    unit = 'year'
    amount = Math.round(diffSeconds / (86_400 * 365))
  } else {
    amount = 0
  }
  try {
    return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(amount, unit)
  } catch {
    return formatDate(value, lang)
  }
}

/** @param {string | number} value @param {string} lang */
export function formatDate(value, lang) {
  const time = parseDate(value)
  if (!time) return '—'
  try {
    return new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'short', day: 'numeric' }).format(time)
  } catch {
    return new Date(time).toISOString().slice(0, 10)
  }
}

/** @param {string | number} value @param {string} lang */
export function formatDateTime(value, lang) {
  const time = parseDate(value)
  if (!time) return '—'
  try {
    return new Intl.DateTimeFormat(lang, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(time)
  } catch {
    return new Date(time).toISOString()
  }
}

/** @param {number} milliseconds */
export function formatCountdown(milliseconds) {
  const total = Math.max(0, Math.ceil(milliseconds / 1_000))
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

/** @param {string | number} value @param {number} [now] */
export function daysSince(value, now = Date.now()) {
  const time = parseDate(value)
  if (!time) return Number.POSITIVE_INFINITY
  return (now - time) / 86_400_000
}

/**
 * @template {(...args: any[]) => any} F
 * @param {F} fn
 * @param {number} wait
 */
export function debounce(fn, wait) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  /** @type {Parameters<F> | undefined} */
  let lastArgs
  const wrapped = (...args) => {
    lastArgs = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      fn(...lastArgs)
    }, wait)
  }
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
  }
  wrapped.flush = () => {
    if (!timer || !lastArgs) return
    clearTimeout(timer)
    timer = undefined
    fn(...lastArgs)
  }
  return wrapped
}

/**
 * @param {number} milliseconds
 * @param {AbortSignal} [signal]
 */
export function sleep(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve(undefined)
    }, Math.max(0, milliseconds))
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function abortError() {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

/** @param {unknown} error */
export function isAbortError(error) {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
}

/**
 * @param {string} value
 * @returns {Promise<boolean>}
 */
export async function copyText(value) {
  const text = String(value || '')
  if (!text) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the textarea fallback
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.className = 'clipboard-helper'
    document.body.append(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 */
export function createEl(tag, className, text) {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text !== undefined) element.textContent = text
  return element
}

/** @param {Element | null | undefined} element @param {string} text */
export function setText(element, text) {
  if (element) element.textContent = text
}

/** @param {string[]} values */
export function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))]
}

/** @param {string} value */
export function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** @param {string} value */
export function encodePath(value) {
  return String(value)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}
