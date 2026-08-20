/**
 * Service worker registration.
 *
 * Disabled for now. The app previously used a cache-first asset strategy,
 * which can leave a live tab with an incompatible JavaScript bundle after a
 * deployment. The application must remain network-controlled until the shell
 * update path is proven stable.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .getRegistration('/')
      .then((registration) => registration?.unregister())
      .catch(() => undefined)
  })
}
