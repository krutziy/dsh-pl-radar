/**
 * The single file a fork normally needs to edit.
 *
 * `topic` is any GitHub topic. The manifest check and category words are
 * aimed at the DeepSeek Harness plugin ecosystem, but the fetching, filtering
 * and card UI are topic-agnostic.
 */

const DAY_MS = 86_400_000

/** @param {number} days */
function isoDaysAgo(days) {
  return new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10)
}

/** @typedef {{ zh: string, en: string }} Localized */

export const CONFIG = {
  topic: 'dsh-plugin',
  repo: 'krutziy/dsh-pl-radar',
  topicUrl: 'https://github.com/topics/dsh-plugin',

  title: /** @type {Localized} */ ({ zh: 'DSH 插件雷达', en: 'DSH Plugin Radar' }),
  description: /** @type {Localized} */ ({
    zh: '在浏览器里实时抓取 GitHub dsh-plugin topic，按清单可安装性过滤，用现代卡片网格重新编排。',
    en: 'Fetch the GitHub dsh-plugin topic in your browser, filter by installable manifests, and browse it as a modern card grid.',
  }),

  /** GitHub Search API allows at most 100 per page and 1,000 results per query. */
  perPage: 100,
  maxRepos: 2_500,
  /** Cards appended per infinite-scroll batch. */
  batchSize: 36,
  /** Cached data is considered fresh for this long. */
  cacheTtlMs: 6 * 60 * 60 * 1_000,

  verify: {
    /** How many candidates are checked automatically in one load. */
    limit: 1_000,
    concurrency: 5,
    rawTimeoutMs: 4_000,
    cdnTimeoutMs: 8_000,
    maxBytes: 512 * 1_024,
  },

  /**
   * Fetch windows. Page 1 of every window is fetched first, then page 2, and
   * so on, so the first paint is diverse rather than 1,000 star-heavy repos.
   * `pages` is clamped to 10 in code because the search API stops at 1,000.
   */
  windows: [
    {
      id: 'stars',
      title: /** @type {Localized} */ ({ zh: 'Star 最多', en: 'Most starred' }),
      sort: 'stars',
      order: 'desc',
      pages: 10,
    },
    {
      id: 'updated',
      title: /** @type {Localized} */ ({ zh: '最近更新', en: 'Recently updated' }),
      sort: 'updated',
      order: 'desc',
      pages: 10,
    },
    {
      id: 'new',
      title: /** @type {Localized} */ ({ zh: '最近 90 天', en: 'New in 90 days' }),
      query: () => `created:>=${isoDaysAgo(90)}`,
      sort: 'stars',
      order: 'desc',
      pages: 3,
    },
    {
      id: 'best',
      title: /** @type {Localized} */ ({ zh: '最佳匹配', en: 'Best match' }),
      pages: 3,
    },
  ],

  /**
   * First matching category wins. Keep specific categories before broad ones
   * such as `ui`, and keep `other` last.
   */
  categories: [
    {
      id: 'theme',
      title: /** @type {Localized} */ ({ zh: '主题外观', en: 'Themes' }),
      keywords: ['theme', 'themes', 'appearance', 'color scheme', 'palette', 'wallpaper', 'skin', 'font', '配色', '主题', '壁纸', '字体', '外观'],
    },
    {
      id: 'usage',
      title: /** @type {Localized} */ ({ zh: '用量计费', en: 'Usage & billing' }),
      keywords: ['cost', 'billing', 'usage', 'balance', 'quota', 'price', 'pricing', 'token meter', '费用', '计费', '余额', '用量', '配额', '价格', '账单'],
    },
    {
      id: 'model',
      title: /** @type {Localized} */ ({ zh: '模型接入', en: 'Models & providers' }),
      keywords: ['provider', 'providers', 'llm', 'model', 'models', 'openai', 'anthropic', 'gemini', 'ollama', 'openrouter', 'model provider', '模型', '接入', '供应商'],
    },
    {
      id: 'memory',
      title: /** @type {Localized} */ ({ zh: '记忆上下文', en: 'Memory & context' }),
      keywords: ['memory', 'context', 'rag', 'knowledge', 'embedding', 'vector', 'sqlite', 'long-term', '记忆', '上下文', '知识库', '向量', '长期记忆'],
    },
    {
      id: 'session',
      title: /** @type {Localized} */ ({ zh: '会话管理', en: 'Sessions' }),
      keywords: ['session', 'sessions', 'chat', 'message', 'history', 'compact', 'archive', 'fork', 'conversation', '会话', '消息', '历史', '压缩', '归档', '对话'],
    },
    {
      id: 'tools',
      title: /** @type {Localized} */ ({ zh: '工具能力', en: 'Tools & skills' }),
      keywords: ['tool', 'tools', 'mcp', 'browser', 'search', 'shell', 'terminal', 'file', 'files', 'skill', 'skills', '工具', '浏览器', '搜索', '终端', '文件', '技能'],
    },
    {
      id: 'workflow',
      title: /** @type {Localized} */ ({ zh: '工作流自动化', en: 'Workflow & automation' }),
      keywords: ['workflow', 'automation', 'schedule', 'task', 'agent', 'agents', 'preset', 'subagent', 'team', '工作流', '自动化', '定时', '任务', '智能体', '预设', '子代理', '协作'],
    },
    {
      id: 'notify',
      title: /** @type {Localized} */ ({ zh: '通知集成', en: 'Notifications & integrations' }),
      keywords: ['notification', 'notify', 'webhook', 'email', 'telegram', 'slack', 'discord', 'wechat', 'push', '飞书', '钉钉', '微信', '通知', '推送', '邮件'],
    },
    {
      id: 'remote',
      title: /** @type {Localized} */ ({ zh: '远程移动', en: 'Remote & mobile' }),
      keywords: ['remote', 'ssh', 'mobile', 'sync', 'relay', 'phone', '远程', '手机', '移动', '同步', '中继'],
    },
    {
      id: 'multimodal',
      title: /** @type {Localized} */ ({ zh: '多模态', en: 'Voice, vision & media' }),
      keywords: ['voice', 'audio', 'image', 'video', 'vision', 'ocr', 'tts', 'stt', 'multimodal', '语音', '音频', '图片', '图像', '视频', '视觉', '多模态'],
    },
    {
      id: 'docs',
      title: /** @type {Localized} */ ({ zh: '文档渲染', en: 'Docs & rendering' }),
      keywords: ['markdown', 'render', 'pdf', 'ppt', 'slide', 'diagram', 'chart', 'html', '文档', '渲染', '图表', '幻灯片', '思维导图'],
    },
    {
      id: 'security',
      title: /** @type {Localized} */ ({ zh: '安全权限', en: 'Security & permissions' }),
      keywords: ['security', 'permission', 'permissions', 'approval', 'guard', 'sandbox', 'auth', 'audit', '安全', '权限', '审批', '沙箱', '认证', '审计'],
    },
    {
      id: 'market',
      title: /** @type {Localized} */ ({ zh: '市场管理', en: 'Markets & managers' }),
      keywords: ['market', 'marketplace', 'manager', 'catalog', 'discover', 'install', '市场', '插件市场', '管理', '目录', '安装'],
    },
    {
      id: 'dev',
      title: /** @type {Localized} */ ({ zh: '开发运行时', en: 'Development & runtime' }),
      keywords: ['sdk', 'runtime', 'cli', 'debug', 'compiler', 'git', 'code review', '开发', '运行时', '调试', '编译', '构建', '代码审查'],
    },
    {
      id: 'ui',
      title: /** @type {Localized} */ ({ zh: '界面增强', en: 'UI enhancements' }),
      keywords: ['ui', 'interface', 'sidebar', 'panel', 'layout', 'status bar', 'statusbar', 'tab', 'composer', 'widget', 'menu', 'animation', '界面', '侧边栏', '面板', '布局', '状态栏', '输入框', '挂件', '菜单', '动画'],
    },
    {
      id: 'fun',
      title: /** @type {Localized} */ ({ zh: '娱乐趣味', en: 'Just for fun' }),
      keywords: ['game', 'pet', 'toy', 'fun', 'music', 'meme', '游戏', '宠物', '桌宠', '娱乐', '趣味', '音乐', '摸鱼'],
    },
    {
      id: 'other',
      title: /** @type {Localized} */ ({ zh: '其他', en: 'Other' }),
      keywords: [],
    },
  ],
}

export const DAY = DAY_MS
