export interface AppUpdateState {
  status: 'idle' | 'checking' | 'current' | 'available' | 'reloading' | 'error'
  message: string
  version?: string
}

export interface AppUpdateControls {
  currentVersion: string | null
  enabled: boolean
  state: AppUpdateState
  check: () => Promise<void>
  reload: () => Promise<void>
}

export function isBuildVersion(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{16}$/.test(value)
}

export function readAppBuild(): string | null {
  const version = document.querySelector('meta[name="app-build"]')?.getAttribute('content')
  return isBuildVersion(version) ? version : null
}

export function refreshedAppUrl(scope: URL, version: string): string {
  const url = new URL('refresh.html', scope)
  url.searchParams.set('appVersion', version)
  url.searchParams.set('refresh', String(Date.now()))
  return url.href
}

export async function fetchLatestBuild(scope: URL, signal: AbortSignal): Promise<string> {
  const url = new URL('build.json', scope)
  url.searchParams.set('refresh', String(Date.now()))
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  const timer = window.setTimeout(() => { timedOut = true; controller.abort() }, 5000)
  try {
    if (signal.aborted) throw new DOMException('Update check cancelled.', 'AbortError')
    let response: Response
    try {
      response = await fetch(url, { cache: 'no-store', credentials: 'omit', signal: controller.signal })
    } catch (cause) {
      if (signal.aborted) throw cause
      if (timedOut) throw new Error('The update check took too long. Your saved app is unchanged; try again when the connection is better.')
      throw new Error('Could not reach this site to check for updates. Your saved app still works offline.')
    }
    if (!response.ok) throw new Error(`The update check returned HTTP ${response.status}. Your saved app is unchanged.`)
    let data: unknown
    try { data = await response.json() }
    catch { throw new Error('The site returned unreadable update information. Please retry.') }
    if (typeof data !== 'object' || data === null || !('version' in data) || !isBuildVersion(data.version)) {
      throw new Error('The site returned an invalid build version. Please retry after the deployment finishes.')
    }
    return data.version
  } finally {
    window.clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}
