import { useEffect, useRef, useState } from 'react'
import { fetchLatestBuild, isBuildVersion, readAppBuild, refreshedAppUrl } from '../appUpdates'
import type { AppUpdateControls, AppUpdateState } from '../appUpdates'

type OfflineState = {
  status: 'preparing' | 'ready' | 'development' | 'unavailable' | 'error'
  message: string
}

function waitForActivation(worker: ServiceWorker, signal: AbortSignal): Promise<void> {
  if (worker.state === 'activated') return Promise.resolve()
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      worker.removeEventListener('statechange', onState)
      signal.removeEventListener('abort', onAbort)
    }
    const onState = () => {
      if (worker.state === 'activated') { cleanup(); resolve() }
      else if (worker.state === 'redundant') {
        cleanup()
        reject(new Error('Some app files could not be saved. Check the connection to this site and try again.'))
      }
    }
    const onAbort = () => { cleanup(); reject(new DOMException('Offline preparation cancelled.', 'AbortError')) }
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('Saving the offline copy took too long. Keep the page open with a connection and retry.'))
    }, 90000)
    worker.addEventListener('statechange', onState)
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
    else onState()
  })
}

interface OfflineReply {
  ready: boolean
  version: string
}

function checkOffline(worker: ServiceWorker, type: 'OFFLINE_STATUS' | 'PREPARE_OFFLINE', signal: AbortSignal): Promise<OfflineReply> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()
    const cleanup = () => {
      clearTimeout(timer)
      channel.port1.close()
      channel.port2.close()
      signal.removeEventListener('abort', onAbort)
    }
    const fail = (error: Error) => { cleanup(); reject(error) }
    const onAbort = () => fail(new DOMException('Offline preparation cancelled.', 'AbortError'))
    const timer = window.setTimeout(() => fail(new Error('The offline cache did not respond. Reload the page and try again.')), 90000)
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data
      if (typeof data !== 'object' || data === null || !('ready' in data) || typeof data.ready !== 'boolean') {
        fail(new Error('The offline cache returned an invalid status. Reload the page and try again.'))
      } else if ('error' in data && typeof data.error === 'string') {
        fail(new Error(`The offline copy could not be saved: ${data.error}`))
      } else if (!('version' in data) || !isBuildVersion(data.version)) {
        fail(new Error('The offline cache did not identify its build version. Please reload and retry.'))
      } else {
        cleanup()
        resolve({ ready: data.ready, version: data.version })
      }
    }
    channel.port1.onmessageerror = () => fail(new Error('The offline cache response could not be read.'))
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
    else {
      try { worker.postMessage({ type }, [channel.port2]) }
      catch (cause) { fail(cause instanceof Error ? cause : new Error(String(cause))) }
    }
  })
}

function ownWorker(worker: ServiceWorker, scope: URL): boolean {
  const url = new URL(worker.scriptURL)
  const expected = new URL('sw.js', scope)
  return url.origin === expected.origin && url.pathname === expected.pathname
}

async function ensureOfflineVersion(scope: URL, version: string, signal: AbortSignal): Promise<ServiceWorker> {
  const existing = await navigator.serviceWorker.getRegistration(scope.href)
  if (existing?.scope === scope.href && existing.active) {
    if (!ownWorker(existing.active, scope)) throw new Error('A different offline app controls this address. Use a separate deployment path for Flores-Badger.')
    const saved = await checkOffline(existing.active, 'OFFLINE_STATUS', signal)
    if (saved.version === version) {
      if (!saved.ready) {
        const repaired = await checkOffline(existing.active, 'PREPARE_OFFLINE', signal)
        if (!repaired.ready || repaired.version !== version) throw new Error('The offline copy is incomplete. Keep this page connected and retry.')
      }
      return existing.active
    }
  }
  if (signal.aborted) throw new DOMException('Offline preparation cancelled.', 'AbortError')
  const workerUrl = new URL('sw.js', scope)
  workerUrl.searchParams.set('build', version)
  const registration = await navigator.serviceWorker.register(workerUrl, { scope: scope.pathname, updateViaCache: 'none' })
  const worker = registration.installing ?? registration.waiting ?? registration.active
  if (!worker || !ownWorker(worker, scope)) throw new Error('The new offline worker did not start. Reload and try again.')
  await waitForActivation(worker, signal)
  const saved = await checkOffline(worker, 'OFFLINE_STATUS', signal)
  if (!saved.ready || saved.version !== version) throw new Error('The deployment is still changing. Retry offline saving in a moment.')
  return worker
}

export function useOffline() {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<OfflineState>({ status: 'preparing', message: 'Preparing your offline copy...' })
  const [buildVersion] = useState(readAppBuild)
  const [update, setUpdate] = useState<AppUpdateState>({
    status: 'idle',
    message: import.meta.env.PROD ? 'Check for a newer release, or reload with a fresh page request.' : 'Development mode refreshes directly from the local server.',
  })
  const ready = useRef(false)
  const latestVersion = useRef<string | null>(null)
  const updateRequest = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const scope = new URL(import.meta.env.BASE_URL, document.baseURI)
    const receive = (event: MessageEvent<unknown>) => {
      const data = event.data
      const source = event.source
      if (typeof data !== 'object' || data === null || !('type' in data) || data.type !== 'GET_CLIENT_VERSION' ||
        !source || !('scriptURL' in source) || typeof source.scriptURL !== 'string') return
      const url = new URL(source.scriptURL)
      const expected = new URL('sw.js', scope)
      if (url.origin !== expected.origin || url.pathname !== expected.pathname) return
      event.ports[0]?.postMessage({ version: buildVersion })
      if (ready.current && source === navigator.serviceWorker.controller &&
        'version' in data && isBuildVersion(data.version) && data.version !== buildVersion) {
        latestVersion.current = data.version
        setUpdate({ status: 'available', version: data.version, message: 'A new version is ready. Reload when convenient; your current study has not been changed.' })
      }
    }
    navigator.serviceWorker.addEventListener('message', receive)
    return () => navigator.serviceWorker.removeEventListener('message', receive)
  }, [buildVersion])

  useEffect(() => () => updateRequest.current?.abort(), [])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    async function prepare() {
      ready.current = false
      if (!import.meta.env.PROD) {
        setState({ status: 'development', message: 'Local engine. Offline saving is enabled in production builds.' })
        return
      }
      if (!window.isSecureContext || !('serviceWorker' in navigator)) {
        setState({ status: 'unavailable', message: 'Offline saving is unavailable in this browser. Use HTTPS or localhost, and allow service workers.' })
        return
      }
      if (!buildVersion) throw new Error('This page has no build identifier. Rebuild and republish the complete production site.')
      setState({ status: 'preparing', message: 'Saving the app and chess engine for offline use...' })
      const scope = new URL(import.meta.env.BASE_URL, document.baseURI)
      const existing = await navigator.serviceWorker.getRegistration(scope.href)
      let desired = buildVersion
      if (existing?.scope === scope.href && existing.active && ownWorker(existing.active, scope)) {
        const saved = await checkOffline(existing.active, 'OFFLINE_STATUS', signal)
        if (saved.version !== buildVersion) {
          if (!navigator.onLine) throw new Error('A different build is saved offline. Reconnect to finish saving this version.')
          desired = await fetchLatestBuild(scope, signal)
        }
      }
      const worker = await ensureOfflineVersion(scope, desired, signal)
      if (!signal.aborted) {
        ready.current = true
        setState({ status: 'ready', message: desired === buildVersion
          ? 'Available offline. App and Stockfish engine saved on this device.'
          : 'Available offline. A newer saved version is ready to use after reloading.' })
        if (desired !== buildVersion) {
          latestVersion.current = desired
          setUpdate({ status: 'available', version: desired, message: 'A new version is ready. Reload when convenient; your current study has not been changed.' })
        }
        worker.postMessage({ type: 'CLIENT_READY', version: buildVersion })
      }
    }
    void prepare().catch((cause: unknown) => {
      if (!signal.aborted) setState({ status: 'error', message: cause instanceof Error ? cause.message : String(cause) })
    })
    return () => controller.abort()
  }, [attempt, buildVersion])

  const checkForUpdates = async () => {
    if (updateRequest.current) return
    const controller = new AbortController()
    updateRequest.current = controller
    setUpdate({ status: 'checking', message: 'Checking this site for a newer release...' })
    try {
      const version = await fetchLatestBuild(new URL(import.meta.env.BASE_URL, document.baseURI), controller.signal)
      if (controller.signal.aborted) return
      latestVersion.current = version
      setUpdate({ status: version === buildVersion ? 'current' : 'available', version, message: version === buildVersion ? 'You have the latest published version.' : 'A newer version is available. Save any game you want to keep, then reload the app.' })
    } catch (cause) {
      if (!controller.signal.aborted) setUpdate({ status: 'error', message: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      if (updateRequest.current === controller) updateRequest.current = null
    }
  }

  const reloadApp = async () => {
    if (updateRequest.current) return
    const controller = new AbortController()
    updateRequest.current = controller
    setUpdate({ status: 'reloading', message: 'Preparing the refreshed app and its offline copy...' })
    try {
      const scope = new URL(import.meta.env.BASE_URL, document.baseURI)
      const version = navigator.onLine ? await fetchLatestBuild(scope, controller.signal) : latestVersion.current ?? buildVersion
      if (!version) throw new Error('No saved build is available. Reconnect and check for updates.')
      if (window.isSecureContext && 'serviceWorker' in navigator) await ensureOfflineVersion(scope, version, controller.signal)
      if (!controller.signal.aborted) window.location.replace(refreshedAppUrl(scope, version))
    } catch (cause) {
      if (!controller.signal.aborted) setUpdate({ status: 'error', message: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      if (updateRequest.current === controller) updateRequest.current = null
    }
  }

  const updates: AppUpdateControls = {
    currentVersion: buildVersion,
    enabled: import.meta.env.PROD && state.status !== 'preparing',
    state: update,
    check: checkForUpdates,
    reload: reloadApp,
  }
  return { ...state, retry: () => setAttempt((value) => value + 1), updates }
}
