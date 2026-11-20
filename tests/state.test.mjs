import test from 'node:test'
import assert from 'node:assert/strict'

import { CONFIG } from '../assets/config.js'
import {
  DEFAULT_FILTERS,
  applyManifest,
  buildInstallCommand,
  buildPinnedInstallCommand,
  categoryCounts,
  computeResults,
  countActiveFilters,
  createRepo,
  filterRepos,
  makeHash,
  mergeSearchItems,
  nextVisibleCount,
  npmUrl,
  parseFilters,
  parseHash,
  serializeFilters,
  sortRepos,
} from '../assets/state.js'

const categories = CONFIG.categories

function rawItem(overrides = {}) {
  return {
    full_name: 'owner/dsh-example',
    name: 'dsh-example',
    owner: { login: 'owner', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
    html_url: 'https://github.com/owner/dsh-example',
    description: 'A DSH plugin for testing.',
    topics: ['dsh', 'dsh-plugin'],
    stargazers_count: 123,
    forks_count: 4,
    open_issues_count: 1,
    language: 'TypeScript',
    license: { spdx_id: 'MIT', name: 'MIT License' },
    created_at: '2026-01-02T00:00:00Z',
    pushed_at: '2026-11-18T00:00:00Z',
    updated_at: '2026-11-18T00:00:00Z',
    default_branch: 'main',
    homepage: null,
    archived: false,
    ...overrides,
  }
}

function verifiedManifest(overrides = {}) {
  return {
    status: 'verified',
    packageName: 'dsh-example',
    version: '1.0.0',
    description: '',
    keywords: ['dsh'],
    license: 'MIT',
    repository: 'https://github.com/owner/dsh-example',
    enginesDsh: '>=0.2.0',
    patch: ['./cordis.patch.yml'],
    webUi: false,
    checkedAt: 1,
    source: 'raw',
    manifestUrl: 'https://raw.githubusercontent.com/owner/dsh-example/HEAD/package.json',
    ...overrides,
  }
}

test('createRepo normalizes a GitHub search item', () => {
  const repo = createRepo(rawItem(), 'stars', categories)
  assert.equal(repo.key, 'owner/dsh-example')
  assert.equal(repo.fullName, 'owner/dsh-example')
  assert.equal(repo.owner, 'owner')
  assert.equal(repo.stars, 123)
  assert.equal(repo.licenseSpdx, 'MIT')
  assert.deepEqual(repo.sources, ['stars'])
  assert.equal(repo.verified, false)
  assert.equal(repo.installCommand, null)
  assert.equal(repo.category, 'other')
  assert.ok(repo.searchText.includes('dsh-plugin'))
})

test('createRepo rejects malformed names', () => {
  assert.equal(createRepo(rawItem({ full_name: 'nope' }), 'stars', categories), null)
  assert.equal(createRepo(rawItem({ full_name: 'a/b/c' }), 'stars', categories), null)
})

test('mergeSearchItems deduplicates and merges sources', () => {
  const map = new Map()
  const first = mergeSearchItems(map, [rawItem()], 'stars', categories)
  assert.equal(first.added.length, 1)
  assert.equal(map.size, 1)
  const second = mergeSearchItems(
    map,
    [rawItem({ stargazers_count: 999, description: 'Updated description' })],
    'updated',
    categories,
  )
  assert.equal(second.added.length, 0)
  assert.equal(second.changed.length, 1)
  const repo = map.get('owner/dsh-example')
  assert.equal(repo.stars, 999)
  assert.equal(repo.description, 'Updated description')
  assert.deepEqual(repo.sources, ['stars', 'updated'])
})

test('applyManifest marks installability and recomputes category', () => {
  const repo = createRepo(rawItem({ description: 'A neon theme for DSH' }), 'stars', categories)
  applyManifest(repo, verifiedManifest(), categories)
  assert.equal(repo.verified, true)
  assert.equal(repo.category, 'theme')
  assert.equal(repo.installCommand, 'dsh plugin --profile web add dsh-example')
  assert.equal(buildPinnedInstallCommand(repo), 'dsh plugin --profile web add dsh-example@1.0.0')
  assert.equal(buildInstallCommand(repo), repo.installCommand)
})

test('filterRepos applies verified, archive, category, language, license, days and text', () => {
  const now = Date.parse('2026-11-20T00:00:00Z')
  const verified = createRepo(rawItem(), 'stars', categories)
  applyManifest(verified, verifiedManifest(), categories)
  const unverified = createRepo(rawItem({ full_name: 'owner/dsh-other', name: 'dsh-other' }), 'stars', categories)
  const archived = createRepo(rawItem({ full_name: 'owner/dsh-old', name: 'dsh-old', archived: true }), 'stars', categories)
  applyManifest(archived, verifiedManifest({ packageName: 'dsh-old' }), categories)
  const old = createRepo(rawItem({ full_name: 'owner/dsh-ancient', name: 'dsh-ancient', pushed_at: '2025-01-01T00:00:00Z' }), 'stars', categories)
  applyManifest(old, verifiedManifest({ packageName: 'dsh-ancient' }), categories)
  const repos = [verified, unverified, archived, old]

  assert.deepEqual(
    filterRepos(repos, { ...DEFAULT_FILTERS }, 'en', now).map((repo) => repo.key).sort(),
    ['owner/dsh-ancient', 'owner/dsh-example'],
  )
  assert.equal(filterRepos(repos, { ...DEFAULT_FILTERS, verifiedOnly: false }, 'en', now).length, 3)
  assert.equal(
    filterRepos(repos, { ...DEFAULT_FILTERS, verifiedOnly: false, archived: true }, 'en', now).length,
    4,
  )
  assert.equal(
    filterRepos(repos, { ...DEFAULT_FILTERS, verifiedOnly: false, category: 'theme' }, 'en', now).length,
    0,
  )
  assert.equal(
    filterRepos(repos, { ...DEFAULT_FILTERS, q: 'testing' }, 'en', now).length,
    2,
  )
  assert.equal(
    filterRepos(repos, { ...DEFAULT_FILTERS, days: 30 }, 'en', now).length,
    1,
  )
  assert.equal(
    filterRepos(repos, { ...DEFAULT_FILTERS, language: 'JavaScript' }, 'en', now).length,
    0,
  )
})

test('sortRepos puts verified first for recommended and honors simple sorts', () => {
  const a = createRepo(rawItem({ full_name: 'a/dsh-a', name: 'dsh-a', stargazers_count: 10 }), 'stars', categories)
  const b = createRepo(rawItem({ full_name: 'b/dsh-b', name: 'dsh-b', stargazers_count: 20 }), 'stars', categories)
  applyManifest(b, verifiedManifest({ packageName: 'dsh-b' }), categories)
  assert.deepEqual(sortRepos([a, b], 'recommended', 'en').map((repo) => repo.key), ['b/dsh-b', 'a/dsh-a'])
  assert.deepEqual(sortRepos([a, b], 'stars', 'en').map((repo) => repo.key), ['b/dsh-b', 'a/dsh-a'])
  assert.deepEqual(sortRepos([b, a], 'name', 'en').map((repo) => repo.key), ['a/dsh-a', 'b/dsh-b'])
})

test('computeResults composes filtering and sorting', () => {
  const a = createRepo(rawItem({ full_name: 'a/dsh-a', name: 'dsh-a', stargazers_count: 300 }), 'stars', categories)
  const b = createRepo(rawItem({ full_name: 'b/dsh-b', name: 'dsh-b', stargazers_count: 100 }), 'stars', categories)
  applyManifest(a, verifiedManifest({ packageName: 'dsh-a' }), categories)
  applyManifest(b, verifiedManifest({ packageName: 'dsh-b' }), categories)
  const result = computeResults([b, a], { ...DEFAULT_FILTERS, sort: 'stars' }, 'en')
  assert.deepEqual(result.map((repo) => repo.key), ['a/dsh-a', 'b/dsh-b'])
})

test('inferCategory uses keywords without matching substrings for short tokens', () => {
  const theme = createRepo(rawItem({ full_name: 'o/dsh-theme', name: 'dsh-theme', description: 'A neon theme' }), 'stars', categories)
  assert.equal(theme.category, 'theme')
  const memory = createRepo(rawItem({ full_name: 'o/dsh-memory', name: 'dsh-memory', description: 'Long-term memory with SQLite' }), 'stars', categories)
  assert.equal(memory.category, 'memory')
  const build = createRepo(rawItem({ full_name: 'o/dsh-build', name: 'dsh-build', description: 'A build helper' }), 'stars', categories)
  assert.notEqual(build.category, 'ui')
})

test('URL filter state round-trips and defaults are stable', () => {
  const defaults = parseFilters(new URLSearchParams(''))
  assert.deepEqual(defaults, { ...DEFAULT_FILTERS })
  const custom = {
    q: 'memory',
    sort: 'stars',
    category: 'memory',
    language: 'TypeScript',
    license: 'MIT',
    days: 30,
    verifiedOnly: false,
    archived: true,
  }
  const params = serializeFilters(custom)
  assert.equal(params.get('verified'), '0')
  assert.equal(params.get('archived'), '1')
  assert.deepEqual(parseFilters(params), custom)
  assert.equal(countActiveFilters(custom), 6)
})

test('hash routes encode owner and repository names', () => {
  const hash = makeHash('Owner Name', 'dsh-插件')
  const parsed = parseHash(hash)
  assert.equal(parsed.owner, 'Owner Name')
  assert.equal(parsed.name, 'dsh-插件')
  assert.equal(parsed.key, 'owner name/dsh-插件')
  assert.equal(parseHash('#/p/nope'), null)
  assert.equal(parseHash(''), null)
})

test('nextVisibleCount clamps to the result size', () => {
  assert.equal(nextVisibleCount(0, 100, 36), 36)
  assert.equal(nextVisibleCount(36, 100, 36), 72)
  assert.equal(nextVisibleCount(90, 100, 36), 100)
  assert.equal(nextVisibleCount(0, 0, 36), 0)
})

test('npmUrl supports scoped package names', () => {
  const repo = createRepo(rawItem(), 'stars', categories)
  applyManifest(repo, verifiedManifest({ packageName: '@scope/dsh-example' }), categories)
  assert.equal(npmUrl(repo), 'https://www.npmjs.com/package/%40scope/dsh-example')
})

test('categoryCounts includes every configured category', () => {
  const repo = createRepo(rawItem({ description: 'A neon theme' }), 'stars', categories)
  const counts = categoryCounts([repo], categories)
  assert.equal(counts.size, categories.length)
  assert.equal(counts.get('theme'), 1)
  assert.equal(counts.get('other'), 0)
})
