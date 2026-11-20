/** Application bootstrap: cache, incremental fetch, manifest verification. */

import { CONFIG } from './config.js'
import { detectLanguage, setLanguage, t } from './i18n.js'
import { GitHubClient, GitHubError } from './github.js'
import { fetchManifest } from './manifest.js'
import { openDatabase } from './db.js'
import {
  DEFAULT_FILTERS,
  SORT_VALUES,
  applyManifest,
  computeResults,
  mergeSearchItems,
  nextFetchTask,
  normalizeTopicValue,
  parseFilters,
  nextVisibleCount,
  parseHash,
  serializeFilters,
  verificationPriority,
} from './state.js'
import { UI } from './ui.js'
import { debounce, isAbortError, sleep } from './util.js'

const TOKEN_KEY = 'dsh-radar-token'
const LANG_KEY = 'dsh-radar-lang'
const PAGE_LIMIT = 10

const params = new URLSearchParams(location.search)
const topic = normalizeTopicValue(params.get('topic')) || CONFIG.topic
const demo = params.get('demo') === '1'

function readStorage(storage, key) {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function writeStorage(storage, key, value) {
  try {
    if (value === null || value === undefined) storage?.removeItem(key)
    else storage?.setItem(key, value)
  } catch {
    // storage can be unavailable in private mode
  }
}

function storageFor(kind) {
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage
  } catch {
    return null
  }
}

function readSessionToken() {
  return readStorage(storageFor('session'), TOKEN_KEY) || ''
}

const initialLanguage = detectLanguage(readStorage(storageFor('local'), LANG_KEY))
setLanguage(initialLanguage)

function totalWindowPages() {
  return CONFIG.windows.reduce((total, windowConfig) => total + Math.min(PAGE_LIMIT, Math.max(1, windowConfig.pages)), 0)
}

const state = {
  topic,
  demo,
  lang: initialLanguage,
  repositories: new Map(),
  filters: parseFilters(params),
  results: [],
  meta: {
    topic,
    windows: {},
    fetchedAt: null,
    complete: false,
    totalCount: null,
  },
  loading: !demo,
  error: null,
  rate: null,
  verification: {
    attempted: 0,
    limit: CONFIG.verify.limit,
    active: 0,
    verified: 0,
  },
  progress: { done: 0, total: totalWindowPages() },
  visibleCount: CONFIG.batchSize,
  renderedCount: 0,
  hasMoreRemote: false,
  fetchAll: false,
  hasToken: Boolean(readSessionToken()),
}

let ui = null
let db = null
let client = null
let verifier = null
let activeController = null
let pendingDetailKey = null
let fetchAllRunning = false
let fetchAllAbort = null

function recomputeResults() {
  state.results = computeResults([...state.repositories.values()], state.filters, state.lang)
  return state.results
}

function updateProgress() {
  let done = 0
  let total = 0
  for (const windowConfig of CONFIG.windows) {
    const pages = Math.min(PAGE_LIMIT, Math.max(1, windowConfig.pages))
    const page = Math.min(pages, Math.max(0, Number(state.meta.windows?.[windowConfig.id]?.page) || 0))
    total += pages
    done += page
  }
  state.progress = { done, total }
}

function persistMeta() {
  if (!db) return Promise.resolve()
  return db.saveMeta({ ...state.meta, topic: state.topic }).catch(() => {})
}

function persistRepos(repos) {
  if (!db || !repos?.length) return Promise.resolve()
  return db.saveRepos(repos).catch(() => {})
}

function writeUrl() {
  const query = serializeFilters(state.filters)
  if (state.topic !== CONFIG.topic) query.set('topic', state.topic)
  if (state.demo) query.set('demo', '1')
  const search = query.toString()
  const next = `${location.pathname}${search ? `?${search}` : ''}${location.hash}`
  if (next !== `${location.pathname}${location.search}${location.hash}`) {
    history.replaceState(history.state, '', next)
  }
}

const scheduleDataUpdate = debounce(() => {
  recomputeResults()
  const nearTop = window.scrollY < 500
  const atBottom =
    window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 500
  if (atBottom && state.results.length > state.renderedCount) {
    state.visibleCount = nextVisibleCount(state.renderedCount, state.results.length, CONFIG.batchSize)
  }
  ui.renderAll({ reset: nearTop, preserveScroll: !nearTop })
  if (pendingDetailKey && state.repositories.has(pendingDetailKey)) {
    const key = pendingDetailKey
    pendingDetailKey = null
    ui.openDetail(key, { updateHash: false })
  }
}, 180)

function setVerificationState(active, attempted) {
  state.verification.active = active
  state.verification.attempted = attempted
  state.verification.verified = [...state.repositories.values()].filter((repo) => repo.verified).length
  ui.renderCache()
  ui.renderStats()
  ui.renderStatus()
}

class Verifier {
  constructor({ limit, concurrency, onStart, onResult, onProgress }) {
    this.limit = limit
    this.concurrency = concurrency
    this.onStart = onStart
    this.onResult = onResult
    this.onProgress = onProgress
    /** @type {Array<Record<string, any>>} */
    this.queue = []
    this.queued = new Set()
    this.seen = new Set()
    this.active = 0
    this.attempted = 0
  }

  add(repos, { force = false } = {}) {
    for (const repo of repos || []) {
      if (!repo?.key || this.seen.has(repo.key) || this.queued.has(repo.key)) continue
      if (!force && repo.manifest?.status !== 'pending') continue
      if (!force && this.attempted + this.queue.length + this.active >= this.limit) continue
      this.queue.push(repo)
      this.queued.add(repo.key)
    }
    this.queue.sort((a, b) => verificationPriority(b) - verificationPriority(a))
    this.pump()
  }

  force(repo) {
    if (!repo?.key) return
    this.seen.delete(repo.key)
    this.queued.delete(repo.key)
    repo.manifest = { status: 'pending', reason: null, checkedAt: null }
    repo.verified = false
    repo.installCommand = null
    this.add([repo], { force: true })
  }

  pump() {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const repo = this.queue.shift()
      if (!repo || this.seen.has(repo.key)) continue
      this.queued.delete(repo.key)
      this.seen.add(repo.key)
      this.active += 1
      this.attempted += 1
      repo.manifest = { status: 'checking', reason: null, checkedAt: null }
      this.onStart?.(repo)
      this.onProgress?.(this.active, this.attempted)
      fetchManifest(repo.fullName, {
        rawTimeoutMs: CONFIG.verify.rawTimeoutMs,
        cdnTimeoutMs: CONFIG.verify.cdnTimeoutMs,
        maxBytes: CONFIG.verify.maxBytes,
      })
        .then((result) => {
          this.onResult?.(repo, result)
        })
        .catch(() => {
          this.onResult?.(repo, { status: 'unreachable', reason: 'network', checkedAt: Date.now() })
        })
        .finally(() => {
          this.active = Math.max(0, this.active - 1)
          this.onProgress?.(this.active, this.attempted)
          this.pump()
        })
    }
  }

  reset() {
    this.queue = []
    this.queued.clear()
    this.seen.clear()
    this.active = 0
    this.attempted = 0
    this.onProgress?.(0, 0)
  }
}

function createVerifier() {
  verifier = new Verifier({
    limit: CONFIG.verify.limit,
    concurrency: CONFIG.verify.concurrency,
    onStart(repo) {
      ui.updateRepo(repo.key)
      ui.renderCache()
    },
    onResult(repo, result) {
      if (state.repositories.get(repo.key) !== repo) return
      applyManifest(repo, result, CONFIG.categories)
      persistRepos([repo])
      ui.updateRepo(repo.key)
      ui.renderCache()
      ui.renderStats()
      scheduleDataUpdate()
    },
    onProgress(active, attempted) {
      setVerificationState(active, attempted)
    },
  })
}

const actions = {
  setFilter(name, value) {
    if (name === 'q') {
      state.filters.q = String(value ?? '').slice(0, 200)
    } else if (name === 'sort') {
      if (SORT_VALUES.includes(value)) state.filters.sort = value
    } else if (name === 'category') {
      state.filters.category = String(value || 'all')
    } else if (name === 'language') {
      state.filters.language = String(value || 'all')
    } else if (name === 'license') {
      state.filters.license = String(value || 'all')
    } else if (name === 'days') {
      const days = Number(value)
      state.filters.days = [0, 7, 30, 90].includes(days) ? days : 0
    } else if (name === 'verifiedOnly') {
      state.filters.verifiedOnly = value === true || value === 'true' || value === 1 || value === '1'
    } else if (name === 'archived') {
      state.filters.archived = value === true || value === 'true' || value === 1 || value === '1'
    }
    state.visibleCount = CONFIG.batchSize
    writeUrl()
    recomputeResults()
    ui.renderAll({ reset: true })
  },

  clearFilters() {
    state.filters = { ...DEFAULT_FILTERS }
    state.visibleCount = CONFIG.batchSize
    if (ui.els.search) ui.els.search.value = ''
    if (ui.els.sort) ui.els.sort.value = 'recommended'
    if (ui.els.verified) ui.els.verified.checked = true
    if (ui.els.days) ui.els.days.value = '0'
    if (ui.els.archived) ui.els.archived.checked = false
    ui.toggleFilters(false)
    writeUrl()
    recomputeResults()
    ui.renderAll({ reset: true })
  },

  refresh() {
    refreshFromScratch()
  },

  retry() {
    if (state.loading || state.fetchAll) return
    if (state.hasMoreRemote) loadNextTask()
    else refreshFromScratch()
  },

  toggleFetchAll() {
    if (state.fetchAll) stopFetchAll()
    else startFetchAll()
  },

  loadMoreRemote() {
    if (!state.hasMoreRemote || state.loading || state.fetchAll) return
    loadNextTask()
  },

  saveToken(value) {
    writeStorage(storageFor('session'), TOKEN_KEY, value)
    state.hasToken = Boolean(value)
    client?.clearBlock()
    if (state.error?.kind === 'auth') state.error = null
    ui.renderRate()
    ui.toast(t('settings.tokenSaved'))
  },

  clearToken() {
    writeStorage(storageFor('session'), TOKEN_KEY, null)
    state.hasToken = false
    client?.clearBlock()
    if (state.error?.kind === 'auth') state.error = null
    ui.renderRate()
    ui.toast(t('settings.tokenCleared'))
  },

  async clearCache() {
    stopFetchAll()
    if (activeController) activeController.abort()
    activeController = null
    state.loading = false
    try {
      await db?.clear()
    } catch {
      // a cache failure must not block the refetch
    }
    verifier?.reset()
    state.repositories.clear()
    state.meta = { topic: state.topic, windows: {}, fetchedAt: null, complete: false, totalCount: null }
    state.results = []
    state.error = null
    state.rate = null
    state.verification.attempted = 0
    state.verification.active = 0
    state.verification.verified = 0
    state.verification.limit = CONFIG.verify.limit
    state.visibleCount = CONFIG.batchSize
    state.renderedCount = 0
    state.hasMoreRemote = true
    updateProgress()
    ui.els.settingsDialog?.close()
    ui.renderAll({ reset: true })
    loadNextTask()
  },

  async checkNpm(key) {
    const repo = state.repositories.get(key)
    if (!repo?.manifest?.packageName) return
    repo.npm = { status: 'loading' }
    ui.setNpmResult(key)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8_000)
    try {
      const response = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(repo.manifest.packageName)}/latest`,
        { headers: { Accept: 'application/json' }, signal: controller.signal, cache: 'no-store' },
      )
      if (!response.ok) throw new Error(`npm HTTP ${response.status}`)
      const data = await response.json()
      repo.npm = {
        status: 'found',
        version: typeof data?.version === 'string' ? data.version : null,
        deprecated: Boolean(data?.deprecated),
      }
    } catch {
      repo.npm = { status: 'missing' }
    } finally {
      clearTimeout(timer)
      ui.setNpmResult(key)
    }
  },

  verifyNow(key) {
    const repo = state.repositories.get(key)
    if (repo) verifier?.force(repo)
  },
}

async function loadCache() {
  db = await openDatabase(state.topic)
  const cached = await db.load()
  if (!Array.isArray(cached.repos) || cached.repos.length === 0) {
    state.loading = false
    updateProgress()
    updateRemoteAvailability()
    return { repos: 0 }
  }
  let attempted = 0
  for (const repo of cached.repos) {
    if (!repo || typeof repo.key !== 'string') continue
    if (repo.manifest?.status === 'checking') repo.manifest.status = 'pending'
    if (repo.manifest && repo.manifest.status !== 'pending') attempted += 1
    if (!Array.isArray(repo.sources)) repo.sources = []
    repo.verified = repo.manifest?.status === 'verified'
    if (!repo.searchText) {
      // recomputeDerived is called through applyManifest-like flow below
    }
    state.repositories.set(repo.key, repo)
  }
  // Recompute derived fields using the current config/categories.
  for (const repo of state.repositories.values()) {
    applyManifest(repo, repo.manifest || { status: 'pending', reason: null, checkedAt: null }, CONFIG.categories)
  }
  state.meta = {
    topic: state.topic,
    windows: cached.meta?.windows && typeof cached.meta.windows === 'object' ? cached.meta.windows : {},
    fetchedAt: Number(cached.meta?.fetchedAt) || null,
    complete: Boolean(cached.meta?.complete),
    totalCount: Number.isFinite(cached.meta?.totalCount) ? cached.meta.totalCount : null,
  }
  state.verification.attempted = Math.min(CONFIG.verify.limit, attempted)
  state.verification.limit = Math.max(CONFIG.verify.limit, attempted)
  state.verification.verified = [...state.repositories.values()].filter((repo) => repo.verified).length
  updateProgress()
  recomputeResults()
  updateRemoteAvailability()
  state.loading = false
  state.error = null
  ui.renderAll({ reset: true })
  return { repos: state.repositories.size }
}

async function loadDemo() {
  state.loading = true
  ui.renderAll({ reset: true })
  try {
    const response = await fetch('./tests/fixtures/repos.json', { cache: 'no-store' })
    if (!response.ok) throw new Error(`fixture HTTP ${response.status}`)
    const fixtures = await response.json()
    for (const repo of fixtures) {
      if (!repo?.key) continue
      state.repositories.set(repo.key, repo)
      applyManifest(repo, repo.manifest || { status: 'pending', reason: null, checkedAt: null }, CONFIG.categories)
    }
    state.meta = {
      topic: state.topic,
      windows: Object.fromEntries(
        CONFIG.windows.map((windowConfig) => [
          windowConfig.id,
          { page: Math.min(PAGE_LIMIT, windowConfig.pages), pages: Math.min(PAGE_LIMIT, windowConfig.pages), done: true },
        ]),
      ),
      fetchedAt: Date.now(),
      complete: true,
      totalCount: 32_734,
    }
    state.verification.attempted = [...state.repositories.values()].filter((repo) => repo.manifest.status !== 'pending').length
    state.verification.limit = Math.max(CONFIG.verify.limit, state.verification.attempted)
    state.verification.verified = [...state.repositories.values()].filter((repo) => repo.verified).length
    state.loading = false
    state.error = null
    state.hasMoreRemote = false
    state.meta.complete = true
    updateProgress()
    recomputeResults()
    ui.renderAll({ reset: true })
  } catch (error) {
    state.loading = false
    state.error = { kind: 'network', message: String(error) }
    ui.renderAll({ reset: true })
  }
}

function handleFetchError(error) {
  if (isAbortError(error)) return
  if (state.demo) return
  if (error instanceof GitHubError) {
    if (error.kind === 'auth') {
      state.error = { kind: 'auth', message: error.message }
      return
    }
    if (error.kind === 'rate-limit') {
      state.error = {
        kind: 'rate-limit',
        resetAt: error.resetAt || Date.now() + 60_000,
        message: error.message,
      }
      return
    }
    if (error.kind === 'network') {
      state.error = { kind: 'network', message: error.message }
      return
    }
    state.error = { kind: 'http', message: error.message }
    return
  }
  state.error = { kind: 'network', message: error instanceof Error ? error.message : String(error) }
}

/**
 * The next page to ask GitHub for, in round-robin order: page 1 of every
 * window, then page 2 of every window, and so on. Returns null when every
 * configured page has been fetched.
 */
function nextTask() {
  return nextFetchTask(CONFIG.windows, state.meta.windows, PAGE_LIMIT)
}

function updateRemoteAvailability() {
  const task = nextTask()
  state.hasMoreRemote = Boolean(task)
  state.meta.complete = !task
  return task
}

/**
 * Fetch exactly one search page. It is called on first paint (one page) and
 * again only when the visitor reaches the bottom or clicks "load more".
 */
async function loadNextTask() {
  if (state.demo || !client) return 'unavailable'
  if (state.loading) return 'busy'
  if (state.repositories.size >= CONFIG.maxRepos) {
    state.hasMoreRemote = false
    state.meta.complete = true
    updateProgress()
    persistMeta()
    ui.renderAll({ preserveScroll: true })
    return 'no-more'
  }
  const task = nextTask()
  if (!task) {
    updateRemoteAvailability()
    updateProgress()
    ui.renderAll({ preserveScroll: true })
    return 'no-more'
  }

  const controller = new AbortController()
  activeController = controller
  state.loading = true
  state.error = null
  updateProgress()
  ui.renderAll({ preserveScroll: true })

  try {
    const result = await client.search({
      topic: state.topic,
      window: task.windowConfig,
      page: task.page,
      perPage: CONFIG.perPage,
      signal: controller.signal,
    })
    const { added, changed } = mergeSearchItems(
      state.repositories,
      result.items,
      task.windowConfig.id,
      CONFIG.categories,
    )
    state.meta.windows = {
      ...state.meta.windows,
      [task.windowConfig.id]: {
        page: task.page,
        pages: task.pages,
        done: task.page >= task.pages,
        total: result.totalCount,
      },
    }
    if (result.totalCount !== null && result.totalCount !== undefined) {
      state.meta.totalCount = Math.max(Number(state.meta.totalCount) || 0, result.totalCount)
    }
    state.meta.fetchedAt = Date.now()
    state.rate = result.rate
    updateProgress()
    updateRemoteAvailability()
    verifier.add(added)
    persistRepos([...added, ...changed])
    persistMeta()
    ui.renderWindows()
    ui.renderStatus()
    ui.renderRate()
    scheduleDataUpdate()
    return 'ok'
  } catch (error) {
    handleFetchError(error)
    if (isAbortError(error)) return 'aborted'
    return error instanceof GitHubError ? error.kind : 'error'
  } finally {
    if (activeController === controller) {
      activeController = null
      state.loading = false
      if (ui) ui.remoteArmed = false
      updateRemoteAvailability()
      updateProgress()
      persistMeta()
      ui.renderAll({ preserveScroll: true })
    }
  }
}

/** Refresh drops only the page cursors: existing cards stay while page 1 reloads. */
async function refreshFromScratch() {
  if (state.demo) return
  stopFetchAll()
  if (activeController) activeController.abort()
  activeController = null
  state.loading = false
  state.meta.windows = {}
  state.meta.complete = false
  state.hasMoreRemote = true
  state.error = null
  updateProgress()
  ui.renderAll({ preserveScroll: true })
  await loadNextTask()
}

/**
 * Fetch every remaining search page in one run. This is the only path that
 * intentionally continues in the background, and it can be stopped at any
 * time. Rate limits are waited out instead of aborting the whole run.
 */
async function startFetchAll() {
  if (state.demo || fetchAllRunning || state.loading || !state.hasMoreRemote) return
  fetchAllRunning = true
  state.fetchAll = true
  state.error = null
  fetchAllAbort = new AbortController()
  const signal = fetchAllAbort.signal
  ui.renderAll({ preserveScroll: true })
  try {
    while (fetchAllRunning && state.hasMoreRemote) {
      const result = await loadNextTask()
      if (!fetchAllRunning) break
      if (result === 'ok') continue
      if (result === 'no-more' || result === 'unavailable' || result === 'aborted') break
      if (result === 'busy') {
        try {
          await sleep(250, signal)
        } catch {
          break
        }
        continue
      }
      if (result === 'rate-limit') {
        const wait = Math.max(1_000, (state.error?.resetAt || Date.now() + 60_000) - Date.now() + 500)
        ui.renderAll({ preserveScroll: true })
        try {
          await sleep(wait, signal)
        } catch {
          break
        }
        state.error = null
        ui.renderAll({ preserveScroll: true })
        continue
      }
      break
    }
  } finally {
    fetchAllRunning = false
    state.fetchAll = false
    fetchAllAbort = null
    if (ui) {
      ui.remoteArmed = false
      ui.renderAll({ preserveScroll: true })
    }
  }
}

function stopFetchAll() {
  if (!fetchAllRunning && !state.fetchAll) return
  fetchAllRunning = false
  state.fetchAll = false
  state.error = null
  if (fetchAllAbort) fetchAllAbort.abort()
  if (activeController) activeController.abort()
  if (ui) ui.renderAll({ preserveScroll: true })
}

async function init() {
  state.lang = initialLanguage
  setLanguage(state.lang)
  ui = new UI({ config: CONFIG, state, actions })
  ui.init()

  const initialHash = parseHash(location.hash)
  if (initialHash) pendingDetailKey = initialHash.key

  client = new GitHubClient({
    getToken: readSessionToken,
    onRate(rate) {
      state.rate = rate
      if (ui) ui.renderRate()
    },
  })
  createVerifier()

  if (state.demo) {
    await loadDemo()
    if (location.hash) ui.handleLocation()
    return
  }

  try {
    const cache = await loadCache()
    if (state.repositories.size === 0) {
      await loadNextTask()
    } else {
      state.loading = false
      state.error = null
      ui.renderAll({ reset: false })
    }
  } catch (error) {
    state.loading = false
    state.error = { kind: 'http', message: error instanceof Error ? error.message : String(error) }
    ui.renderAll({ reset: true })
  }

  if (location.hash) {
    ui.handleLocation()
    if (pendingDetailKey && state.repositories.has(pendingDetailKey)) pendingDetailKey = null
  }
}

init().catch((error) => {
  state.loading = false
  state.error = { kind: 'http', message: error instanceof Error ? error.message : String(error) }
  if (ui) ui.renderAll({ reset: true })
})
