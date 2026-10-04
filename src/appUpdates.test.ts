import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchLatestBuild, isBuildVersion, readAppBuild, refreshedAppUrl } from './appUpdates'

const version = '0123456789abcdef'
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('app update metadata', () => {
  it('accepts real build identifiers but not absent or development markers', () => {
    expect(isBuildVersion(version)).toBe(true)
    expect(isBuildVersion('development')).toBe(false)
    expect(isBuildVersion(undefined)).toBe(false)
    expect(isBuildVersion(version.toUpperCase())).toBe(false)
    expect(isBuildVersion(`${version}0`)).toBe(false)
    vi.stubGlobal('document', { querySelector: () => ({ getAttribute: () => version }) })
    expect(readAppBuild()).toBe(version)
    vi.stubGlobal('document', { querySelector: () => null })
    expect(readAppBuild()).toBe(null)
    vi.stubGlobal('document', { querySelector: () => ({ getAttribute: () => 'development' }) })
    expect(readAppBuild()).toBe(null)
  })

  it('busts cached version requests and keeps them on the application origin', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ version })))
    expect(await fetchLatestBuild(new URL('https://example.test/chess/'), new AbortController().signal)).toBe(version)
    const [input, options] = fetchMock.mock.calls[0]
    expect(input).toBeInstanceOf(URL)
    const url = new URL(String(input))
    expect(url.origin).toBe('https://example.test')
    expect(url.pathname).toBe('/chess/build.json')
    expect(url.searchParams.has('refresh')).toBe(true)
    expect(options).toMatchObject({ cache: 'no-store', credentials: 'omit' })
  })

  it('does not report failed or malformed checks as up to date', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: 'bad' })))
      .mockResolvedValueOnce(new Response('<html>Not a build manifest</html>'))
      .mockRejectedValueOnce(new TypeError('offline'))
    const scope = new URL('https://example.test/chess/')
    await expect(fetchLatestBuild(scope, new AbortController().signal)).rejects.toThrow('HTTP 503')
    await expect(fetchLatestBuild(scope, new AbortController().signal)).rejects.toThrow('invalid build')
    await expect(fetchLatestBuild(scope, new AbortController().signal)).rejects.toThrow('unreadable update information')
    await expect(fetchLatestBuild(scope, new AbortController().signal)).rejects.toThrow('saved app still works offline')
  })

  it('times out a stalled connection instead of leaving update controls busy forever', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout })
    fetchMock.mockImplementation((_input, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    const failed = expect(fetchLatestBuild(new URL('https://example.test/chess/'), new AbortController().signal)).rejects.toThrow('took too long')
    await vi.advanceTimersByTimeAsync(5000)
    await failed
  })

  it('cancels an unmounted update request and avoids fetching with an already-aborted signal', async () => {
    fetchMock.mockImplementation((_input, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    const controller = new AbortController()
    const failed = expect(fetchLatestBuild(new URL('https://example.test/chess/'), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await failed
    await expect(fetchLatestBuild(new URL('https://example.test/chess/'), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('constructs a cache-busted recovery entry within the deployment path', () => {
    const url = new URL(refreshedAppUrl(new URL('https://example.test/chess/'), version))
    expect(url.pathname).toBe('/chess/refresh.html')
    expect(url.searchParams.get('appVersion')).toBe(version)
    expect(url.searchParams.has('refresh')).toBe(true)
  })
})
