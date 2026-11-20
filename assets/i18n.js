/**
 * Tiny flat i18n dictionary. Keys must exist in both languages; the test suite
 * checks parity so a missing string cannot silently fall back to a key name.
 */

export const LANGUAGES = ['zh', 'en']

/** @typedef {'zh' | 'en'} Language */

/** @type {Record<Language, Record<string, string>>} */
export const STRINGS = {
  zh: {
    'a11y.skip': '跳到主要内容',
    'app.eyebrow': 'DSH PLUGIN TOPIC RADAR',
    'app.title': 'DSH 插件雷达',
    'app.subtitle': '不再一行一个项目。按多个 GitHub 排序窗口实时抓取 dsh-plugin topic，校验清单可安装性，再用卡片网格重新编排。',
    'app.topicLink': '查看 GitHub topic',
    'app.repoLink': '模板仓库',
    'app.documentTitle': 'DSH 插件雷达',

    'stats.topicTotal': 'Topic 总数',
    'stats.loaded': '已加载',
    'stats.verified': '清单可安装',
    'stats.updated': '最后抓取',

    'search.label': '搜索插件',
    'search.placeholder': '搜索插件、作者、关键词……',

    'sort.label': '排序',
    'sort.recommended': '推荐',
    'sort.stars': 'Star 最多',
    'sort.updated': '最近更新',
    'sort.newest': '最新创建',
    'sort.name': '名称',

    'filter.title': '筛选',
    'filter.verifiedOnly': '只看清单可安装',
    'filter.showAll': '显示全部',
    'filter.category': '分类',
    'filter.language': '语言',
    'filter.license': '许可证',
    'filter.days': '更新时间',
    'filter.daysAny': '不限',
    'filter.days7': '近 7 天',
    'filter.days30': '近 30 天',
    'filter.days90': '近 90 天',
    'filter.showArchived': '显示已归档',
    'filter.clear': '清除筛选',
    'filter.all': '全部',
    'filter.activeCount': '{count} 个筛选条件',
    'filter.remove': '移除筛选 {name}',

    'actions.refresh': '刷新',
    'actions.settings': '设置',
    'actions.copy': '复制安装命令',
    'actions.copied': '已复制',
    'actions.details': '详情',
    'actions.close': '关闭',
    'actions.loadMore': '加载更多',
    'actions.checkNpm': '检查 npm',
    'actions.verifyNow': '立即校验',
    'actions.retry': '重试',
    'actions.clear': '清除',

    'status.loading': '准备加载……',
    'status.ready': '已加载 {loaded} 个仓库，其中 {verified} 个清单可安装。',
    'status.cached': '来自本地缓存（{age}）。',
    'status.fetching': '正在抓取 GitHub：{done}/{total} 个窗口页。',
    'status.fetchingMore': '正在抓取更多…',
    'status.verifying': '正在校验 package.json：{done}/{total}。',
    'status.empty': '没有匹配的插件',
    'status.emptyHint': '试试清除筛选，或者关闭“只看清单可安装”。',
    'status.end': '已经到底了。',
    'status.shown': '已显示 {shown} / {total}',
    'status.scrollMore': '滚动到底继续抓取',
    'status.rateLimited': '配额预计 {time} 后恢复；恢复后点“重试”或继续滚动。',
    'status.rateWait': '等待 {time}',
    'status.offline': '网络不可用，显示本地缓存。',
    'status.error': '加载失败',
    'status.retry': '重试',
    'status.network': '网络错误',
    'status.auth': 'GitHub Token 无效',
    'status.http': 'GitHub API 返回错误',
    'status.demo': '演示数据（?demo=1），不会请求 GitHub。',
    'status.verifyLimit': '已达到自动校验上限，详情里可以继续手动校验。',
    'status.tokenInvalid': 'Token 无效，已回退到未登录模式。',

    'progress.toggle': '抓取详情',
    'progress.windows': '抓取窗口',
    'progress.verification': '清单校验',
    'progress.rate': '搜索配额',
    'progress.cachedAt': '缓存时间',
    'progress.notStarted': '未开始',
    'progress.done': '完成',
    'progress.page': '第 {page}/{pages} 页',
    'progress.noToken': '未登录 · 10 次/分钟',
    'progress.withToken': '已登录 · 30 次/分钟',
    'progress.verifyingCount': '{done}/{total} 已校验',

    'badge.verified': '可安装',
    'badge.topicOnly': '仅 topic',
    'badge.checking': '校验中',
    'badge.unverified': '未校验',
    'badge.private': '私有',
    'badge.invalid': '无效',
    'badge.unreachable': '不可达',
    'badge.archived': '已归档',
    'badge.webui': '含 Web UI',

    'card.noDescription': '这个仓库没有填写描述。',
    'card.stars': 'Star',
    'card.updated': '更新',
    'card.install': '安装',
    'card.checking': '正在读取 package.json…',
    'card.notVerified': '未通过清单校验',
    'card.monorepo': '可能是 monorepo，根目录没有 dsh.bundle。',

    'detail.title': '插件详情',
    'detail.overview': '概览',
    'detail.install': '安装',
    'detail.installHint': '先确认你使用的是哪个 DSH profile；把 web 换成你的 profile 名。',
    'detail.pinned': '固定版本',
    'detail.pinnedHint': '需要精确版本时使用。若 npm 尚未发布，请用 GitHub 地址。',
    'detail.manifest': '清单',
    'detail.package': '包名',
    'detail.version': '版本',
    'detail.patch': 'Bundle patch',
    'detail.engines': 'DSH 版本范围',
    'detail.license': '许可证',
    'detail.language': '语言',
    'detail.stars': 'Star',
    'detail.updated': '最近更新',
    'detail.created': '创建时间',
    'detail.topics': 'GitHub topics',
    'detail.links': '链接',
    'detail.repo': 'GitHub 仓库',
    'detail.npm': 'npm 页面',
    'detail.security': '安全提醒',
    'detail.verifyExplain': '“清单可安装”表示仓库根 package.json 声明了 dsh.bundle.patch，并不代表代码经过安全审计。安装前请阅读源码。',
    'detail.noManifest': '没有在仓库根目录找到声明 dsh.bundle 的 package.json。它仍然可能是插件（例如 monorepo 子包），请到仓库确认。',
    'detail.monorepoHint': '如果这是 monorepo，插件可能位于 packages/ 或子目录中；本页只校验根清单。',
    'detail.checkNpm': '检查 npm 是否已发布',
    'detail.npmFound': 'npm 已发布：{version}',
    'detail.npmMissing': 'npm 上还没有这个包（或网络不可达）。',
    'detail.deprecated': 'npm 已标记为 deprecated。',
    'detail.manifestSource': '清单来源',
    'detail.rawManifest': '打开 package.json',
    'detail.close': '关闭详情',
    'detail.notInstallable': '这个仓库未通过根清单校验，因此没有自动生成安装命令。',
    'detail.verifiedAt': '校验时间',
    'detail.description': '描述',

    'settings.title': '设置',
    'settings.tokenTitle': 'GitHub Token（可选）',
    'settings.tokenDesc': '不填也能用。填入后搜索配额从 10 次/分钟提升到 30 次/分钟。只保存在本次浏览器会话，只发送给 api.github.com。',
    'settings.saveToken': '保存',
    'settings.clearToken': '清除',
    'settings.cacheTitle': '本地缓存',
    'settings.cacheDesc': '数据缓存在 IndexedDB；再次打开会直接显示。只有滚动到底、点“加载更多”或清空缓存才会重新请求 GitHub。',
    'settings.clearCache': '清空缓存并重新抓取',
    'settings.rateTitle': '当前配额',
    'settings.tokenSaved': 'Token 已保存到本次会话。',
    'settings.tokenCleared': 'Token 已清除。',
    'settings.tokenInvalid': 'Token 无效，请检查权限或是否过期。',
    'settings.sessionOnly': '仅本次会话',
    'settings.close': '关闭设置',

    'footer.disclaimer': '本页只是发现工具，不是安全审计。安装插件会以你的权限执行第三方代码，请先检查源码。',
    'footer.dataSource': '数据来自 GitHub Search API 与仓库 package.json；页面无后端、无统计。',
    'footer.template': '模板仓库',
    'footer.lastFetched': '最后抓取：{time}',
    'theme.toLight': '切换到浅色主题',
    'theme.toDark': '切换到深色主题',

    'misc.unknown': '未知',
    'misc.none': '未声明',
    'misc.other': '其他',
    'misc.noDescription': '没有描述',
    'misc.loading': '加载中…',
    'misc.github': 'GitHub',
    'misc.npm': 'npm',
    'misc.copy': '复制',
    'misc.copied': '已复制',
    'misc.all': '全部',
    'misc.by': '作者',
    'misc.today': '今天',
    'misc.yesterday': '昨天',
    'misc.daysAgo': '{count} 天前',
    'misc.hoursAgo': '{count} 小时前',
    'misc.minutesAgo': '{count} 分钟前',
    'misc.justNow': '刚刚',
    'misc.monthsAgo': '{count} 个月前',
    'misc.yearsAgo': '{count} 年前',

    'error.rateTitle': 'GitHub 搜索配额已用完',
    'error.rateBody': '未登录时每分钟最多 10 次搜索。等待配额恢复后点“重试”，或在设置里填入只读 Token 提速。',
    'error.authTitle': 'GitHub Token 无效',
    'error.authBody': '请检查 Token 是否过期、是否有 public repo 读取权限；也可以清除 Token 后使用未登录模式。',
    'error.networkTitle': '网络请求失败',
    'error.networkBody': '可能是网络、代理或 GitHub API 不可达。已保留缓存数据，可以重试。',
    'error.httpTitle': 'GitHub API 错误',
    'error.httpBody': 'GitHub 返回了异常状态。请稍后重试；如果持续出现，检查查询配置。',
    'error.retry': '重试',
  },

  en: {
    'a11y.skip': 'Skip to main content',
    'app.eyebrow': 'DSH PLUGIN TOPIC RADAR',
    'app.title': 'DSH Plugin Radar',
    'app.subtitle': 'No more one project per row. Fetch the dsh-plugin topic across several GitHub sort windows, verify installable manifests, and browse it as a card grid.',
    'app.topicLink': 'Open GitHub topic',
    'app.repoLink': 'Template repo',
    'app.documentTitle': 'DSH Plugin Radar',

    'stats.topicTotal': 'Topic total',
    'stats.loaded': 'Loaded',
    'stats.verified': 'Manifest installable',
    'stats.updated': 'Last fetched',

    'search.label': 'Search plugins',
    'search.placeholder': 'Search plugins, authors, keywords…',

    'sort.label': 'Sort',
    'sort.recommended': 'Recommended',
    'sort.stars': 'Most starred',
    'sort.updated': 'Recently updated',
    'sort.newest': 'Newest',
    'sort.name': 'Name',

    'filter.title': 'Filters',
    'filter.verifiedOnly': 'Installable only',
    'filter.showAll': 'Showing all',
    'filter.category': 'Category',
    'filter.language': 'Language',
    'filter.license': 'License',
    'filter.days': 'Updated within',
    'filter.daysAny': 'Any time',
    'filter.days7': 'Last 7 days',
    'filter.days30': 'Last 30 days',
    'filter.days90': 'Last 90 days',
    'filter.showArchived': 'Show archived',
    'filter.clear': 'Clear filters',
    'filter.all': 'All',
    'filter.activeCount': '{count} active filters',
    'filter.remove': 'Remove filter {name}',

    'actions.refresh': 'Refresh',
    'actions.settings': 'Settings',
    'actions.copy': 'Copy install command',
    'actions.copied': 'Copied',
    'actions.details': 'Details',
    'actions.close': 'Close',
    'actions.loadMore': 'Load more',
    'actions.checkNpm': 'Check npm',
    'actions.verifyNow': 'Verify now',
    'actions.retry': 'Retry',
    'actions.clear': 'Clear',

    'status.loading': 'Loading…',
    'status.ready': 'Loaded {loaded} repositories, {verified} with an installable manifest.',
    'status.cached': 'From local cache ({age}).',
    'status.fetching': 'Fetching GitHub: {done}/{total} window pages.',
    'status.fetchingMore': 'Fetching more…',
    'status.verifying': 'Checking package.json: {done}/{total}.',
    'status.empty': 'No matching plugins',
    'status.emptyHint': 'Try clearing filters, or turn off “Installable only”.',
    'status.end': 'You have reached the end.',
    'status.shown': 'Showing {shown} / {total}',
    'status.scrollMore': 'Scroll to load more',
    'status.rateLimited': 'Quota resets in {time}; then press Retry or scroll again.',
    'status.rateWait': 'Waiting {time}',
    'status.offline': 'Network unavailable; showing the local cache.',
    'status.error': 'Failed to load',
    'status.retry': 'Retry',
    'status.network': 'Network error',
    'status.auth': 'Invalid GitHub token',
    'status.http': 'GitHub API error',
    'status.demo': 'Demo data (?demo=1); GitHub is not contacted.',
    'status.verifyLimit': 'Automatic verification limit reached; verify more from a detail view.',
    'status.tokenInvalid': 'Token was invalid; falling back to anonymous mode.',

    'progress.toggle': 'Fetch details',
    'progress.windows': 'Fetch windows',
    'progress.verification': 'Manifest checks',
    'progress.rate': 'Search quota',
    'progress.cachedAt': 'Cached at',
    'progress.notStarted': 'Not started',
    'progress.done': 'Done',
    'progress.page': 'Page {page}/{pages}',
    'progress.noToken': 'Anonymous · 10/min',
    'progress.withToken': 'Authenticated · 30/min',
    'progress.verifyingCount': '{done}/{total} checked',

    'badge.verified': 'Installable',
    'badge.topicOnly': 'Topic only',
    'badge.checking': 'Checking',
    'badge.unverified': 'Unverified',
    'badge.private': 'Private',
    'badge.invalid': 'Invalid',
    'badge.unreachable': 'Unreachable',
    'badge.archived': 'Archived',
    'badge.webui': 'Web UI',

    'card.noDescription': 'This repository has no description.',
    'card.stars': 'Stars',
    'card.updated': 'Updated',
    'card.install': 'Install',
    'card.checking': 'Reading package.json…',
    'card.notVerified': 'Not verified',
    'card.monorepo': 'Likely a monorepo; no dsh.bundle at the repository root.',

    'detail.title': 'Plugin details',
    'detail.overview': 'Overview',
    'detail.install': 'Install',
    'detail.installHint': 'Check which DSH profile you use; replace web with your profile name.',
    'detail.pinned': 'Pinned version',
    'detail.pinnedHint': 'Use this when you need an exact version. If it is not published to npm, use the GitHub spec.',
    'detail.manifest': 'Manifest',
    'detail.package': 'Package',
    'detail.version': 'Version',
    'detail.patch': 'Bundle patch',
    'detail.engines': 'DSH range',
    'detail.license': 'License',
    'detail.language': 'Language',
    'detail.stars': 'Stars',
    'detail.updated': 'Updated',
    'detail.created': 'Created',
    'detail.topics': 'GitHub topics',
    'detail.links': 'Links',
    'detail.repo': 'GitHub repository',
    'detail.npm': 'npm page',
    'detail.security': 'Security note',
    'detail.verifyExplain': '“Manifest installable” means the repository root package.json declares dsh.bundle.patch. It is not a security audit. Read the source before installing.',
    'detail.noManifest': 'No repository-root package.json declaring dsh.bundle was found. It may still be a plugin (for example, a monorepo subpackage); check the repository.',
    'detail.monorepoHint': 'If this is a monorepo, the plugin may live under packages/ or a subdirectory; this page only checks the root manifest.',
    'detail.checkNpm': 'Check npm availability',
    'detail.npmFound': 'Published on npm: {version}',
    'detail.npmMissing': 'This package is not on npm (or the registry is unreachable).',
    'detail.deprecated': 'npm has marked this package as deprecated.',
    'detail.manifestSource': 'Manifest source',
    'detail.rawManifest': 'Open package.json',
    'detail.close': 'Close details',
    'detail.notInstallable': 'This repository did not pass the root manifest check, so no install command was generated.',
    'detail.verifiedAt': 'Checked at',
    'detail.description': 'Description',

    'settings.title': 'Settings',
    'settings.tokenTitle': 'GitHub token (optional)',
    'settings.tokenDesc': 'Works without one. A token raises the search quota from 10/min to 30/min. It is kept in this browser session only and is sent only to api.github.com.',
    'settings.saveToken': 'Save',
    'settings.clearToken': 'Clear',
    'settings.cacheTitle': 'Local cache',
    'settings.cacheDesc': 'Data is cached in IndexedDB and shown again on reload. GitHub is contacted only when you scroll to the bottom, press Load more, or clear the cache.',
    'settings.clearCache': 'Clear cache and refetch',
    'settings.rateTitle': 'Current quota',
    'settings.tokenSaved': 'Token saved for this session.',
    'settings.tokenCleared': 'Token cleared.',
    'settings.tokenInvalid': 'Token is invalid; check its scopes or expiry.',
    'settings.sessionOnly': 'This session only',
    'settings.close': 'Close settings',

    'footer.disclaimer': 'This page is a discovery tool, not a security audit. Installing a plugin runs third-party code with your permissions; review the source first.',
    'footer.dataSource': 'Data comes from the GitHub Search API and repository package.json files; no backend, no analytics.',
    'footer.template': 'Template repository',
    'footer.lastFetched': 'Last fetched: {time}',
    'theme.toLight': 'Switch to light theme',
    'theme.toDark': 'Switch to dark theme',

    'misc.unknown': 'Unknown',
    'misc.none': 'Not declared',
    'misc.other': 'Other',
    'misc.noDescription': 'No description',
    'misc.loading': 'Loading…',
    'misc.github': 'GitHub',
    'misc.npm': 'npm',
    'misc.copy': 'Copy',
    'misc.copied': 'Copied',
    'misc.all': 'All',
    'misc.by': 'by',
    'misc.today': 'today',
    'misc.yesterday': 'yesterday',
    'misc.daysAgo': '{count} days ago',
    'misc.hoursAgo': '{count} hours ago',
    'misc.minutesAgo': '{count} minutes ago',
    'misc.justNow': 'just now',
    'misc.monthsAgo': '{count} months ago',
    'misc.yearsAgo': '{count} years ago',

    'error.rateTitle': 'GitHub search quota exhausted',
    'error.rateBody': 'Anonymous search allows 10 requests per minute. Wait for the quota to reset and press Retry, or add a read-only token in settings.',
    'error.authTitle': 'Invalid GitHub token',
    'error.authBody': 'Check whether the token is expired or can read public repositories. You can also clear it and continue anonymously.',
    'error.networkTitle': 'Network request failed',
    'error.networkBody': 'The network, a proxy, or the GitHub API may be unreachable. Cached data is kept; you can retry.',
    'error.httpTitle': 'GitHub API error',
    'error.httpBody': 'GitHub returned an unexpected status. Retry later; if it persists, check the query configuration.',
    'error.retry': 'Retry',
  },
}

/** @type {Language} */
let current = 'zh'

/** @param {unknown} lang @returns {lang is Language} */
export function isLanguage(lang) {
  return lang === 'zh' || lang === 'en'
}

/** @param {string | null | undefined} stored */
export function detectLanguage(stored) {
  if (isLanguage(stored)) return stored
  const nav = typeof navigator !== 'undefined' && typeof navigator.language === 'string' ? navigator.language : 'zh'
  return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/** @param {Language} lang */
export function setLanguage(lang) {
  current = isLanguage(lang) ? lang : 'zh'
  return current
}

/** @returns {Language} */
export function getLanguage() {
  return current
}

/**
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 */
export function t(key, vars) {
  const table = STRINGS[current] || STRINGS.zh
  let text = table[key]
  if (text === undefined) text = STRINGS.zh[key] ?? key
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (match, name) => {
    const value = vars[name]
    return value === undefined ? match : String(value)
  })
}

/**
 * @template {{ zh: string, en: string }} T
 * @param {T} value
 * @param {Language} [lang]
 */
export function localized(value, lang = current) {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value[lang] || value.en || value.zh || ''
}
