const STATIC_CACHE = 'news-media-cache-v1';
const API_CACHE = 'api-cache-v1';
const RUNTIME_CACHE = 'runtime-cache-v1';
const OFFLINE_QUEUE_DB = 'offline-post-queue';
const OFFLINE_QUEUE_STORE = 'queue';
const OFFLINE_QUEUE_DB_VERSION = 2;
let offlineRequestCounter = 0;
let queueReplayPromise = null;

const BASE_PATH = (() => {
  try {
    const scopePath = new URL(self.registration.scope).pathname;
    const normalised = scopePath.endsWith('/') && scopePath !== '/'
      ? scopePath.slice(0, -1)
      : scopePath;
    return normalised === '/' ? '' : normalised;
  } catch (err) {
    return '';
  }
})();

const withBasePath = path => {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const normalisedPath = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_PATH}${normalisedPath}`;
};

const stripBasePath = path => {
  if (!BASE_PATH) {
    return path;
  }
  return path.startsWith(BASE_PATH) ? path.slice(BASE_PATH.length) || '/' : path;
};

const API_PATH_PREFIX = withBasePath('/api/');
const OFFLINE_SYNC_ENDPOINT = withBasePath('/api/sync');

const supportsIndexedDB = () => {
  try {
    return typeof self !== 'undefined' && 'indexedDB' in self && self.indexedDB;
  } catch (err) {
    return false;
  }
};

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async cache => {
      const baseAssets = ['/', '/offline.html', '/manifest.webmanifest'].map(withBasePath);
      let generatedAssets = [];
      try {
        const response = await fetch(withBasePath('/cache.json'));
        if (response.ok) {
          generatedAssets = (await response.json()).map(withBasePath);
        }
      } catch (err) {
        // Fallback: cache minimal assets if file missing
      }
      const filesToCache = Array.from(
        new Set([...baseAssets, ...generatedAssets]),
      );
      return cache.addAll(filesToCache);
    })
  );
});

// Runtime caching for API and other requests
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isNextAssetRequest =
    url.pathname.startsWith(withBasePath('/_next/')) ||
    url.pathname.includes('.hot-update.') ||
    url.pathname.includes('__nextjs_original-stack-frame');

  // Never cache Next.js build/HMR assets. Stale chunk graphs can break hydration.
  if (isNextAssetRequest) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.ok) {
            const runtimeCache = await caches.open(RUNTIME_CACHE);
            runtimeCache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          const matchOptions = { ignoreSearch: true };
          const cachedHome = await caches.match(event.request, matchOptions);
          if (cachedHome) return cachedHome;
          const fallbackCandidates = [withBasePath('/'), withBasePath('/index.html')];
          const { pathname } = new URL(event.request.url);
          if (pathname === '/.' || pathname === '' || pathname === BASE_PATH || pathname === `${BASE_PATH}/`) {
            fallbackCandidates.unshift(withBasePath('/'));
          }
          for (const candidate of fallbackCandidates) {
            const cachedCandidate = await caches.match(candidate, matchOptions);
            if (cachedCandidate) return cachedCandidate;
          }
          const offline = await caches.match(withBasePath('/offline.html'));
          if (offline) return offline;
          return new Response('Offline', {
            status: 504,
            statusText: 'Gateway Timeout',
          });
        }
      })(),
    );
    return;
  }
  // Intercept all API POST requests
  if (
    event.request.method === 'POST' &&
    url.pathname.startsWith(API_PATH_PREFIX) &&
    url.pathname !== OFFLINE_SYNC_ENDPOINT
  ) {
    event.respondWith((async () => {
      try {
        // Try to send request online
        const response = await fetch(event.request.clone());
        return response;
      } catch (err) {
        // Offline: store request in IndexedDB for later sync
        await storePostRequest(event.request);
        // Return a generic offline response
        return new Response(JSON.stringify({
          success: false,
          offline: true,
          message: 'Request queued for sync when online.'
        }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    })());
    return;
  }
  // GET API requests: cache as before
  if (event.request.method === 'GET' && url.pathname.startsWith(API_PATH_PREFIX)) {
    event.respondWith(
      caches.open(API_CACHE).then(async cache => {
        try {
          const response = await fetch(event.request);
          cache.put(event.request, response.clone());
          return response;
        } catch (err) {
          const cached = await cache.match(event.request);
          if (cached) return cached;
          // Always return a valid Response
          return new Response(JSON.stringify({ success: false, offline: true, message: 'No cached API response available.' }), {
            status: 504,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      })
    );
    return;
  }
  // Serve schema files from cache when offline
  if (event.request.method === 'GET' && event.request.url.includes('/schemas/')) {
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request).catch(() => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      })
    );
    return;
  }
  // Cache static assets and offline fallback
  event.respondWith(
    caches.match(event.request).then(async response => {
      if (response) return response;
      if (event.request.method !== 'GET') {
        return fetch(event.request);
      }
      try {
        const networkResponse = await fetch(event.request);
        const sameOrigin = event.request.url.startsWith(self.location.origin);
        if (sameOrigin && networkResponse && networkResponse.ok) {
          const runtimeCache = await caches.open(RUNTIME_CACHE);
          runtimeCache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        const offline = await caches.match(withBasePath('/offline.html'));
        if (offline) return offline;
        // Always return a valid Response
        return new Response('Offline', { status: 504, statusText: 'Gateway Timeout' });
      }
    })
  );
});

// IndexedDB helper for storing POST requests
function storePostRequest(request) {
  if (!supportsIndexedDB()) {
    return Promise.resolve();
  }
  return request.clone().json().then(body => {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(OFFLINE_QUEUE_DB, OFFLINE_QUEUE_DB_VERSION);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains(OFFLINE_QUEUE_STORE)) {
          open.result.createObjectStore(OFFLINE_QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(OFFLINE_QUEUE_STORE, 'readwrite');
        const endpointUrl = new URL(request.url);
        const requestId =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            // Fallback format: <timestamp>-<counter>-<random>.
            : `${Date.now()}-${offlineRequestCounter++}-${Math.random().toString(16).slice(2)}`;
        const endpointPath = stripBasePath(endpointUrl.pathname);
        tx.objectStore(OFFLINE_QUEUE_STORE).add({
          endpoint: `${endpointPath}${endpointUrl.search}`,
          method: request.method,
          body,
          requestId,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
  });
}

self.addEventListener('sync', event => {
  if (event.tag === 'sync-api-posts') {
    if (supportsIndexedDB()) {
      event.waitUntil(syncQueuedPosts());
    }
  }
});

function syncQueuedPosts() {
  if (!supportsIndexedDB()) {
    return Promise.resolve();
  }
  if (queueReplayPromise) {
    return queueReplayPromise;
  }

  const replayPromise = new Promise((resolve, reject) => {
    const open = indexedDB.open(OFFLINE_QUEUE_DB, OFFLINE_QUEUE_DB_VERSION);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(OFFLINE_QUEUE_STORE)) {
        open.result.createObjectStore(OFFLINE_QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    open.onsuccess = () => {
      const db = open.result;
      let settled = false;
      const finishResolve = () => {
        if (settled) return;
        settled = true;
        db.close();
        resolve();
      };
      const finishReject = (error) => {
        if (settled) return;
        settled = true;
        db.close();
        reject(error);
      };

      const readTx = db.transaction(OFFLINE_QUEUE_STORE, 'readonly');
      const readStore = readTx.objectStore(OFFLINE_QUEUE_STORE);
      const getAll = readStore.getAll();
      getAll.onsuccess = async () => {
        const posts = getAll.result.sort((left, right) => left.id - right.id);
        if (posts.length === 0) {
          finishResolve();
          return;
        }

        try {
          const replayResponse = await fetch(OFFLINE_SYNC_ENDPOINT, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              operations: posts.map(post => ({
                queueId: post.id,
                requestId: post.requestId,
                method: post.method,
                endpoint: post.endpoint,
                body: post.body
              }))
            })
          });

          if (!replayResponse.ok) {
            finishResolve();
            return;
          }

          const replayResult = await replayResponse.json().catch(() => null);
          const rawAckedQueueIds = Array.isArray(replayResult?.ackedQueueIds)
            ? replayResult.ackedQueueIds
            : [];
          const ackedQueueIds = rawAckedQueueIds.filter(queueId =>
            Number.isInteger(queueId),
          );
          if (ackedQueueIds.length !== rawAckedQueueIds.length) {
            console.warn('Service worker replay ignored invalid queue IDs from server response.');
          }

          if (ackedQueueIds.length === 0) {
            finishResolve();
            return;
          }

          const writeTx = db.transaction(OFFLINE_QUEUE_STORE, 'readwrite');
          const writeStore = writeTx.objectStore(OFFLINE_QUEUE_STORE);
          for (const queueId of ackedQueueIds) {
            writeStore.delete(queueId);
          }
          writeTx.oncomplete = () => finishResolve();
          writeTx.onerror = () => finishReject(writeTx.error);
        } catch (err) {
          // If still offline, keep in queue
          finishResolve();
        }
      };
      getAll.onerror = () => {
        finishReject(getAll.error);
      };
      readTx.onerror = () => finishReject(readTx.error);
    };
    open.onerror = () => reject(open.error);
  });

  queueReplayPromise = replayPromise.finally(() => {
    queueReplayPromise = null;
  });

  return queueReplayPromise;
}

self.addEventListener('online', () => {
  if (supportsIndexedDB()) {
    self.registration.sync.register('sync-api-posts');
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => ![STATIC_CACHE, API_CACHE, RUNTIME_CACHE].includes(key))
          .map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});
