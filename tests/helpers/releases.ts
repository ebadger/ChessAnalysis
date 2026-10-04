import { createServer } from 'node:http'
import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'
import { isBuildVersion } from '../../src/appUpdates'

async function filesIn(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const children = await Promise.all(entries.map((entry) => entry.isDirectory() ? filesIn(join(directory, entry.name)) : [join(directory, entry.name)]))
  return children.flat()
}

function legacyWorker(version: string, assets: string[]): string {
  return `
const VERSION = ${JSON.stringify(version)};
const SCOPE = self.registration.scope;
const CACHE = 'badger-flores:' + SCOPE + ':' + VERSION;
const URLS = ${JSON.stringify(assets)}.map((path) => new URL(path, SCOPE).href);
const OPTIONS = { ignoreSearch: true, ignoreVary: true };
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(URLS))));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith(SCOPE)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(event.request, OPTIONS);
    if (saved) return saved;
    if (event.request.mode === 'navigate' && new URL(event.request.url).pathname === new URL(SCOPE).pathname) {
      const index = await cache.match(new URL('index.html', SCOPE).href, OPTIONS);
      if (index) return index;
    }
    return fetch(event.request);
  })());
});
self.addEventListener('message', event => {
  if (!event.ports[0] || !['OFFLINE_STATUS', 'PREPARE_OFFLINE'].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    if (event.data.type === 'PREPARE_OFFLINE') await cache.addAll(URLS);
    const found = await Promise.all(URLS.map(url => cache.match(url, OPTIONS)));
    event.ports[0].postMessage({ ready: found.every(Boolean), version: VERSION });
  })());
});
`
}

export async function releaseServer() {
  const dist = resolve('dist')
  const files = new Map<string, Buffer>()
  for (const path of await filesIn(dist)) files.set(relative(dist, path).split(sep).join('/'), await readFile(path))
  const metadata: unknown = JSON.parse(files.get('build.json')!.toString())
  if (typeof metadata !== 'object' || metadata === null || !('version' in metadata) || !isBuildVersion(metadata.version)) throw new Error('Build the app before running update tests.')
  const initialVersion = metadata.version
  const js = [...files.keys()].find((path) => path.startsWith('assets/') && path.endsWith('.js'))!
  const css = [...files.keys()].find((path) => path.startsWith('assets/') && path.endsWith('.css'))!
  let release = initialVersion
  let legacy = true
  let manifestStatus = 200
  let failOfflineSave = false
  const requests: string[] = []
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    requests.push(url.pathname + url.search)
    if (!url.pathname.startsWith('/study/')) { response.writeHead(404).end(); return }
    const path = url.pathname.slice('/study/'.length) || 'index.html'
    if (failOfflineSave && path === 'engine/COPYING.txt') { response.writeHead(503).end('Temporarily unavailable'); return }
    const newJs = release === initialVersion ? js : `assets/update-${release}.js`
    const newCss = release === initialVersion ? css : `assets/update-${release}.css`
    let body: Buffer | undefined
    if (path === 'index.html' || path === 'refresh.html') {
      body = Buffer.from(files.get('index.html')!.toString().replaceAll(initialVersion, release).replaceAll(js, newJs).replaceAll(css, newCss))
    } else if (path === 'build.json') {
      response.statusCode = manifestStatus
      body = Buffer.from(JSON.stringify({ version: release }))
    } else if (path === 'sw.js') {
      body = Buffer.from(legacy
        ? legacyWorker(release, [...files.keys()].filter((name) => !['sw.js', 'build.json', 'refresh.html'].includes(name)).concat('legacy-only.txt'))
        : files.get('sw.js')!.toString().replaceAll(initialVersion, release).replaceAll(js, newJs).replaceAll(css, newCss))
    } else if (path === 'legacy-only.txt' && legacy) {
      body = Buffer.from('Retained for an older open tab.')
    } else if (path === 'quiet.html') {
      body = Buffer.from('<!doctype html><title>Older page</title><h1>Older page still open</h1>')
    } else if (path === newJs) body = files.get(js)
    else if (path === newCss) body = files.get(css)
    else if (path !== js && path !== css) body = files.get(path)
    if (!body) { response.writeHead(404).end('Not found'); return }
    const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' }
    response.setHeader('Content-Type', types[extname(path)] ?? 'application/octet-stream')
    response.setHeader('Cache-Control', 'public, max-age=31536000')
    response.setHeader('Vary', 'Origin')
    response.end(body)
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('The release fixture did not bind a port.')
  return {
    url: `http://127.0.0.1:${address.port}/study/`,
    initialVersion,
    requests,
    publish: (version: string) => { release = version; legacy = false },
    failManifest: (status: number) => { manifestStatus = status },
    failOfflineSave: (fail: boolean) => { failOfflineSave = fail },
    close: () => new Promise<void>((done, reject) => { server.close((error) => error ? reject(error) : done()); server.closeAllConnections() }),
  }
}
