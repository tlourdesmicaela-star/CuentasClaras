import { cleanupOutdatedCaches, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching';

interface PushNotificationPayload {
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
}

interface SWNotificationEvent extends Event {
  notification: Notification & { data?: { url?: string } };
  waitUntil: (promise: Promise<unknown>) => void;
}

interface SWPushEvent extends Event {
  data?: {
    json?: () => PushNotificationPayload;
    text?: () => string;
  };
  waitUntil: (promise: Promise<unknown>) => void;
}

interface SWScope {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
  skipWaiting: () => Promise<void>;
  clients: {
    claim: () => Promise<void>;
    matchAll: (options?: { type?: string; includeUncontrolled?: boolean }) => Promise<Array<{ url: string; focus?: () => Promise<unknown> }>>;
    openWindow: (url: string) => Promise<unknown>;
  };
  registration: ServiceWorkerRegistration;
  addEventListener: (type: string, listener: (event: Event) => void) => void;
}

declare global {
  interface Window {
    __WB_MANIFEST: Array<PrecacheEntry | string>;
  }
}

const sw = self as unknown as SWScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

sw.addEventListener('install', () => {
  void sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
  const extendable = event as Event & { waitUntil: (p: Promise<unknown>) => void };
  extendable.waitUntil(sw.clients.claim());
});

sw.addEventListener('push', (rawEvent) => {
  const event = rawEvent as SWPushEvent;
  let payload: PushNotificationPayload = {
    title: 'CuentasClaras',
    body: 'Tenés una actualización en tu juntada.',
    tag: 'cuentasclaras-alert',
    url: '/',
  };

  if (event.data) {
    try {
      const parsed = event.data.json?.();
      if (parsed) {
        payload = { ...payload, ...parsed };
      }
    } catch {
      const text = event.data.text?.();
      if (text) payload.body = text;
    }
  }

  event.waitUntil(
    sw.registration.showNotification(payload.title || 'CuentasClaras', {
      body: payload.body || '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: payload.tag || 'cuentasclaras-alert',
      data: { url: payload.url || '/' },
    })
  );
});

sw.addEventListener('notificationclick', (rawEvent) => {
  const event = rawEvent as SWNotificationEvent;
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.focus) {
          return client.focus();
        }
      }
      return sw.clients.openWindow(targetUrl);
    })
  );
});
