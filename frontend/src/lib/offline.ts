/**
 * Offline cache for timetable payloads.
 *
 * Uses IndexedDB directly rather than adding Dexie: the access pattern is a
 * single key/value store, so a wrapper would add ~25 KB to the bundle for no
 * benefit on the low-end Android devices this app targets.
 */

const DB_NAME = 'phikila-timetable'
const STORE = 'cache'
const VERSION = 1

type CachedEnvelope<T> = { value: T; savedAt: number }

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, VERSION)
    } catch {
      resolve(null)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    // Private-browsing modes can block IndexedDB; degrade to online-only.
    request.onerror = () => resolve(null)
  })
  return dbPromise
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    let request: IDBRequest
    try {
      request = run(db.transaction(STORE, mode).objectStore(STORE))
    } catch {
      resolve(null)
      return
    }
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => resolve(null)
  })
}

export async function cacheSet<T>(key: string, value: T): Promise<void> {
  const envelope: CachedEnvelope<T> = { value, savedAt: Date.now() }
  await withStore('readwrite', (store) => store.put(envelope, key))
}

export async function cacheGet<T>(key: string): Promise<{ value: T; savedAt: number } | null> {
  const found = await withStore<CachedEnvelope<T>>('readonly', (store) => store.get(key))
  return found && 'value' in found ? found : null
}

export async function cacheClear(): Promise<void> {
  await withStore('readwrite', (store) => store.clear())
}

/**
 * Fetch fresh data, falling back to the cached copy when offline.
 *
 * Returns whether the value came from cache so the UI can label stale data
 * honestly instead of silently showing an old timetable as current.
 */
export async function cachedFetch<T>(
  key: string,
  loader: () => Promise<T>,
): Promise<{ data: T; stale: boolean; savedAt: number | null }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const cached = await cacheGet<T>(key)
    if (cached) return { data: cached.value, stale: true, savedAt: cached.savedAt }
  }

  try {
    const data = await loader()
    void cacheSet(key, data)
    return { data, stale: false, savedAt: Date.now() }
  } catch (error) {
    const cached = await cacheGet<T>(key)
    if (cached) return { data: cached.value, stale: true, savedAt: cached.savedAt }
    throw error
  }
}

export function formatSavedAt(savedAt: number | null): string {
  if (!savedAt) return ''
  const minutes = Math.round((Date.now() - savedAt) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}
