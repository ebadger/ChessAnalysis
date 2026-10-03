import { useEffect, useState } from 'react'

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

function checkOffline(worker: ServiceWorker, type: 'OFFLINE_STATUS' | 'PREPARE_OFFLINE', signal: AbortSignal): Promise<boolean> {
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
      } else {
        cleanup()
        resolve(data.ready)
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

export function useOffline() {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<OfflineState>({ status: 'preparing', message: 'Preparing your offline copy...' })

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    async function prepare() {
      if (!import.meta.env.PROD) {
        setState({ status: 'development', message: 'Local engine. Offline saving is enabled in production builds.' })
        return
      }
      if (!window.isSecureContext || !('serviceWorker' in navigator)) {
        setState({ status: 'unavailable', message: 'Offline saving is unavailable in this browser. Use HTTPS or localhost, and allow service workers.' })
        return
      }
      setState({ status: 'preparing', message: 'Saving the app and chess engine for offline use...' })
      const scope = new URL(import.meta.env.BASE_URL, document.baseURI)
      const workerUrl = new URL('sw.js', scope)
      const existing = await navigator.serviceWorker.getRegistration(scope.href)
      const registration = existing?.scope === scope.href && (existing.active || existing.installing || existing.waiting)
        ? existing
        : await navigator.serviceWorker.register(workerUrl, { scope: scope.pathname, updateViaCache: 'none' })
      if (signal.aborted) return
      const worker = registration.active ?? registration.installing ?? registration.waiting
      if (!worker) throw new Error('The offline worker did not start. Reload the page and try again.')
      if (worker.scriptURL !== workerUrl.href) throw new Error('A different offline app controls this address. Use a separate deployment path for Badger-Flores.')
      await waitForActivation(worker, signal)
      let ready = await checkOffline(worker, 'OFFLINE_STATUS', signal)
      if (!ready) ready = await checkOffline(worker, 'PREPARE_OFFLINE', signal)
      if (!ready) throw new Error('The offline copy is incomplete. Keep this page connected and retry.')
      if (!signal.aborted) setState({ status: 'ready', message: 'Available offline. App and Stockfish engine saved on this device.' })
    }
    void prepare().catch((cause: unknown) => {
      if (!signal.aborted) setState({ status: 'error', message: cause instanceof Error ? cause.message : String(cause) })
    })
    return () => controller.abort()
  }, [attempt])

  return { ...state, retry: () => setAttempt((value) => value + 1) }
}
