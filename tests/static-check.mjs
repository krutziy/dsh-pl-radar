#!/usr/bin/env node
/** Static checks for the template: CSP, local assets, IDs, i18n keys, secrets. */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { CONFIG } from '../assets/config.js'
import { STRINGS } from '../assets/i18n.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const notes = []

function check(name, condition, detail = '') {
  if (condition) notes.push(`ok   ${name}`)
  else failures.push(`FAIL ${name}${detail ? `: ${detail}` : ''}`)
}

function checkQuiet(name, condition, detail = '') {
  if (!condition) failures.push(`FAIL ${name}${detail ? `: ${detail}` : ''}`)
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

const html = read('index.html')

check('index.html declares a CSP meta tag', /http-equiv="Content-Security-Policy"/i.test(html))
const cspMatch = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)
const csp = cspMatch?.[1] || ''
check("CSP restricts scripts to 'self'", /script-src\s+'self'/.test(csp), csp)
check("CSP restricts styles to 'self'", /style-src\s+'self'/.test(csp), csp)
check("CSP restricts default-src to 'self'", /default-src\s+'self'/.test(csp), csp)
check('CSP whitelists the GitHub API', /connect-src[^;]*https:\/\/api\.github\.com/.test(csp), csp)
check('CSP whitelists raw.githubusercontent.com', /connect-src[^;]*https:\/\/raw\.githubusercontent\.com/.test(csp), csp)
check('CSP whitelists jsDelivr', /connect-src[^;]*https:\/\/cdn\.jsdelivr\.net/.test(csp), csp)

check('no inline <script> blocks', !/<script(?![^>]*\bsrc=)[^>]*>/i.test(html))
check('no inline style attributes in index.html', !/\sstyle="/i.test(html))
check('lang is set on the html element', /<html[^>]*\blang=/.test(html))

const localRefs = [...html.matchAll(/(?:href|src)="(\.\/[^"#?]+)"/g)].map((match) => match[1])
for (const ref of new Set(localRefs)) {
  const relative = ref.replace(/^\.\//, '')
  check(`local asset exists: ${relative}`, exists(relative))
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
check('no duplicate IDs', duplicateIds.length === 0, duplicateIds.join(', '))

const requiredIds = [
  'search-input',
  'sort-select',
  'verified-toggle',
  'filters',
  'category-list',
  'language-select',
  'license-select',
  'days-select',
  'grid',
  'load-more',
  'sentinel',
  'detail-dialog',
  'detail-content',
  'settings-dialog',
  'card-template',
  'status-text',
  'error-banner',
  'fetch-all-button',
]
for (const id of requiredIds) check(`required element #${id}`, ids.includes(id))

const i18nKeys = [...html.matchAll(/data-i18n(?:-placeholder|-aria)?="([^"]+)"/g)].map((match) => match[1])
const missingStaticKeys = [...new Set(i18nKeys)].filter((key) => !(key in STRINGS.zh))
check('all static data-i18n keys exist', missingStaticKeys.length === 0, missingStaticKeys.join(', '))

check('README.md exists', exists('README.md'))
check('LICENSE exists', exists('LICENSE'))
check('.nojekyll exists', exists('.nojekyll'))
check('manifest.js exists', exists('assets/manifest.js'))
check('config declares a topic', typeof CONFIG.topic === 'string' && CONFIG.topic.length > 0)
check('config has at least four fetch windows', Array.isArray(CONFIG.windows) && CONFIG.windows.length >= 4)
check(
  'config pages stay within the GitHub 1,000-result cap',
  CONFIG.windows.every((windowConfig) => Number(windowConfig.pages) <= 10),
)

const packageJson = JSON.parse(read('package.json'))
check('package.json test script', typeof packageJson.scripts?.test === 'string')
check('package.json check script', typeof packageJson.scripts?.check === 'string')

const secretPatterns = [/ghp_[A-Za-z0-9]{20,}/, /github_pat_[A-Za-z0-9_]{20,}/, /BEGIN OPENSSH PRIVATE KEY/]
const textExtensions = new Set(['.js', '.mjs', '.json', '.html', '.md', '.css', '.yml', '.yaml', '.txt'])
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.deploy' || entry.name === 'node_modules') continue
    const relative = path.relative(root, path.join(directory, entry.name))
    if (relative === path.join('tests', 'static-check.mjs')) continue
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (textExtensions.has(path.extname(entry.name))) {
      const text = fs.readFileSync(full, 'utf8')
      for (const pattern of secretPatterns) {
        checkQuiet(`no secret pattern in ${path.relative(root, full)}`, !pattern.test(text), pattern.source)
      }
    }
  }
}
walk(root)

for (const line of notes) console.log(line)
if (failures.length) {
  for (const line of failures) console.error(line)
  console.error(`\n${failures.length} check(s) failed.`)
  process.exit(1)
}
console.log(`\nAll ${notes.length} static checks passed.`)
