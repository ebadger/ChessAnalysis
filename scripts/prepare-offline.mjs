import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(root, 'dist')

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? collectFiles(path) : [path]
  }))
  return files.flat().filter((path) => path !== join(dist, 'sw.js'))
}

const paths = (await collectFiles(dist)).sort()
const assets = paths.map((path) => relative(dist, path).split(sep).join('/'))
const required = ['index.html', 'engine/stockfish-17.1-lite-single-03e3232.js', 'engine/stockfish-17.1-lite-single-03e3232.wasm', 'engine/COPYING.txt']
if (!required.every((file) => assets.includes(file))) {
  throw new Error('Offline preparation requires a complete production build, including the local chess engine.')
}

const hash = createHash('sha256').update(await readFile(fileURLToPath(import.meta.url)))
for (const path of paths) hash.update(relative(dist, path)).update(await readFile(path))
const version = hash.digest('hex').slice(0, 16)

const worker = `const VERSION = ${JSON.stringify(version)};
const ASSETS = ${JSON.stringify(assets, null, 2)};
const SCOPE = self.registration.scope;
const CACHE_PREFIX = 'badger-flores:' + SCOPE + ':';
const CACHE_NAME = CACHE_PREFIX + VERSION;
const URLS = ASSETS.map((path) => new URL(path, SCOPE).href);
// Static files do not vary by Origin; module and precache requests can carry different Origin headers.
const MATCH_OPTIONS = { ignoreSearch: true, ignoreVary: true };

async function saveOffline() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(URLS.map((url) => new Request(url, { cache: 'reload' })));
}

self.addEventListener('install', (event) => {
  event.waitUntil(saveOffline());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const saved = await cache.match(request, MATCH_OPTIONS);
    if (saved) return saved;
    if (request.mode === 'navigate' && url.pathname === new URL(SCOPE).pathname) {
      const page = await cache.match(new URL('index.html', SCOPE).href, MATCH_OPTIONS);
      if (page) return page;
    }
    return fetch(request);
  })());
});

self.addEventListener('message', (event) => {
  if (!event.ports[0] || !['OFFLINE_STATUS', 'PREPARE_OFFLINE'].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    try {
      if (event.data.type === 'PREPARE_OFFLINE') await saveOffline();
      const cache = await caches.open(CACHE_NAME);
      const saved = await Promise.all(URLS.map((url) => cache.match(url, MATCH_OPTIONS)));
      event.ports[0].postMessage({ ready: saved.every(Boolean), version: VERSION });
    } catch (error) {
      event.ports[0].postMessage({ ready: false, error: error instanceof Error ? error.message : String(error) });
    }
  })());
});
`

await writeFile(join(dist, 'sw.js'), worker, 'utf8')
console.log(`Prepared offline cache for ${assets.length} local assets (version ${version}).`)
