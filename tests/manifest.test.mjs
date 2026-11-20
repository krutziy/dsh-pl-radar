import test from 'node:test'
import assert from 'node:assert/strict'

import {
  extractManifest,
  fetchManifest,
  isValidPackageName,
  isValidVersion,
  normalizeRepository,
  parsePackageJson,
} from '../assets/manifest.js'

function validPackage(overrides = {}) {
  return {
    name: 'dsh-example',
    version: '1.2.3',
    description: 'An example plugin.',
    private: false,
    keywords: ['dsh', 'example'],
    license: 'MIT',
    repository: { type: 'git', url: 'git+https://github.com/example/dsh-example.git' },
    engines: { dsh: '>=0.2.0' },
    dsh: {
      bundle: { patch: './cordis.patch.yml' },
      client: { platform: 'web', inject: [] },
    },
    ...overrides,
  }
}

test('extractManifest accepts a valid dsh.bundle manifest', () => {
  const result = extractManifest(validPackage())
  assert.equal(result.status, 'verified')
  assert.equal(result.packageName, 'dsh-example')
  assert.equal(result.version, '1.2.3')
  assert.deepEqual(result.patch, ['./cordis.patch.yml'])
  assert.equal(result.repository, 'https://github.com/example/dsh-example')
  assert.equal(result.license, 'MIT')
  assert.equal(result.enginesDsh, '>=0.2.0')
  assert.equal(result.webUi, true)
})

test('extractManifest accepts an array patch and scoped names', () => {
  const result = extractManifest(
    validPackage({
      name: '@example/dsh-scoped',
      version: '0.1.0-rc.1',
      dsh: { bundle: { patch: ['./a.yml', './b.yml'] } },
    }),
  )
  assert.equal(result.status, 'verified')
  assert.equal(result.packageName, '@example/dsh-scoped')
  assert.deepEqual(result.patch, ['./a.yml', './b.yml'])
  assert.equal(result.webUi, false)
})

test('extractManifest rejects private, invalid, and missing-bundle packages', () => {
  assert.equal(extractManifest(validPackage({ private: true })).status, 'private')
  assert.equal(extractManifest(validPackage({ name: 'Not A Package' })).reason, 'invalid-name')
  assert.equal(extractManifest(validPackage({ version: '1.2' })).reason, 'invalid-version')
  assert.equal(extractManifest(validPackage({ dsh: {} })).reason, 'no-bundle')
  assert.equal(extractManifest(validPackage({ dsh: { bundle: { patch: [] } } })).reason, 'no-bundle')
  assert.equal(extractManifest(null).reason, 'not-object')
})

test('package and version validators match npm/semver basics', () => {
  assert.equal(isValidPackageName('dsh-ok'), true)
  assert.equal(isValidPackageName('@scope/dsh-ok'), true)
  assert.equal(isValidPackageName('Bad Name'), false)
  assert.equal(isValidVersion('1.2.3'), true)
  assert.equal(isValidVersion('1.2.3-beta.1'), true)
  assert.equal(isValidVersion('v1.2.3'), false)
})

test('normalizeRepository handles shorthand and git+ URLs', () => {
  assert.equal(normalizeRepository('github:owner/repo'), 'https://github.com/owner/repo')
  assert.equal(normalizeRepository('git+https://github.com/owner/repo.git'), 'https://github.com/owner/repo')
  assert.equal(normalizeRepository('owner/repo'), 'https://github.com/owner/repo')
  assert.equal(normalizeRepository('javascript:alert(1)'), null)
})

test('peer dependency ranges stand in for engines.dsh', () => {
  const result = extractManifest(
    validPackage({
      engines: {},
      peerDependencies: {
        '@deepseek-ai/dsh': '>=0.2.0',
        '@deepseek-ai/dsh-tool': 'workspace:*',
        react: '^19',
      },
    }),
  )
  assert.equal(result.status, 'verified')
  assert.equal(result.enginesDsh, '>=0.2.0')
})

test('parsePackageJson returns a tagged result', () => {
  assert.deepEqual(parsePackageJson('{"a":1}'), { ok: true, value: { a: 1 } })
  assert.equal(parsePackageJson('{').ok, false)
})

function fakeResponse({ status = 200, body = '', headers = {} } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        return headers[name] ?? headers[name.toLowerCase()] ?? null
      },
    },
    async text() {
      return body
    },
    async json() {
      return JSON.parse(body)
    },
  }
}

test('fetchManifest reads a valid raw package.json', async () => {
  const result = await fetchManifest('example/dsh-example', {
    fetchImpl: async () => fakeResponse({ body: JSON.stringify(validPackage()) }),
    now: () => 123,
  })
  assert.equal(result.status, 'verified')
  assert.equal(result.source, 'raw')
  assert.equal(result.checkedAt, 123)
  assert.match(result.manifestUrl, /raw\.githubusercontent\.com/)
})

test('fetchManifest reports a missing root package.json without falling back', async () => {
  let calls = 0
  const result = await fetchManifest('example/no-package', {
    fetchImpl: async () => {
      calls += 1
      return fakeResponse({ status: 404 })
    },
  })
  assert.equal(result.status, 'missing')
  assert.equal(result.reason, 'file-missing')
  assert.equal(calls, 1)
})

test('fetchManifest falls back to jsDelivr when raw fails', async () => {
  let calls = 0
  const result = await fetchManifest('example/dsh-cdn', {
    fetchImpl: async () => {
      calls += 1
      if (calls === 1) throw new Error('raw blocked')
      return fakeResponse({ body: JSON.stringify(validPackage()) })
    },
  })
  assert.equal(result.status, 'verified')
  assert.equal(result.source, 'cdn')
  assert.match(result.manifestUrl, /cdn\.jsdelivr\.net/)
})

test('fetchManifest reports invalid JSON and unreachable sources', async () => {
  const invalid = await fetchManifest('example/dsh-invalid', {
    fetchImpl: async () => fakeResponse({ body: '{not json' }),
  })
  assert.equal(invalid.status, 'invalid')
  assert.equal(invalid.reason, 'invalid-json')

  const unreachable = await fetchManifest('example/dsh-down', {
    fetchImpl: async () => {
      throw new Error('offline')
    },
  })
  assert.equal(unreachable.status, 'unreachable')
  assert.equal(unreachable.reason, 'network')
})

test('fetchManifest rejects invalid repository names', async () => {
  const result = await fetchManifest('not-a-repo')
  assert.equal(result.status, 'invalid')
  assert.equal(result.reason, 'invalid-repository')
})
