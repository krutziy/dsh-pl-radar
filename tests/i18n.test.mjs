import test from 'node:test'
import assert from 'node:assert/strict'

import {
  STRINGS,
  detectLanguage,
  getLanguage,
  isLanguage,
  localized,
  setLanguage,
  t,
} from '../assets/i18n.js'

test('zh and en dictionaries have exactly the same keys', () => {
  const zh = Object.keys(STRINGS.zh).sort()
  const en = Object.keys(STRINGS.en).sort()
  assert.deepEqual(zh, en)
})

test('t interpolates variables and falls back to the key', () => {
  setLanguage('zh')
  assert.equal(t('status.shown', { shown: 10, total: 20 }), '已显示 10 / 20')
  assert.equal(t('missing.key'), 'missing.key')
  setLanguage('en')
  assert.equal(t('status.shown', { shown: 10, total: 20 }), 'Showing 10 / 20')
})

test('language detection and helpers are stable', () => {
  assert.equal(isLanguage('zh'), true)
  assert.equal(isLanguage('en'), true)
  assert.equal(isLanguage('fr'), false)
  assert.equal(detectLanguage('en'), 'en')
  assert.equal(detectLanguage('zh'), 'zh')
  assert.equal(detectLanguage('fr'), detectLanguage(undefined))
  setLanguage('en')
  assert.equal(getLanguage(), 'en')
  assert.equal(localized({ zh: '中文', en: 'English' }, 'zh'), '中文')
  assert.equal(localized({ zh: '中文', en: 'English' }, 'en'), 'English')
  assert.equal(localized('plain', 'zh'), 'plain')
})
