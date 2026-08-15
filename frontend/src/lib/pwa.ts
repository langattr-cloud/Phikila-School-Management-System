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
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // A failed registration must never break the app; it just means no
      // offline support on this device.
    })
  })
}
