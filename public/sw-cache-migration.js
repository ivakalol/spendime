/*
 * One-time-compatible cache migration for clients that ran the original
 * Spendime worker. CacheStorage is origin-scoped; these prefixes are limited
 * to cache names created by Spendime's previous Workbox configuration.
 * Cookies, storage, IndexedDB, and API data are intentionally untouched.
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (cacheNames) => {
      const legacyCacheNames = cacheNames
        .filter((cacheName) =>
          cacheName.startsWith('workbox-precache-v2-') ||
          cacheName === 'spendime-navigation-v1');

      await Promise.all(legacyCacheNames.map((cacheName) => caches.delete(cacheName)));

      // Old Spendime bundles only showed an update prompt. If this activation
      // migrated that legacy precache, refresh its currently open windows so
      // they do not keep rendering the already-loaded old bundle. This branch
      // is one-time and does not run on later v2-to-v2 worker updates.
      if (legacyCacheNames.length > 0) {
        await self.clients.claim();
        const windows = await self.clients.matchAll({ type: 'window' });
        await Promise.all(windows.map((client) => client.navigate(client.url)));
      }
    }),
  );
});
