/**
 * Service worker registration.
 *
 * Registered only for production builds so the Vite dev server keeps hot
 * reloading normally, and only when the page is served over a secure context.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if (!window.isSecureContext) return

  window.addEventListener('load', () => {
    let reloading = false

    // If an older worker was controlling the page, activating the new worker
    // must also refresh the document. Otherwise the old HTML can keep
    // referencing a hashed JS bundle that no longer exists after a deploy.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    })

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => registration.update())
      .catch(() => {
        // A failed registration must never break the app; it just means no
        // offline support on this device.
      })
  })
}
