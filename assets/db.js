/** IndexedDB cache with an in-memory fallback for private/blocked browsers. */

const DB_VERSION = 1

/** @param {string} topic */
function databaseName(topic) {
  return `dsh-pl-radar::${String(topic || '').replace(/[^a-z0-9-]/gi, '_')}`
}

/** @param {IDBDatabase} db */
function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'))
  })
}

/** @param {IDBTransaction} tx */
function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined)
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'))
  })
}

export class PluginDB {
  /** @param {IDBDatabase} db */
  constructor(db) {
    this.db = db
  }

  /** @param {string} topic */
  static async open(topic) {
    if (!globalThis.indexedDB) throw new Error('IndexedDB is unavailable')
    const name = databaseName(topic)
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, DB_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains('repos')) {
          database.createObjectStore('repos', { keyPath: 'key' })
        }
        if (!database.objectStoreNames.contains('meta')) {
          database.createObjectStore('meta', { keyPath: 'key' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('Could not open IndexedDB'))
      request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'))
    })
    return new PluginDB(db)
  }

  async load() {
    const tx = this.db.transaction(['repos', 'meta'], 'readonly')
    const done = transactionDone(tx)
    const reposRequest = tx.objectStore('repos').getAll()
    const metaRequest = tx.objectStore('meta').get('meta')
    const [repos, meta] = await Promise.all([requestToPromise(reposRequest), requestToPromise(metaRequest)])
    await done
    return { repos: Array.isArray(repos) ? repos : [], meta: meta || null }
  }

  /** @param {Array<Record<string, any>>} repos */
  async saveRepos(repos) {
    if (!Array.isArray(repos) || repos.length === 0) return
    const tx = this.db.transaction('repos', 'readwrite')
    const done = transactionDone(tx)
    const store = tx.objectStore('repos')
    for (const repo of repos) store.put(repo)
    await done
  }

  /** @param {Record<string, any>} meta */
  async saveMeta(meta) {
    const tx = this.db.transaction('meta', 'readwrite')
    const done = transactionDone(tx)
    tx.objectStore('meta').put({ key: 'meta', ...meta })
    await done
  }

  async clear() {
    const tx = this.db.transaction(['repos', 'meta'], 'readwrite')
    const done = transactionDone(tx)
    tx.objectStore('repos').clear()
    tx.objectStore('meta').clear()
    await done
  }

  close() {
    try {
      this.db.close()
    } catch {
      // ignore
    }
  }
}

export class MemoryDB {
  constructor() {
    /** @type {Map<string, Record<string, any>>} */
    this.repos = new Map()
    /** @type {Record<string, any> | null} */
    this.meta = null
  }

  async load() {
    return {
      repos: [...this.repos.values()],
      meta: this.meta ? { ...this.meta } : null,
    }
  }

  /** @param {Array<Record<string, any>>} repos */
  async saveRepos(repos) {
    for (const repo of repos || []) {
      if (repo && typeof repo.key === 'string') this.repos.set(repo.key, repo)
    }
  }

  /** @param {Record<string, any>} meta */
  async saveMeta(meta) {
    this.meta = { ...meta }
  }

  async clear() {
    this.repos.clear()
    this.meta = null
  }

  close() {}
}

/** @param {string} topic */
export async function openDatabase(topic) {
  try {
    const withTimeout = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('IndexedDB open timed out')), 3_000)
      PluginDB.open(topic).then(
        (db) => {
          clearTimeout(timer)
          resolve(db)
        },
        (error) => {
          clearTimeout(timer)
          reject(error)
        },
      )
    })
    return await withTimeout
  } catch {
    return new MemoryDB()
  }
}
