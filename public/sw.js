// Relationship ID Service Worker for Web Push Notifications
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch {
    data = {};
  }

  const title = data.title || 'Relationship ID';
  const options = {
    body: data.body || 'لديك تذكير. افتح التطبيق للاطلاع عليه.',
    icon: '/favicon-96x96.png',
    badge: '/favicon-96x96.png',
    data: {
      url: (data.data && data.data.url) || '/'
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = (event.notification.data && event.notification.data.url) || '/';
  let safeUrl = '/';
  try {
    const parsed = new URL(rawUrl, self.location.origin);
    if (parsed.origin === self.location.origin) {
      safeUrl = parsed.pathname + parsed.search + parsed.hash;
    }
  } catch {
    safeUrl = '/';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(safeUrl);
      }
    })
  );
});
