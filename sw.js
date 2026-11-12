// FRAUD LAB — Safari stability hotfix
// Deliberately no fetch handler: let the browser load the site directly from GitHub Pages.
// If an older registration is updated to this worker, it retires itself and clears only
// this app's own cache namespace. The page also unregisters existing registrations.
self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith("fraud-lab-")).map(key => caches.delete(key)));
    } catch (_) {}
    try { await self.registration.unregister(); } catch (_) {}
  })());
});
