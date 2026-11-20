import test from 'node:test'
import assert from 'node:assert/strict'

import {
  GitHubClient,
  GitHubError,
  buildSearchQuery,
  buildSearchUrl,
  classifyGitHubError,
  normalizeTopic,
  parseRateLimit,
} from '../assets/github.js'

function fakeResponse({ status = 200, body = {}, headers = {} } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    async json() {
      return body
    },
  }
}

test('normalizeTopic accepts a normal topic and rejects malformed values', () => {
  assert.equal(normalizeTopic('dsh-plugin'), 'dsh-plugin')
  assert.equal(normalizeTopic('  DSH-Plugin '), 'dsh-plugin')
  assert.throws(() => normalizeTopic('dsh plugin'), GitHubError)
  assert.throws(() => normalizeTopic(''), GitHubError)
})

test('buildSearchQuery includes topic, fork/archive filters and extra qualifiers', () => {
  assert.equal(
    buildSearchQuery('dsh-plugin', { query: 'created:>=2026-08-01' }),
    'topic:dsh-plugin fork:false created:>=2026-08-01',
  )
  assert.equal(
    buildSearchQuery('dsh-plugin', { query: () => 'created:>=2026-08-01' }),
    'topic:dsh-plugin fork:false created:>=2026-08-01',
  )
})

test('buildSearchUrl sets sort, order, page and page size', () => {
  const url = new URL(buildSearchUrl({ topic: 'dsh-plugin', window: { sort: 'stars', order: 'desc', pages: 10 }, page: 3 }))
  assert.equal(url.origin + url.pathname, 'https://api.github.com/search/repositories')
  assert.equal(url.searchParams.get('q'), 'topic:dsh-plugin fork:false')
  assert.equal(url.searchParams.get('sort'), 'stars')
  assert.equal(url.searchParams.get('order'), 'desc')
  assert.equal(url.searchParams.get('page'), '3')
  assert.equal(url.searchParams.get('per_page'), '100')

  const best = new URL(buildSearchUrl({ topic: 'dsh-plugin', window: { pages: 3 }, page: 11 }))
  assert.equal(best.searchParams.get('page'), '10')
  assert.equal(best.searchParams.has('sort'), false)
})

test('parseRateLimit reads search headers', () => {
  const rate = parseRateLimit(
    new Headers({
      'x-ratelimit-limit': '10',
      'x-ratelimit-remaining': '7',
      'x-ratelimit-reset': '1795000000',
      'x-ratelimit-used': '3',
      'x-ratelimit-resource': 'search',
    }),
  )
  assert.equal(rate.limit, 10)
  assert.equal(rate.remaining, 7)
  assert.equal(rate.resetAt, 1_795_000_000_000)
  assert.equal(rate.authenticated, false)
  assert.equal(rate.resource, 'search')
})

test('classifyGitHubError separates auth, rate limits and bad queries', () => {
  const now = 1_795_000_000_000
  assert.equal(classifyGitHubError(401, { message: 'Bad credentials' }, parseRateLimit(null), now).kind, 'auth')
  assert.equal(classifyGitHubError(422, { message: 'Validation failed' }, parseRateLimit(null), now).kind, 'bad-query')
  const rate = classifyGitHubError(
    403,
    { message: 'API rate limit exceeded' },
    { resetAt: now + 30_000, retryAfter: null, remaining: 0 },
    now,
  )
  assert.equal(rate.kind, 'rate-limit')
  assert.ok(rate.resetAt > now)
  const secondary = classifyGitHubError(
    429,
    { message: 'secondary rate limit' },
    { resetAt: 0, retryAfter: 45, remaining: 3 },
    now,
  )
  assert.equal(secondary.kind, 'rate-limit')
  assert.equal(secondary.resetAt, now + 46_000)
})

test('GitHubClient sends a search request and reports the rate snapshot', async () => {
  let captured
  let observed
  const response = fakeResponse({
    body: { total_count: 42, incomplete_results: false, items: [{ full_name: 'o/r' }] },
    headers: {
      'x-ratelimit-limit': '10',
      'x-ratelimit-remaining': '8',
      'x-ratelimit-reset': '1795000000',
    },
  })
  const client = new GitHubClient({
    getToken: () => '',
    onRate: (rate) => {
      observed = rate
    },
    fetchImpl: async (url, options) => {
      captured = { url, options }
      return response
    },
  })
  const result = await client.search({
    topic: 'dsh-plugin',
    window: { id: 'stars', sort: 'stars', pages: 10 },
    page: 1,
  })
  assert.equal(result.totalCount, 42)
  assert.equal(result.items.length, 1)
  assert.equal(result.incomplete, false)
  assert.equal(observed.remaining, 8)
  assert.equal(captured.options.headers.Authorization, undefined)
  assert.match(captured.url, /topic%3Adsh-plugin\+fork%3Afalse/)
})

test('GitHubClient sends the bearer token when configured', async () => {
  let headers
  const client = new GitHubClient({
    getToken: () => 'ghp_example',
    fetchImpl: async (_url, options) => {
      headers = options.headers
      return fakeResponse({ body: { total_count: 0, items: [] } })
    },
  })
  await client.search({ topic: 'dsh-plugin', window: { pages: 1 }, page: 1 })
  assert.equal(headers.Authorization, 'Bearer ghp_example')
})

test('GitHubClient wraps network failures', async () => {
  const client = new GitHubClient({
    fetchImpl: async () => {
      throw new TypeError('offline')
    },
  })
  await assert.rejects(
    () => client.search({ topic: 'dsh-plugin', window: { pages: 1 }, page: 1 }),
    (error) => error instanceof GitHubError && error.kind === 'network',
  )
})
