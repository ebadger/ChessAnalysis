import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(root, 'dist')
const generated = new Set(['sw.js', 'build.json', 'refresh.html'].map((file) => join(dist, file)))
const buildMeta = /(<meta name="app-build" content=")[^"]*(" ?\/?>)/

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? collectFiles(path) : [path]
  }))
  return files.flat().filter((path) => !generated.has(path))
}

const paths = (await collectFiles(dist)).sort()
const assets = [...paths.map((path) => relative(dist, path).split(sep).join('/')), 'build.json']
const required = ['index.html', 'engine/stockfish-17.1-lite-single-03e3232.js', 'engine/stockfish-17.1-lite-single-03e3232.wasm', 'engine/COPYING.txt']
if (!required.every((file) => assets.includes(file))) {
  throw new Error('Offline preparation requires a complete production build, including the local chess engine.')
}

const hash = createHash('sha256').update(await readFile(fileURLToPath(import.meta.url)))
const indexPath = join(dist, 'index.html')
const html = (await readFile(indexPath, 'utf8')).replace(buildMeta, '$1development$2')
if (!buildMeta.test(html)) throw new Error('The production page is missing its app-build metadata placeholder.')
for (const path of paths) {
  hash.update(relative(dist, path).split(sep).join('/')).update(path === indexPath ? html : await readFile(path))
}
const version = hash.digest('hex').slice(0, 16)
const stampedHtml = html.replace(buildMeta, (_match, prefix, suffix) => `${prefix}${version}${suffix}`)
await writeFile(indexPath, stampedHtml, 'utf8')
await writeFile(join(dist, 'refresh.html'), stampedHtml, 'utf8')
await writeFile(join(dist, 'build.json'), JSON.stringify({ version }), 'utf8')

const worker = `const VERSION = ${JSON.stringify(version)};
const ASSETS = ${JSON.stringify(assets, null, 2)};
const SCOPE = self.registration.scope;
const CACHE_PREFIX = 'flores-badger:' + SCOPE + ':';
// Older open tabs can still need assets cached before the app was renamed.
const LEGACY_CACHE_PREFIX = 'badger-flores:' + SCOPE + ':';
const CACHE_NAME = CACHE_PREFIX + VERSION;
const URLS = ASSETS.map((path) => new URL(path, SCOPE).href);
const INDEX_URL = new URL('index.html', SCOPE).href;
const BUILD_URL = new URL('build.json', SCOPE).href;
// Static files do not vary by Origin; module and precache requests can carry different Origin headers.
const MATCH_OPTIONS = { ignoreSearch: true, ignoreVary: true };

function isAppCache(name) {
  return name.startsWith(CACHE_PREFIX) || name.startsWith(LEGACY_CACHE_PREFIX);
}

async function saveOffline() {
  const files = await Promise.all(URLS.map(async (url) => {
    const fresh = new URL(url);
    if (url === INDEX_URL || url === BUILD_URL) fresh.searchParams.set('build', VERSION);
    const response = await fetch(fresh, { cache: 'reload' });
    if (!response.ok) throw new Error('Could not cache ' + fresh.pathname + ': HTTP ' + response.status);
    if (url === INDEX_URL && !(await response.clone().text()).includes('name="app-build" content="' + VERSION + '"')) {
      throw new Error('The new page is still being published. Retry offline saving in a moment.');
    }
    if (url === BUILD_URL && (await response.clone().json()).version !== VERSION) {
      throw new Error('The deployment version is still changing. Retry offline saving in a moment.');
    }
    return { url, response };
  }));
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(files.map(({ url, response }) => cache.put(url, response)));
}

async function appClients() {
  return (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
    .filter((client) => client.url.startsWith(SCOPE));
}

function clientVersion(client) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (version) => {
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      resolve(version);
    };
    const timer = setTimeout(() => finish(null), 500);
    channel.port1.onmessage = (event) => finish(event.data?.version ?? null);
    try { client.postMessage({ type: 'GET_CLIENT_VERSION', version: VERSION }, [channel.port2]); }
    catch { finish(null); }
  });
}

async function pruneUnusedVersions() {
  const active = self.registration.active;
  if (self.registration.installing || self.registration.waiting) return;
  const names = await caches.keys();
  const clients = await appClients();
  const versions = await Promise.all(clients.map(clientVersion));
  // Unknown or older pages may still need their original hashed assets and engine files.
  if (versions.some((version) => version !== VERSION)) return;
  // An older worker must not remove a cache being prepared by a concurrent update.
  if (self.registration.active !== active || self.registration.installing || self.registration.waiting) return;
  await Promise.all(names.filter((name) => isAppCache(name) && name !== CACHE_NAME)
    .map((name) => caches.delete(name)));
}

async function cachedAsset(request) {
  const current = await (await caches.open(CACHE_NAME)).match(request, MATCH_OPTIONS);
  if (current) return current;
  const names = await caches.keys();
  for (const name of names.filter((name) => isAppCache(name) && name !== CACHE_NAME)) {
    const saved = await (await caches.open(name)).match(request, MATCH_OPTIONS);
    if (saved) return saved;
  }
  return undefined;
}

async function navigate(request) {
  const cache = await caches.open(CACHE_NAME);
  const saved = await cache.match(INDEX_URL, MATCH_OPTIONS);
  if (!self.navigator.onLine && saved) return saved;
  const controller = new AbortController();
  const explicit = new URL(request.url).searchParams.has('refresh');
  const timer = setTimeout(() => controller.abort(), explicit ? 10000 : 2500);
  try {
    const fresh = new URL(INDEX_URL);
    fresh.searchParams.set('refresh', String(Date.now()));
    const response = await fetch(fresh, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('Page refresh returned HTTP ' + response.status);
    return response;
  } catch (error) {
    if (saved) return saved;
    throw error;
  } finally { clearTimeout(timer); }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await saveOffline();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    await pruneUnusedVersions();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return;
  const path = url.pathname.slice(new URL(SCOPE).pathname.length);
  if (path === 'build.json' || path === 'sw.js') {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  if (request.mode === 'navigate' && ['', 'index.html', 'refresh.html'].includes(path)) {
    event.respondWith(navigate(request));
    return;
  }
  event.respondWith((async () => {
    const saved = await cachedAsset(request);
    if (saved) return saved;
    return fetch(request);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLIENT_READY') {
    event.waitUntil(pruneUnusedVersions());
    return;
  }
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
