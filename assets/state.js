/** Pure repository normalization, filtering, sorting and scoring. */

import { daysSince, isObject, normalizeSearch, parseDate, safeAvatarUrl, safeHttpUrl, uniqueStrings } from './util.js'

export const DEFAULT_FILTERS = Object.freeze({
  q: '',
  sort: 'recommended',
  category: 'all',
  language: 'all',
  license: 'all',
  days: 0,
  verifiedOnly: true,
  archived: false,
})

export const SORT_VALUES = Object.freeze(['recommended', 'stars', 'updated', 'newest', 'name'])
export const DAY_VALUES = Object.freeze([0, 7, 30, 90])

const REPO_NAME = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

/** @param {string} fullName */
export function repoKey(fullName) {
  return String(fullName || '').trim().toLowerCase()
}

/** @param {string} name */
function splitFullName(name) {
  const value = String(name || '')
  const slash = value.indexOf('/')
  if (slash <= 0 || slash === value.length - 1) return null
  return { owner: value.slice(0, slash), name: value.slice(slash + 1) }
}

/** @param {unknown} value */
function numberOrZero(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

/** @param {unknown} value */
function stringOrEmpty(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** @param {unknown} value */
function arrayOfStrings(value) {
  return Array.isArray(value) ? uniqueStrings(value.filter((entry) => typeof entry === 'string')) : []
}

/** @param {string} haystack @param {string} keyword */
function keywordMatch(haystack, keyword) {
  const needle = normalizeSearch(keyword)
  if (!needle) return false
  if (/^[a-z0-9._-]{1,3}$/.test(needle)) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'u').test(haystack)
  }
  return haystack.includes(needle)
}

/**
 * @param {Record<string, any>} repo
 * @param {Array<{ id: string, keywords?: string[] }>} categories
 */
export function inferCategory(repo, categories) {
  const haystack = normalizeSearch(
    [repo.name, repo.description, ...(repo.topics || []), ...(repo.manifest?.keywords || [])].join(' '),
  )
  for (const category of categories) {
    if (category.id === 'other') continue
    if ((category.keywords || []).some((keyword) => keywordMatch(haystack, keyword))) return category.id
  }
  return 'other'
}

/** @param {Record<string, any>} repo */
export function buildSearchText(repo) {
  return normalizeSearch(
    [
      repo.fullName,
      repo.name,
      repo.owner,
      repo.description,
      repo.language,
      repo.licenseSpdx,
      ...(repo.topics || []),
      ...(repo.manifest?.keywords || []),
      repo.manifest?.packageName,
      repo.manifest?.description,
      repo.category,
    ]
      .filter(Boolean)
      .join(' '),
  )
}

/** @param {Record<string, any>} repo */
export function relevanceScore(repo) {
  let score = 0
  if (normalizeSearch(repo.name).includes('dsh')) score += 4
  const text = normalizeSearch([repo.description, ...(repo.topics || [])].join(' '))
  if (text.includes('deepseek harness') || text.includes('deepseek-harness')) score += 3
  if (text.includes('dsh')) score += 2
  if ((repo.topics || []).some((topic) => normalizeSearch(topic) === 'dsh')) score += 2
  score += Math.log10(numberOrZero(repo.stars) + 1)
  if (daysSince(repo.pushedAt) <= 30) score += 1
  if (repo.manifest?.status === 'verified') score += 5
  if (repo.archived) score -= 2
  return score
}

/**
 * @param {Record<string, any>} repo
 * @param {Array<{ id: string, keywords?: string[] }>} categories
 */
export function recomputeDerived(repo, categories) {
  repo.category = inferCategory(repo, categories)
  repo.relevance = relevanceScore(repo)
  repo.verified = repo.manifest?.status === 'verified'
  repo.searchText = buildSearchText(repo)
  repo.installCommand = buildInstallCommand(repo)
  return repo
}

/**
 * @param {Record<string, any>} item - a GitHub search item
 * @param {string} source - fetch window id
 * @param {Array<{ id: string, keywords?: string[] }>} categories
 */
export function createRepo(item, source, categories) {
  if (!isObject(item)) return null
  const fullName = typeof item.full_name === 'string' ? item.full_name.trim() : ''
  if (!REPO_NAME.test(fullName)) return null
  const parts = splitFullName(fullName)
  if (!parts) return null
  const ownerLogin = typeof item.owner?.login === 'string' ? item.owner.login : parts.owner
  const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : parts.name
  const htmlUrl = safeHttpUrl(item.html_url) || `https://github.com/${fullName}`
  const licenseSpdx =
    typeof item.license?.spdx_id === 'string' && item.license.spdx_id.trim()
      ? item.license.spdx_id.trim()
      : 'NOASSERTION'

  const repo = {
    key: repoKey(fullName),
    fullName,
    owner: ownerLogin,
    name,
    url: htmlUrl,
    description: stringOrEmpty(item.description),
    topics: arrayOfStrings(item.topics),
    stars: numberOrZero(item.stargazers_count),
    forks: numberOrZero(item.forks_count),
    openIssues: numberOrZero(item.open_issues_count),
    language: typeof item.language === 'string' && item.language.trim() ? item.language.trim() : null,
    licenseSpdx,
    licenseName: typeof item.license?.name === 'string' ? item.license.name : null,
    createdAt: typeof item.created_at === 'string' ? item.created_at : null,
    pushedAt: typeof item.pushed_at === 'string' ? item.pushed_at : null,
    updatedAt: typeof item.updated_at === 'string' ? item.updated_at : null,
    defaultBranch: typeof item.default_branch === 'string' ? item.default_branch : null,
    homepage: safeHttpUrl(item.homepage),
    avatarUrl: safeAvatarUrl(item.owner?.avatar_url),
    archived: item.archived === true,
    sources: [source],
    manifest: { status: 'pending', reason: null, checkedAt: null },
    verified: false,
    category: 'other',
    relevance: 0,
    searchText: '',
    installCommand: null,
  }
  return recomputeDerived(repo, categories)
}

/**
 * Merge fresh search facts into an existing normalized repo. The manifest is
 * preserved; verification is independent of search-window refreshes.
 * @param {Record<string, any>} existing
 * @param {Record<string, any>} incoming
 */
export function mergeRepo(existing, incoming) {
  existing.stars = incoming.stars
  existing.forks = incoming.forks
  existing.openIssues = incoming.openIssues
  existing.language = incoming.language || existing.language
  existing.licenseSpdx = incoming.licenseSpdx || existing.licenseSpdx
  existing.licenseName = incoming.licenseName || existing.licenseName
  existing.createdAt = incoming.createdAt || existing.createdAt
  existing.pushedAt = incoming.pushedAt || existing.pushedAt
  existing.updatedAt = incoming.updatedAt || existing.updatedAt
  existing.defaultBranch = incoming.defaultBranch || existing.defaultBranch
  existing.homepage = incoming.homepage || existing.homepage
  existing.avatarUrl = incoming.avatarUrl || existing.avatarUrl
  existing.archived = incoming.archived
  if (incoming.description) existing.description = incoming.description
  existing.topics = uniqueStrings([...(existing.topics || []), ...(incoming.topics || [])])
  existing.sources = uniqueStrings([...(existing.sources || []), ...(incoming.sources || [])])
  return existing
}

/**
 * @param {Map<string, Record<string, any>>} map
 * @param {Array<Record<string, any>>} items
 * @param {string} source
 * @param {Array<{ id: string, keywords?: string[] }>} categories
 * @returns {{ added: Array<Record<string, any>>, changed: Array<Record<string, any>> }}
 */
export function mergeSearchItems(map, items, source, categories) {
  const added = []
  const changed = []
  for (const item of items || []) {
    const incoming = createRepo(item, source, categories)
    if (!incoming) continue
    const existing = map.get(incoming.key)
    if (existing) {
      mergeRepo(existing, incoming)
      changed.push(existing)
    } else {
      map.set(incoming.key, incoming)
      added.push(incoming)
    }
  }
  return { added, changed }
}

/**
 * @param {Record<string, any>} repo
 * @param {Record<string, any>} manifest
 * @param {Array<{ id: string, keywords?: string[] }>} categories
 */
export function applyManifest(repo, manifest, categories) {
  repo.manifest = manifest
  if (manifest?.status === 'verified' && manifest.description && !repo.description) {
    repo.description = manifest.description
  }
  return recomputeDerived(repo, categories)
}

/** @param {Record<string, any>} repo */
export function buildInstallCommand(repo) {
  if (repo?.manifest?.status !== 'verified' || !repo.manifest.packageName) return null
  return `dsh plugin --profile web add ${repo.manifest.packageName}`
}

/** @param {Record<string, any>} repo */
export function buildPinnedInstallCommand(repo) {
  if (repo?.manifest?.status !== 'verified' || !repo.manifest.packageName || !repo.manifest.version) return null
  return `dsh plugin --profile web add ${repo.manifest.packageName}@${repo.manifest.version}`
}

/** @param {Record<string, any>} repo */
export function buildGitInstallCommand(repo) {
  return `dsh plugin --profile web add github:${repo.fullName}`
}

/** @param {Record<string, any>} repo */
export function npmUrl(repo) {
  const packageName = repo?.manifest?.packageName
  if (!packageName) return null
  const path = packageName
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `https://www.npmjs.com/package/${path}`
}

/** @param {Record<string, any>} repo */
export function manifestUrl(repo) {
  return repo?.manifest?.manifestUrl || `https://raw.githubusercontent.com/${repo.fullName}/HEAD/package.json`
}

/**
 * @param {Record<string, any>} repo
 * @param {string} lang
 */
export function categoryLabel(repo, categories, lang) {
  const category = categories.find((entry) => entry.id === repo.category) || categories.find((entry) => entry.id === 'other')
  if (!category) return repo.category
  return category.title?.[lang] || category.title?.en || category.id
}

/**
 * @param {Array<Record<string, any>>} repos
 * @param {Record<string, any>} filters
 * @param {string} lang
 * @param {number} [now]
 */
export function filterRepos(repos, filters, lang, now = Date.now()) {
  const tokens = normalizeSearch(filters.q || '')
    .split(/\s+/)
    .filter(Boolean)
  const category = filters.category || 'all'
  const language = filters.language || 'all'
  const license = filters.license || 'all'
  const days = Number(filters.days) || 0
  const nowValue = now

  return repos.filter((repo) => {
    if (filters.verifiedOnly && !repo.verified) return false
    if (!filters.archived && repo.archived) return false
    if (category !== 'all' && repo.category !== category) return false
    if (language !== 'all' && (repo.language || 'unknown') !== language) return false
    if (license !== 'all' && (repo.licenseSpdx || 'NOASSERTION') !== license) return false
    if (days > 0) {
      const time = parseDate(repo.pushedAt)
      if (!time || nowValue - time > days * 86_400_000) return false
    }
    if (tokens.length) {
      for (const token of tokens) {
        if (!repo.searchText.includes(token)) return false
      }
    }
    return true
  })
}

/**
 * @param {Array<Record<string, any>>} repos
 * @param {string} sort
 * @param {string} lang
 */
export function sortRepos(repos, sort, lang) {
  const copy = [...repos]
  const byName = (left, right) => left.name.localeCompare(right.name, lang, { sensitivity: 'base' })
  const byPush = (left, right) => parseDate(right.pushedAt) - parseDate(left.pushedAt)
  switch (sort) {
    case 'stars':
      copy.sort((a, b) => b.stars - a.stars || Number(b.verified) - Number(a.verified) || byName(a, b))
      break
    case 'updated':
      copy.sort((a, b) => byPush(a, b) || b.stars - a.stars || byName(a, b))
      break
    case 'newest':
      copy.sort((a, b) => parseDate(b.createdAt) - parseDate(a.createdAt) || b.stars - a.stars || byName(a, b))
      break
    case 'name':
      copy.sort((a, b) => byName(a, b) || a.fullName.localeCompare(b.fullName, 'en'))
      break
    case 'recommended':
    default:
      copy.sort(
        (a, b) =>
          Number(b.verified) - Number(a.verified) ||
          (b.relevance || 0) - (a.relevance || 0) ||
          b.stars - a.stars ||
          byPush(a, b) ||
          byName(a, b),
      )
  }
  return copy
}

/**
 * @param {Array<Record<string, any>>} repos
 * @param {Record<string, any>} filters
 * @param {string} lang
 * @param {number} [now]
 */
export function computeResults(repos, filters, lang, now = Date.now()) {
  return sortRepos(filterRepos(repos, filters, lang, now), filters.sort, lang)
}

/** @param {Array<Record<string, any>>} repos */
export function summarize(repos) {
  let verified = 0
  for (const repo of repos) if (repo.verified) verified += 1
  return { loaded: repos.length, verified }
}

/**
 * @param {Array<Record<string, any>>} repos
 * @param {Array<{ id: string }>} categories
 */
export function categoryCounts(repos, categories) {
  const counts = new Map(categories.map((category) => [category.id, 0]))
  for (const repo of repos) {
    const id = counts.has(repo.category) ? repo.category : 'other'
    counts.set(id, (counts.get(id) || 0) + 1)
  }
  return counts
}

/** @param {Array<Record<string, any>>} repos */
export function languageCounts(repos) {
  const counts = new Map()
  for (const repo of repos) {
    const key = repo.language || 'unknown'
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

/** @param {Array<Record<string, any>>} repos */
export function licenseCounts(repos) {
  const counts = new Map()
  for (const repo of repos) {
    const key = repo.licenseSpdx || 'NOASSERTION'
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

/** @param {number} current @param {number} total @param {number} batch */
export function nextVisibleCount(current, total, batch) {
  if (total <= 0) return 0
  return Math.min(total, Math.max(0, current) + Math.max(1, batch))
}

/** @param {Record<string, any>} repo */
export function verificationPriority(repo) {
  return (repo.relevance || 0) + Math.log10((repo.stars || 0) + 1) + (repo.manifest?.status === 'pending' ? 1 : 0)
}

/** @param {unknown} value */
export function isRepoRecord(value) {
  return isObject(value) && typeof value.key === 'string' && typeof value.fullName === 'string'
}

/** @param {Record<string, any>} filters */
export function countActiveFilters(filters) {
  let count = 0
  if (filters.category && filters.category !== 'all') count += 1
  if (filters.language && filters.language !== 'all') count += 1
  if (filters.license && filters.license !== 'all') count += 1
  if (Number(filters.days) > 0) count += 1
  if (!filters.verifiedOnly) count += 1
  if (filters.archived) count += 1
  return count
}

/** @param {URLSearchParams} params */
export function parseFilters(params) {
  const q = typeof params.get('q') === 'string' ? params.get('q').slice(0, 200) : ''
  const sortValue = params.get('sort')
  const sort = SORT_VALUES.includes(sortValue) ? sortValue : 'recommended'
  const daysValue = Number(params.get('days'))
  const days = DAY_VALUES.includes(daysValue) ? daysValue : 0
  const category = params.get('cat') || 'all'
  const language = params.get('lang') || 'all'
  const license = params.get('license') || 'all'
  const verifiedOnly = params.get('verified') === '0' ? false : true
  const archived = params.get('archived') === '1'
  return { q, sort, category, language, license, days, verifiedOnly, archived }
}

/** @param {Record<string, any>} filters */
export function serializeFilters(filters) {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.sort && filters.sort !== 'recommended') params.set('sort', filters.sort)
  if (filters.category && filters.category !== 'all') params.set('cat', filters.category)
  if (filters.language && filters.language !== 'all') params.set('lang', filters.language)
  if (filters.license && filters.license !== 'all') params.set('license', filters.license)
  if (Number(filters.days) > 0) params.set('days', String(filters.days))
  if (!filters.verifiedOnly) params.set('verified', '0')
  if (filters.archived) params.set('archived', '1')
  return params
}

/** @param {string} hash */
export function parseHash(hash) {
  const value = String(hash || '')
  if (!value.startsWith('#/p/')) return null
  const rest = value.slice(4)
  const slash = rest.indexOf('/')
  if (slash <= 0 || slash === rest.length - 1) return null
  let owner
  let name
  try {
    owner = decodeURIComponent(rest.slice(0, slash))
    name = decodeURIComponent(rest.slice(slash + 1))
  } catch {
    return null
  }
  if (!owner || !name) return null
  return { owner, name, key: repoKey(`${owner}/${name}`) }
}

/** @param {string} owner @param {string} name */
export function makeHash(owner, name) {
  return `#/p/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
}

/** @param {string} topic */
export function normalizeTopicValue(topic) {
  const value = String(topic || '').trim().toLowerCase()
  return /^[a-z0-9][a-z0-9-]{0,99}$/.test(value) ? value : null
}

/**
 * The next search page to request, in round-robin order: page 1 of every
 * window, then page 2 of every window, and so on. Returns null when every
 * configured page has been fetched.
 *
 * @param {Array<{ id: string, pages: number }>} windows
 * @param {Record<string, { page?: number } | undefined>} progress
 * @param {number} [pageLimit]
 */
export function nextFetchTask(windows, progress, pageLimit = 10) {
  for (let page = 1; page <= pageLimit; page += 1) {
    for (const windowConfig of windows) {
      const pages = Math.min(pageLimit, Math.max(1, Number(windowConfig.pages) || 1))
      if (page > pages) continue
      const current = Number(progress?.[windowConfig.id]?.page) || 0
      if (current < page) return { windowConfig, page, pages }
    }
  }
  return null
}
