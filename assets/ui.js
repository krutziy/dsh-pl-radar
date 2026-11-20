/** DOM rendering: card grid, infinite scroll, filters, dialogs. */

import { getLanguage, localized, setLanguage as setI18nLanguage, t } from './i18n.js?v=20261120-2'
import {
  buildGitInstallCommand,
  buildPinnedInstallCommand,
  categoryCounts,
  categoryLabel,
  countActiveFilters,
  languageCounts,
  licenseCounts,
  makeHash,
  manifestUrl,
  nextVisibleCount,
  npmUrl,
  summarize,
} from './state.js?v=20261120-2'
import {
  avatarTone,
  copyText,
  createEl,
  debounce,
  formatCount,
  formatCountdown,
  formatDate,
  formatDateTime,
  formatRelative,
  initials,
  setText,
} from './util.js?v=20261120-2'

const ICON_STAR = '★'
const ICON_UPDATED = '↻'

/** @param {unknown} value */
function asText(value) {
  return value === null || value === undefined ? '' : String(value)
}

export class UI {
  /**
   * @param {{
   *   config: any,
   *   state: any,
   *   actions: {
   *     setFilter: (name: string, value: any) => void,
   *     clearFilters: () => void,
   *     refresh: () => void,
   *     saveToken: (token: string) => void,
   *     clearToken: () => void,
   *     clearCache: () => void,
   *     checkNpm: (key: string) => void,
   *     verifyNow: (key: string) => void,
   *     loadMoreRemote: () => void,
   *     retry: () => void,
   *     toggleFetchAll: () => void,
   *   },
   * }} options
   */
  constructor({ config, state, actions }) {
    this.config = config
    this.state = state
    this.actions = actions
    this.els = {}
    this.observer = null
    this.modalKey = null
    this.lastFocused = null
    this.toastTimer = null
    this.countdownTimer = null
    this.filterSignature = ''
    this.remoteArmed = false
    this.lastScrollY = 0
    this.searchDebounced = debounce((value) => {
      this.actions.setFilter('q', value)
    }, 160)
  }

  init() {
    this.cacheElements()
    this.applyStaticI18n()
    this.initTheme()
    this.bindEvents()
    this.setupInfiniteScroll()
    this.renderAll({ reset: true })
    return this
  }

  cacheElements() {
    const byId = (id) => document.getElementById(id)
    this.els = {
      stats: {
        total: byId('stat-total'),
        loaded: byId('stat-loaded'),
        verified: byId('stat-verified'),
        updated: byId('stat-updated'),
      },
      search: byId('search-input'),
      sort: byId('sort-select'),
      verified: byId('verified-toggle'),
      filterButton: byId('filter-button'),
      filterCount: byId('filter-count'),
      filters: byId('filters'),
      filtersClose: byId('filters-close'),
      categoryList: byId('category-list'),
      language: byId('language-select'),
      license: byId('license-select'),
      days: byId('days-select'),
      archived: byId('archived-toggle'),
      clearFilters: byId('clear-filters'),
      activeFilters: byId('active-filters'),
      grid: byId('grid'),
      empty: byId('empty-state'),
      emptyTitle: byId('empty-title'),
      emptyHint: byId('empty-hint'),
      emptyClear: byId('empty-clear'),
      loadingMore: byId('loading-more'),
      sentinel: byId('sentinel'),
      loadMore: byId('load-more'),
      endNote: byId('end-note'),
      status: byId('status-text'),
      progressToggle: byId('progress-toggle'),
      progressPanel: byId('progress-panel'),
      windowList: byId('window-list'),
      verifyLine: byId('verify-line'),
      rateLine: byId('rate-line'),
      cacheLine: byId('cache-line'),
      refresh: byId('refresh-button'),
      fetchAllButton: byId('fetch-all-button'),
      errorBanner: byId('error-banner'),
      errorTitle: byId('error-title'),
      errorBody: byId('error-body'),
      errorRetry: byId('error-retry'),
      langToggle: byId('lang-toggle'),
      themeToggle: byId('theme-toggle'),
      settingsButton: byId('settings-button'),
      settingsDialog: byId('settings-dialog'),
      settingsClose: byId('settings-close'),
      settingsRate: byId('settings-rate'),
      tokenInput: byId('token-input'),
      tokenStatus: byId('token-status'),
      saveToken: byId('save-token'),
      clearToken: byId('clear-token'),
      clearCache: byId('clear-cache'),
      detailDialog: byId('detail-dialog'),
      detailContent: byId('detail-content'),
      cardTemplate: byId('card-template'),
      toast: byId('toast'),
      footerUpdated: byId('footer-updated'),
      repoLink: byId('repo-link'),
      repoLink2: byId('repo-link-2'),
      topicLink: byId('topic-link'),
      footerRepo: byId('footer-repo'),
    }
    for (const link of [this.els.repoLink, this.els.repoLink2, this.els.footerRepo]) {
      if (link) link.href = `https://github.com/${this.config.repo}`
    }
    if (this.els.topicLink) this.els.topicLink.href = `https://github.com/topics/${this.state.topic}`
    if (this.els.search && this.state.filters.q) this.els.search.value = this.state.filters.q
    if (this.els.sort) this.els.sort.value = this.state.filters.sort
    if (this.els.verified) this.els.verified.checked = Boolean(this.state.filters.verifiedOnly)
  }

  initTheme() {
    let stored = null
    try {
      stored = localStorage.getItem('dsh-radar-theme')
    } catch {
      stored = null
    }
    const preferred =
      stored === 'dark' || stored === 'light'
        ? stored
        : window.matchMedia?.('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
    document.documentElement.dataset.theme = preferred
    this.updateThemeButton()
  }

  updateThemeButton() {
    const dark =
      document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
    const label = dark ? t('theme.toLight') : t('theme.toDark')
    this.els.themeToggle?.setAttribute('aria-label', label)
    this.els.themeToggle?.setAttribute('title', label)
  }

  toggleTheme() {
    const dark = document.documentElement.dataset.theme === 'dark'
    const next = dark ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('dsh-radar-theme', next)
    } catch {
      // ignore storage failures
    }
    this.updateThemeButton()
  }

  applyStaticI18n() {
    for (const element of document.querySelectorAll('[data-i18n]')) {
      const key = element.getAttribute('data-i18n')
      if (!key) continue
      const translated = t(key)
      if (translated !== key) element.textContent = translated
    }
    for (const element of document.querySelectorAll('[data-i18n-placeholder]')) {
      const key = element.getAttribute('data-i18n-placeholder')
      if (key) element.setAttribute('placeholder', t(key))
    }
    for (const element of document.querySelectorAll('[data-i18n-aria]')) {
      const key = element.getAttribute('data-i18n-aria')
      if (key) element.setAttribute('aria-label', t(key))
    }
    if (this.els.langToggle) this.els.langToggle.textContent = this.state.lang === 'zh' ? 'EN' : '中'
    document.title = t('app.documentTitle')
    document.documentElement.lang = this.state.lang === 'zh' ? 'zh-CN' : 'en'
    this.updateThemeButton()
  }

  bindEvents() {
    this.els.search?.addEventListener('input', (event) => {
      this.searchDebounced(event.target.value)
    })
    this.els.sort?.addEventListener('change', (event) => this.actions.setFilter('sort', event.target.value))
    this.els.verified?.addEventListener('change', (event) => this.actions.setFilter('verifiedOnly', event.target.checked))
    this.els.filterButton?.addEventListener('click', () => this.toggleFilters())
    this.els.filtersClose?.addEventListener('click', () => this.toggleFilters(false))
    this.els.clearFilters?.addEventListener('click', () => this.actions.clearFilters())
    this.els.emptyClear?.addEventListener('click', () => this.actions.clearFilters())
    this.els.categoryList?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-category]')
      if (!button) return
      this.actions.setFilter('category', button.dataset.category)
    })
    this.els.language?.addEventListener('change', (event) => this.actions.setFilter('language', event.target.value))
    this.els.license?.addEventListener('change', (event) => this.actions.setFilter('license', event.target.value))
    this.els.days?.addEventListener('change', (event) => this.actions.setFilter('days', Number(event.target.value)))
    this.els.archived?.addEventListener('change', (event) => this.actions.setFilter('archived', event.target.checked))
    this.els.activeFilters?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove]')
      if (button) {
        this.actions.setFilter(button.dataset.remove, button.dataset.value ?? '')
        return
      }
      if (event.target.closest('[data-clear-all]')) this.actions.clearFilters()
    })
    this.els.grid?.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action
      const card = event.target.closest('[data-key]')
      if (!action || !card) return
      const key = card.dataset.key
      if (action === 'copy') this.copyInstall(key)
      else if (action === 'details') this.openDetail(key)
    })
    this.els.loadMore?.addEventListener('click', () => this.loadMore())
    this.els.refresh?.addEventListener('click', () => this.actions.refresh())
    this.els.fetchAllButton?.addEventListener('click', () => this.actions.toggleFetchAll())
    this.els.errorRetry?.addEventListener('click', () => this.actions.retry())
    this.els.progressToggle?.addEventListener('click', () => this.toggleProgress())
    this.els.langToggle?.addEventListener('click', () => this.toggleLanguage())
    this.els.themeToggle?.addEventListener('click', () => this.toggleTheme())
    this.els.settingsButton?.addEventListener('click', () => this.openSettings())
    this.els.settingsClose?.addEventListener('click', () => this.els.settingsDialog.close())
    this.els.saveToken?.addEventListener('click', () => this.saveToken())
    this.els.clearToken?.addEventListener('click', () => this.clearToken())
    this.els.clearCache?.addEventListener('click', () => this.clearCache())
    this.els.detailDialog?.addEventListener('cancel', (event) => {
      event.preventDefault()
      this.closeDetail()
    })
    this.els.detailDialog?.addEventListener('click', (event) => {
      if (event.target === this.els.detailDialog) this.closeDetail()
    })
    this.els.settingsDialog?.addEventListener('click', (event) => {
      if (event.target === this.els.settingsDialog) this.els.settingsDialog.close()
    })
    window.addEventListener('hashchange', () => this.handleLocation())
    window.addEventListener('popstate', () => this.handleLocation())
    this.lastScrollY = window.scrollY
    window.addEventListener(
      'scroll',
      () => {
        const current = window.scrollY
        if (Math.abs(current - this.lastScrollY) < 4) return
        this.lastScrollY = current
        if (current + window.innerHeight >= document.documentElement.scrollHeight - 500) {
          this.remoteArmed = true
        }
      },
      { passive: true },
    )
    document.addEventListener('keydown', (event) => {
      const target = event.target
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      if (event.key === '/' && !typing) {
        event.preventDefault()
        this.els.search?.focus()
      }
      if (event.key === 'Escape' && !this.els.detailDialog?.open && !this.els.settingsDialog?.open) {
        if (this.els.filters.classList.contains('filters-open')) this.toggleFilters(false)
      }
    })
  }

  setupInfiniteScroll() {
    if (typeof IntersectionObserver !== 'function' || !this.els.sentinel) return
    this.observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        if (this.state.renderedCount < this.state.results.length) {
          this.loadMore()
          return
        }
        if (
          this.remoteArmed &&
          this.state.hasMoreRemote &&
          !this.state.loading &&
          !this.state.fetchAll
        ) {
          this.remoteArmed = false
          this.actions.loadMoreRemote()
        }
      },
      { rootMargin: '600px 0px' },
    )
    this.observer.observe(this.els.sentinel)
  }

  reobserveSentinel() {
    if (!this.observer || !this.els.sentinel) return
    this.observer.unobserve(this.els.sentinel)
    this.observer.observe(this.els.sentinel)
  }

  toggleFilters(force) {
    const open = typeof force === 'boolean' ? force : !this.els.filters.classList.contains('filters-open')
    this.els.filters.classList.toggle('filters-open', open)
    this.els.filterButton?.setAttribute('aria-expanded', String(open))
  }

  toggleProgress() {
    const open = this.els.progressPanel.hidden
    this.els.progressPanel.hidden = !open
    this.els.progressToggle?.setAttribute('aria-expanded', String(open))
  }

  toggleLanguage() {
    const next = this.state.lang === 'zh' ? 'en' : 'zh'
    this.state.lang = next
    setI18nLanguage(next)
    try {
      localStorage.setItem('dsh-radar-lang', next)
    } catch {
      // ignore
    }
    this.applyStaticI18n()
    if (this.state.filters.q && this.els.search) this.els.search.value = this.state.filters.q
    this.renderAll({ reset: true })
    if (this.modalKey) this.renderDetail(this.state.repositories.get(this.modalKey))
  }

  scrollToResults() {
    this.els.grid?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  renderAll({ reset = false, preserveScroll = false } = {}) {
    if (reset) this.remoteArmed = false
    const scrollY = preserveScroll ? window.scrollY : null
    this.renderStats()
    this.renderWindows()
    this.renderFetchAllButton()
    this.renderFilters()
    this.renderActiveFilters()
    this.renderGrid({ reset })
    this.renderStatus()
    this.renderError()
    this.renderRate()
    this.renderCache()
    if (this.modalKey) this.renderDetail(this.state.repositories.get(this.modalKey))
    if (scrollY !== null) {
      requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'auto' }))
    }
  }

  renderStats() {
    const summary = summarize([...this.state.repositories.values()])
    const total = this.state.meta?.totalCount
    setText(this.els.stats.total, total === null || total === undefined ? '—' : formatCount(total, this.state.lang))
    setText(this.els.stats.loaded, formatCount(summary.loaded, this.state.lang))
    setText(this.els.stats.verified, formatCount(summary.verified, this.state.lang))
    const fetchedAt = this.state.meta?.fetchedAt
    setText(this.els.stats.updated, fetchedAt ? formatRelative(fetchedAt, this.state.lang) : '—')
    if (this.els.stats.updated) {
      this.els.stats.updated.title = fetchedAt ? formatDateTime(fetchedAt, this.state.lang) : ''
    }
    if (this.els.footerUpdated) {
      this.els.footerUpdated.textContent = fetchedAt
        ? t('footer.lastFetched', { time: formatDateTime(fetchedAt, this.state.lang) })
        : ''
    }
  }

  renderWindows() {
    if (!this.els.windowList) return
    const fragment = document.createDocumentFragment()
    for (const windowConfig of this.config.windows) {
      const progress = this.state.meta?.windows?.[windowConfig.id] || {}
      const pages = Math.min(10, Math.max(1, Number(windowConfig.pages) || 1))
      const page = Math.min(pages, Math.max(0, Number(progress.page) || 0))
      const row = createEl('div', 'window-row')
      const head = createEl('div', 'window-head')
      head.append(createEl('span', 'window-title', localized(windowConfig.title, this.state.lang)))
      const statusText = page >= pages ? t('progress.done') : page > 0 ? t('progress.page', { page, pages }) : t('progress.notStarted')
      head.append(createEl('span', 'window-status', statusText))
      row.append(head)
      const bar = createEl('progress', 'window-progress')
      bar.max = pages
      bar.value = page
      bar.setAttribute('aria-label', `${localized(windowConfig.title, this.state.lang)}: ${statusText}`)
      row.append(bar)
      fragment.append(row)
    }
    this.els.windowList.replaceChildren(fragment)
  }

  renderFilters() {
    if (!this.els.categoryList) return
    const repos = [...this.state.repositories.values()]
    const categories = this.config.categories
    const counts = categoryCounts(repos, categories)
    const signature = JSON.stringify({
      categories: [...counts.entries()],
      category: this.state.filters.category,
      languages: [...languageCounts(repos).entries()],
      language: this.state.filters.language,
      licenses: [...licenseCounts(repos).entries()],
      license: this.state.filters.license,
      days: this.state.filters.days,
      archived: this.state.filters.archived,
      lang: this.state.lang,
    })
    if (signature === this.filterSignature) {
      this.renderFilterCount()
      return
    }
    this.filterSignature = signature

    const fragment = document.createDocumentFragment()
    const allButton = createEl('button', 'category-button', t('filter.all'))
    allButton.type = 'button'
    allButton.dataset.category = 'all'
    allButton.classList.toggle('is-active', this.state.filters.category === 'all')
    allButton.append(createEl('span', 'category-count', formatCount(repos.length, this.state.lang)))
    fragment.append(allButton)
    for (const category of categories) {
      const count = counts.get(category.id) || 0
      if (category.id === 'other' && count === 0) continue
      const button = createEl('button', 'category-button', localized(category.title, this.state.lang))
      button.type = 'button'
      button.dataset.category = category.id
      button.classList.toggle('is-active', this.state.filters.category === category.id)
      button.append(createEl('span', 'category-count', formatCount(count, this.state.lang)))
      fragment.append(button)
    }
    this.els.categoryList.replaceChildren(fragment)

    this.fillSelect(
      this.els.language,
      [...languageCounts(repos).entries()].sort((a, b) => b[1] - a[1]),
      this.state.filters.language,
      (value) => (value === 'unknown' ? t('misc.unknown') : value),
    )
    this.fillSelect(
      this.els.license,
      [...licenseCounts(repos).entries()].sort((a, b) => b[1] - a[1]),
      this.state.filters.license,
      (value) => (value === 'NOASSERTION' ? t('misc.none') : value),
    )
    if (this.els.days) this.els.days.value = String(this.state.filters.days || 0)
    if (this.els.archived) this.els.archived.checked = Boolean(this.state.filters.archived)
    this.renderFilterCount()
  }

  renderFetchAllButton() {
    const button = this.els.fetchAllButton
    if (!button) return
    const running = Boolean(this.state.fetchAll)
    const noMoreKnown = !this.state.loading && !this.state.hasMoreRemote
    const span = button.querySelector('span')
    const zh = this.state.lang === 'zh'
    const translate = (key, fallback) => {
      const value = t(key)
      return value === key ? fallback : value
    }
    const label = running
      ? translate('actions.stopFetchAll', zh ? '停止抓取' : 'Stop fetching')
      : noMoreKnown
        ? translate('actions.allFetched', zh ? '已全部抓取' : 'All fetched')
        : translate('actions.fetchAll', zh ? '全部抓取' : 'Fetch all')
    if (span) span.textContent = label
    button.disabled = this.state.demo || (!running && (Boolean(this.state.loading) || noMoreKnown))
    button.title = running
      ? label
      : noMoreKnown
        ? translate('actions.allFetched', zh ? '已全部抓取' : 'All fetched')
        : translate('actions.fetchAllTitle', zh ? '抓取所有剩余页面' : 'Fetch every remaining search page')
    button.setAttribute('aria-pressed', String(running))
    button.classList.toggle('is-running', running)
  }

  renderFilterCount() {
    const count = countActiveFilters(this.state.filters)
    if (this.els.filterCount) {
      this.els.filterCount.hidden = count === 0
      this.els.filterCount.textContent = String(count)
    }
    this.els.filterButton?.setAttribute('aria-label', count ? t('filter.activeCount', { count }) : t('filter.title'))
  }

  fillSelect(select, entries, current, labelFn) {
    if (!select) return
    const fragment = document.createDocumentFragment()
    const all = createEl('option', '', t('misc.all'))
    all.value = 'all'
    fragment.append(all)
    for (const [value, count] of entries) {
      const option = createEl('option', '', `${labelFn(value)} (${formatCount(count, this.state.lang)})`)
      option.value = value
      fragment.append(option)
    }
    select.replaceChildren(fragment)
    select.value = current && (current === 'all' || entries.some(([value]) => value === current)) ? current : 'all'
  }

  renderActiveFilters() {
    if (!this.els.activeFilters) return
    const chips = []
    const add = (name, value, label) => {
      const chip = createEl('button', 'filter-chip')
      chip.type = 'button'
      chip.dataset.remove = name
      chip.dataset.value = value
      chip.append(document.createTextNode(`${label} `))
      chip.append(createEl('span', 'chip-x', '×'))
      chips.push(chip)
    }
    if (this.state.filters.q) add('q', '', `“${this.state.filters.q}”`)
    const category = this.config.categories.find((entry) => entry.id === this.state.filters.category)
    if (this.state.filters.category !== 'all' && category) add('category', 'all', localized(category.title, this.state.lang))
    if (this.state.filters.language !== 'all') add('language', 'all', this.state.filters.language)
    if (this.state.filters.license !== 'all') add('license', 'all', this.state.filters.license)
    if (Number(this.state.filters.days) > 0) add('days', '0', t('filter.days') + `: ${this.state.filters.days}d`)
    if (!this.state.filters.verifiedOnly) add('verifiedOnly', true, t('filter.showAll'))
    if (this.state.filters.archived) add('archived', false, t('filter.showArchived'))
    if (!chips.length) {
      this.els.activeFilters.replaceChildren()
      return
    }
    const fragment = document.createDocumentFragment()
    fragment.append(...chips)
    const clear = createEl('button', 'link-button clear-all', t('filter.clear'))
    clear.type = 'button'
    clear.dataset.clearAll = 'true'
    fragment.append(clear)
    this.els.activeFilters.replaceChildren(fragment)
  }

  renderGrid({ reset = false } = {}) {
    if (!this.els.grid) return
    const results = this.state.results || []
    this.els.grid.setAttribute('aria-busy', this.state.loading ? 'true' : 'false')
    if (reset) {
      this.els.grid.replaceChildren()
      this.state.renderedCount = 0
      this.state.visibleCount = Math.max(1, this.config.batchSize || 36)
    }

    if (results.length === 0) {
      const busy = this.state.loading || (this.state.verification?.active || 0) > 0
      if (busy && this.state.repositories.size >= 0) {
        this.renderSkeletons(6)
        this.els.empty.hidden = true
      } else {
        this.els.grid.replaceChildren()
        this.els.empty.hidden = false
        setText(this.els.emptyTitle, t('status.empty'))
        setText(
          this.els.emptyHint,
          this.state.filters.verifiedOnly ? t('status.emptyHint') : t('status.emptyHint'),
        )
      }
      this.updateLoadMore()
      return
    }

    this.els.empty.hidden = true
    const target = Math.min(results.length, Math.max(this.state.visibleCount || this.config.batchSize, this.state.renderedCount))
    const start = this.state.renderedCount || 0
    if (target > start) {
      const fragment = document.createDocumentFragment()
      for (let index = start; index < target; index += 1) {
        fragment.append(this.createCard(results[index]))
      }
      this.els.grid.append(fragment)
      this.state.renderedCount = target
      this.state.visibleCount = Math.max(this.state.visibleCount || 0, target)
    }
    this.updateLoadMore()
    this.reobserveSentinel()
  }

  renderSkeletons(count) {
    if (!this.els.grid) return
    const fragment = document.createDocumentFragment()
    for (let index = 0; index < count; index += 1) {
      const card = createEl('article', 'plugin-card skeleton-card')
      card.setAttribute('aria-hidden', 'true')
      card.append(createEl('div', 'skeleton skeleton-title'))
      card.append(createEl('div', 'skeleton skeleton-line'))
      card.append(createEl('div', 'skeleton skeleton-line short'))
      card.append(createEl('div', 'skeleton skeleton-foot'))
      fragment.append(card)
    }
    this.els.grid.replaceChildren(fragment)
    this.state.renderedCount = 0
  }

  createCard(repo) {
    const template = this.els.cardTemplate
    const article = template.content.firstElementChild.cloneNode(true)
    article.dataset.key = repo.key
    article.setAttribute('data-verified', String(Boolean(repo.verified)))
    const title = article.querySelector('[data-action="details"]')
    if (title) {
      title.textContent = repo.name
      title.title = repo.fullName
      title.setAttribute('aria-label', `${repo.fullName} — ${t('actions.details')}`)
    }
    setText(article.querySelector('[data-owner]'), repo.owner)
    this.fillAvatar(article.querySelector('[data-avatar]'), repo)
    const badge = article.querySelector('[data-badge]')
    const badgeInfo = this.badgeFor(repo)
    if (badge) {
      badge.textContent = badgeInfo.text
      badge.className = `badge ${badgeInfo.className}`
      badge.title = badgeInfo.title
    }
    const desc = article.querySelector('[data-desc]')
    if (desc) {
      desc.textContent = repo.description || t('card.noDescription')
      desc.title = repo.description || ''
    }
    setText(article.querySelector('[data-stars]'), `${ICON_STAR} ${formatCount(repo.stars, this.state.lang)}`)
    setText(article.querySelector('[data-updated]'), `${ICON_UPDATED} ${formatRelative(repo.pushedAt, this.state.lang)}`)
    setText(article.querySelector('[data-language]'), repo.language || t('misc.unknown'))
    setText(article.querySelector('[data-category]'), categoryLabel(repo, this.config.categories, this.state.lang))
    const meta = article.querySelector('.card-meta')
    if (meta) {
      if (repo.archived) meta.append(createEl('span', 'meta-item meta-warn', t('badge.archived')))
      if (repo.manifest?.webUi) meta.append(createEl('span', 'meta-item meta-good', t('badge.webui')))
    }
    const github = article.querySelector('[data-github]')
    if (github) {
      github.href = repo.url
      github.title = t('card.github')
      github.setAttribute('aria-label', `${t('card.github')}: ${repo.fullName}`)
    }
    const copyButton = article.querySelector('[data-action="copy"]')
    if (copyButton) {
      copyButton.disabled = !repo.installCommand
      copyButton.title = repo.installCommand ? t('actions.copy') : t('card.notVerified')
      copyButton.setAttribute('aria-label', repo.installCommand ? `${t('actions.copy')}: ${repo.fullName}` : t('card.notVerified'))
    }
    return article
  }

  fillAvatar(container, repo) {
    if (!container) return
    container.classList.add(`tone-${avatarTone(repo.key)}`)
    const fallback = createEl('span', 'avatar-initial', initials(repo.owner))
    if (!repo.avatarUrl) {
      container.append(fallback)
      return
    }
    const image = document.createElement('img')
    image.src = repo.avatarUrl
    image.alt = ''
    image.loading = 'lazy'
    image.decoding = 'async'
    image.referrerPolicy = 'no-referrer'
    image.addEventListener(
      'error',
      () => {
        image.replaceWith(fallback)
      },
      { once: true },
    )
    container.append(image)
  }

  badgeFor(repo) {
    if (repo.verified) {
      return { text: t('badge.verified'), className: 'badge-verified', title: t('detail.verifyExplain') }
    }
    switch (repo.manifest?.status) {
      case 'private':
        return { text: t('badge.private'), className: 'badge-warning', title: repo.manifest.reason || '' }
      case 'invalid':
        return { text: t('badge.invalid'), className: 'badge-warning', title: repo.manifest.reason || '' }
      case 'unreachable':
        return { text: t('badge.unreachable'), className: 'badge-warning', title: repo.manifest.reason || '' }
      case 'missing':
        return { text: t('badge.topicOnly'), className: 'badge-topic', title: repo.manifest.reason || '' }
      case 'checking':
        return { text: t('badge.checking'), className: 'badge-checking', title: '' }
      default:
        return { text: t('badge.unverified'), className: 'badge-topic', title: '' }
    }
  }

  updateLoadMore() {
    const results = this.state.results || []
    const rendered = this.state.renderedCount || 0
    const localMore = rendered < results.length
    const remoteMore = Boolean(this.state.hasMoreRemote)
    const more = localMore || remoteMore
    const searching = Boolean(this.state.loading)
    const fetchingAll = Boolean(this.state.fetchAll)
    const verifying = (this.state.verification?.active || 0) > 0
    if (this.els.loadMore) this.els.loadMore.hidden = !more || searching || fetchingAll
    if (this.els.loadingMore) {
      this.els.loadingMore.hidden = !(searching && !localMore) && !(verifying && results.length === 0)
    }
    if (this.els.endNote) this.els.endNote.hidden = more || results.length === 0 || searching || verifying
    if (this.els.sentinel) this.els.sentinel.hidden = results.length === 0 && !remoteMore
  }

  loadMore() {
    if (this.state.fetchAll) return
    const results = this.state.results || []
    if ((this.state.renderedCount || 0) < results.length) {
      this.state.visibleCount = nextVisibleCount(
        this.state.renderedCount || 0,
        results.length,
        this.config.batchSize || 36,
      )
      this.renderGrid({ reset: false })
      this.renderStatus()
      this.reobserveSentinel()
      return
    }
    this.remoteArmed = false
    this.actions.loadMoreRemote()
  }

  copyInstall(key) {
    const repo = this.state.repositories.get(key)
    if (!repo?.installCommand) {
      this.toast(t('card.notVerified'))
      return
    }
    copyText(repo.installCommand).then((ok) => {
      this.toast(ok ? t('actions.copied') : t('error.httpBody'))
    })
  }

  renderStatus() {
    if (!this.els.status) return
    const loaded = this.state.repositories.size
    const verified = [...this.state.repositories.values()].filter((repo) => repo.verified).length
    let text = ''
    if (this.state.error) {
      text = t('status.error')
    } else if (this.state.loading) {
      const done = this.state.progress?.done || 0
      const total = this.state.progress?.total || 0
      text = total
        ? t(this.state.fetchAll ? 'status.fetchingAll' : 'status.fetching', { done, total })
        : t('status.loading')
    } else if (this.state.fetchAll && this.state.hasMoreRemote) {
      const done = this.state.progress?.done || 0
      const total = this.state.progress?.total || 0
      text = t('status.fetchingAll', { done, total })
    } else if ((this.state.verification?.active || 0) > 0 && (this.state.results || []).length === 0) {
      text = t('status.verifying', {
        done: this.state.verification.attempted || 0,
        total: this.state.verification.limit || 0,
      })
    } else if (this.state.demo) {
      text = t('status.demo')
    } else {
      const shown = Math.min(this.state.renderedCount || 0, (this.state.results || []).length)
      const total = (this.state.results || []).length
      text = total
        ? t('status.shown', { shown: formatCount(shown, this.state.lang), total: formatCount(total, this.state.lang) })
        : t('status.empty')
      if (this.state.hasMoreRemote) text += ` · ${t('status.scrollMore')}`
      if (loaded && verified) text += ` · ${t('status.ready', { loaded: formatCount(loaded, this.state.lang), verified: formatCount(verified, this.state.lang) })}`
    }
    this.els.status.textContent = text
    this.els.status.classList.toggle('is-error', Boolean(this.state.error))
    if (this.state.error?.kind === 'rate-limit') this.startCountdown()
  }

  startCountdown() {
    if (this.countdownTimer) return
    this.countdownTimer = setInterval(() => {
      if (!this.state.error || this.state.error.kind !== 'rate-limit') {
        clearInterval(this.countdownTimer)
        this.countdownTimer = null
        return
      }
      this.renderStatus()
      this.renderRate()
      this.renderError()
    }, 1_000)
  }

  renderError() {
    if (!this.els.errorBanner) return
    const error = this.state.error
    if (!error) {
      this.els.errorBanner.hidden = true
      return
    }
    this.els.errorBanner.hidden = false
    const kind = error.kind === 'auth' ? 'auth' : error.kind === 'network' ? 'network' : error.kind === 'rate-limit' ? 'rate' : 'http'
    setText(this.els.errorTitle, t(`error.${kind}Title`))
    let body = t(`error.${kind}Body`)
    if (error.kind === 'rate-limit' && error.resetAt) {
      body += ` ${t('status.rateLimited', { time: formatCountdown(error.resetAt - Date.now()) })}`
    }
    setText(this.els.errorBody, body)
    this.els.errorRetry.textContent = t('actions.retry')
  }

  renderRate() {
    const rate = this.state.rate
    let text = '—'
    if (rate) {
      const mode = rate.authenticated ? t('progress.withToken') : t('progress.noToken')
      const count = rate.remaining !== null && rate.limit !== null ? ` · ${rate.remaining}/${rate.limit}` : ''
      const wait = rate.remaining === 0 && rate.resetAt ? ` · ${t('status.rateWait', { time: formatCountdown(rate.resetAt - Date.now()) })}` : ''
      text = `${mode}${count}${wait}`
    }
    setText(this.els.rateLine, text)
    setText(this.els.settingsRate, text)
    if (this.rateTimer) clearTimeout(this.rateTimer)
    if (rate?.remaining === 0 && rate.resetAt) {
      this.rateTimer = setTimeout(() => this.renderRate(), 1_000)
    }
  }

  renderCache() {
    const fetchedAt = this.state.meta?.fetchedAt
    const text = fetchedAt
      ? `${t('progress.cachedAt')}: ${formatDateTime(fetchedAt, this.state.lang)}`
      : ''
    setText(this.els.cacheLine, text)
    const attempted = this.state.verification?.attempted || 0
    const limit = this.state.verification?.limit || 0
    let verifyText = `${t('progress.verification')}: ${t('progress.verifyingCount', { done: attempted, total: limit })}`
    if ((this.state.verification?.active || 0) > 0) verifyText += ` · ${t('badge.checking')}`
    setText(this.els.verifyLine, verifyText)
  }

  openDetail(key, { updateHash = true } = {}) {
    const repo = this.state.repositories.get(key)
    if (!repo) {
      this.toast(t('misc.loading'))
      return
    }
    if (!this.els.detailDialog.open) {
      this.lastFocused = document.activeElement
      this.els.detailDialog.showModal()
      document.body.classList.add('dialog-open')
    }
    this.modalKey = key
    this.renderDetail(repo)
    if (updateHash) {
      const hash = makeHash(repo.owner, repo.name)
      if (location.hash !== hash) history.pushState({ detail: key }, '', hash)
    }
  }

  closeDetail({ updateHash = true } = {}) {
    if (this.els.detailDialog.open) this.els.detailDialog.close()
    document.body.classList.remove('dialog-open')
    this.modalKey = null
    if (updateHash && location.hash.startsWith('#/p/')) {
      history.replaceState(null, '', `${location.pathname}${location.search}`)
    }
    if (this.lastFocused instanceof HTMLElement) this.lastFocused.focus()
  }

  handleLocation() {
    const hash = location.hash
    if (!hash) {
      if (this.els.detailDialog.open) this.closeDetail({ updateHash: false })
      return
    }
    if (!hash.startsWith('#/p/')) return
    const rest = hash.slice(4)
    const slash = rest.indexOf('/')
    if (slash <= 0) return
    let owner
    let name
    try {
      owner = decodeURIComponent(rest.slice(0, slash))
      name = decodeURIComponent(rest.slice(slash + 1))
    } catch {
      return
    }
    const key = `${owner}/${name}`.toLowerCase()
    const repo = this.state.repositories.get(key)
    if (repo) this.openDetail(key, { updateHash: false })
  }

  renderDetail(repo) {
    if (!repo || !this.els.detailContent) return
    const content = this.els.detailContent
    content.replaceChildren()

    const head = createEl('div', 'detail-head')
    const avatar = createEl('div', 'avatar avatar-large')
    this.fillAvatar(avatar, repo)
    const heading = createEl('div', 'detail-heading')
    const title = createEl('h2', '', repo.name)
    title.id = 'detail-title'
    heading.append(title)
    heading.append(createEl('p', 'detail-owner', `${repo.owner} / ${repo.fullName}`))
    const badges = createEl('div', 'detail-badges')
    const badgeInfo = this.badgeFor(repo)
    badges.append(createEl('span', `badge ${badgeInfo.className}`, badgeInfo.text))
    if (repo.archived) badges.append(createEl('span', 'badge badge-warning', t('badge.archived')))
    heading.append(badges)
    const close = createEl('button', 'icon-button detail-close')
    close.type = 'button'
    close.setAttribute('aria-label', t('detail.close'))
    close.title = t('detail.close')
    close.append(document.createTextNode('×'))
    close.addEventListener('click', () => this.closeDetail())
    head.append(avatar, heading, close)
    content.append(head)

    const description = createEl('p', 'detail-description', repo.description || t('card.noDescription'))
    content.append(description)

    const install = createEl('section', 'detail-section')
    install.append(createEl('h3', '', t('detail.install')))
    if (repo.installCommand) {
      const command = createEl('div', 'command-row')
      const code = document.createElement('code')
      code.textContent = repo.installCommand
      command.append(code)
      const copy = createEl('button', 'button button-quiet', t('actions.copy'))
      copy.type = 'button'
      copy.addEventListener('click', () => {
        copyText(repo.installCommand).then((ok) => this.toast(ok ? t('actions.copied') : t('error.httpBody')))
      })
      command.append(copy)
      install.append(command)
      install.append(createEl('p', 'muted', t('detail.installHint')))
      const pinned = buildPinnedInstallCommand(repo)
      if (pinned) {
        const pinnedRow = createEl('div', 'command-row command-row-secondary')
        const pinnedCode = document.createElement('code')
        pinnedCode.textContent = pinned
        pinnedRow.append(pinnedCode)
        const pinnedCopy = createEl('button', 'button button-quiet', t('misc.copy'))
        pinnedCopy.type = 'button'
        pinnedCopy.addEventListener('click', () => {
          copyText(pinned).then((ok) => this.toast(ok ? t('actions.copied') : t('error.httpBody')))
        })
        pinnedRow.append(pinnedCopy)
        install.append(pinnedRow)
        install.append(createEl('p', 'muted', t('detail.pinnedHint')))
      }
      const git = buildGitInstallCommand(repo)
      if (git) {
        const gitRow = createEl('div', 'command-row command-row-secondary')
        const gitCode = document.createElement('code')
        gitCode.textContent = git
        gitRow.append(gitCode)
        const gitCopy = createEl('button', 'button button-quiet', t('misc.copy'))
        gitCopy.type = 'button'
        gitCopy.addEventListener('click', () => {
          copyText(git).then((ok) => this.toast(ok ? t('actions.copied') : t('error.httpBody')))
        })
        gitRow.append(gitCopy)
        install.append(gitRow)
      }
    } else {
      install.append(createEl('p', 'muted', t('detail.notInstallable')))
    }
    content.append(install)

    const manifest = repo.manifest || {}
    if (manifest.status === 'verified') {
      const section = createEl('section', 'detail-section')
      section.append(createEl('h3', '', t('detail.manifest')))
      const dl = createEl('dl', 'manifest-list')
      this.addDefinition(dl, t('detail.package'), manifest.packageName || t('misc.none'))
      this.addDefinition(dl, t('detail.version'), manifest.version || t('misc.none'))
      const patchText = Array.isArray(manifest.patch) ? manifest.patch.join(', ') : asText(manifest.patch)
      this.addDefinition(dl, t('detail.patch'), patchText || t('misc.none'))
      this.addDefinition(dl, t('detail.engines'), manifest.enginesDsh || t('misc.none'))
      this.addDefinition(dl, t('detail.license'), manifest.license || repo.licenseSpdx || t('misc.none'))
      if (manifest.checkedAt) this.addDefinition(dl, t('detail.verifiedAt'), formatDateTime(manifest.checkedAt, this.state.lang))
      const raw = manifestUrl(repo)
      if (raw) {
        const dd = createEl('dd')
        const link = createEl('a', 'text-link', t('detail.rawManifest'))
        link.href = raw
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        dd.append(link)
        const row = createEl('div', 'manifest-row')
        row.append(createEl('dt', '', t('detail.manifestSource')), dd)
        dl.append(row)
      }
      section.append(dl)
      content.append(section)
    } else {
      const section = createEl('section', 'detail-section detail-warning')
      section.append(createEl('h3', '', t('detail.manifest')))
      section.append(createEl('p', '', t('detail.noManifest')))
      if (manifest.reason) section.append(createEl('p', 'muted', `reason: ${manifest.reason}`))
      if (manifest.status === 'missing') section.append(createEl('p', 'muted', t('detail.monorepoHint')))
      content.append(section)
    }

    const facts = createEl('section', 'detail-section')
    facts.append(createEl('h3', '', t('detail.overview')))
    const factGrid = createEl('div', 'fact-grid')
    this.addFact(factGrid, t('detail.stars'), formatCount(repo.stars, this.state.lang))
    this.addFact(factGrid, t('detail.language'), repo.language || t('misc.unknown'))
    this.addFact(factGrid, t('detail.updated'), formatRelative(repo.pushedAt, this.state.lang))
    this.addFact(factGrid, t('detail.created'), formatDate(repo.createdAt, this.state.lang))
    this.addFact(factGrid, t('detail.license'), repo.licenseSpdx || t('misc.none'))
    facts.append(factGrid)
    if (repo.topics?.length) {
      const topics = createEl('div', 'topic-list')
      for (const topic of repo.topics) topics.append(createEl('span', 'topic-chip', topic))
      facts.append(topics)
    }
    content.append(facts)

    const links = createEl('section', 'detail-section')
    links.append(createEl('h3', '', t('detail.links')))
    const linkRow = createEl('div', 'detail-links')
    const repoLink = createEl('a', 'button button-quiet', t('detail.repo'))
    repoLink.href = repo.url
    repoLink.target = '_blank'
    repoLink.rel = 'noopener noreferrer'
    linkRow.append(repoLink)
    const npmLink = npmUrl(repo)
    if (npmLink) {
      const npm = createEl('a', 'button button-quiet', t('detail.npm'))
      npm.href = npmLink
      npm.target = '_blank'
      npm.rel = 'noopener noreferrer'
      linkRow.append(npm)
    }
    if (repo.installCommand) {
      const check = createEl('button', 'button button-quiet', t('detail.checkNpm'))
      check.type = 'button'
      check.disabled = repo.npm?.status === 'loading'
      check.addEventListener('click', () => this.actions.checkNpm(repo.key))
      linkRow.append(check)
    }
    const verify = createEl('button', 'button button-quiet', t('actions.verifyNow'))
    verify.type = 'button'
    verify.addEventListener('click', () => this.actions.verifyNow(repo.key))
    linkRow.append(verify)
    links.append(linkRow)
    if (repo.npm?.status === 'found') {
      links.append(createEl('p', 'muted', t('detail.npmFound', { version: repo.npm.version || '?' })))
      if (repo.npm.deprecated) links.append(createEl('p', 'detail-warning-text', t('detail.deprecated')))
    } else if (repo.npm?.status === 'missing') {
      links.append(createEl('p', 'muted', t('detail.npmMissing')))
    } else if (repo.npm?.status === 'loading') {
      links.append(createEl('p', 'muted', t('misc.loading')))
    }
    content.append(links)

    const security = createEl('section', 'detail-section detail-security')
    security.append(createEl('h3', '', t('detail.security')))
    security.append(createEl('p', '', t('detail.verifyExplain')))
    if (!repo.installCommand) security.append(createEl('p', '', t('detail.notInstallable')))
    content.append(security)

    if (!this.els.detailDialog.open) {
      this.els.detailDialog.showModal()
      document.body.classList.add('dialog-open')
    }
  }

  addDefinition(dl, label, value) {
    const row = createEl('div', 'manifest-row')
    row.append(createEl('dt', '', label), createEl('dd', '', asText(value)))
    dl.append(row)
  }

  addFact(container, label, value) {
    const item = createEl('div', 'fact')
    item.append(createEl('span', 'fact-label', label), createEl('strong', 'fact-value', asText(value)))
    container.append(item)
  }

  openSettings() {
    if (!this.els.settingsDialog) return
    if (this.els.tokenInput) this.els.tokenInput.value = ''
    if (this.els.tokenStatus) {
      this.els.tokenStatus.textContent = this.state.hasToken ? t('settings.sessionOnly') : ''
    }
    this.renderRate()
    if (!this.els.settingsDialog.open) this.els.settingsDialog.showModal()
  }

  saveToken() {
    const value = this.els.tokenInput?.value.trim()
    if (!value) return
    this.actions.saveToken(value)
    if (this.els.tokenInput) this.els.tokenInput.value = ''
    if (this.els.tokenStatus) this.els.tokenStatus.textContent = t('settings.tokenSaved')
  }

  clearToken() {
    this.actions.clearToken()
    if (this.els.tokenStatus) this.els.tokenStatus.textContent = t('settings.tokenCleared')
  }

  clearCache() {
    this.actions.clearCache()
  }

  updateRepo(key) {
    const repo = this.state.repositories.get(key)
    if (!repo || !this.els.grid) return
    const card = [...this.els.grid.children].find((element) => element.dataset?.key === key)
    if (card) card.replaceWith(this.createCard(repo))
    this.renderStats()
    this.renderStatus()
    this.renderCache()
    if (this.modalKey === key) this.renderDetail(repo)
  }

  setNpmResult(key) {
    if (this.modalKey === key) {
      const repo = this.state.repositories.get(key)
      if (repo) this.renderDetail(repo)
    }
  }

  toast(message) {
    if (!this.els.toast) return
    this.els.toast.textContent = message
    this.els.toast.classList.add('is-visible')
    if (this.toastTimer) clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => {
      this.els.toast.classList.remove('is-visible')
    }, 2_800)
  }
}

export function defaultLanguage() {
  return getLanguage()
}
