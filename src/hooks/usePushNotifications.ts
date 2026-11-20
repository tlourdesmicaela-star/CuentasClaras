import { useCallback, useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export type NotificationPermissionState = NotificationPermission | 'unsupported';

export interface NotificationPrefs {
  notifyEnabled: boolean;
  notifyNewExpense: boolean;
  notifySettlementReminder: boolean;
}

const STORAGE_PREFS_KEY = 'cuentasclaras_notify_prefs_v1';

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermissionState>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission;
  });

  const [swReady, setSwReady] = useState(false);

  const [prefs, setPrefs] = useState<NotificationPrefs>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFS_KEY);
      if (saved) return JSON.parse(saved) as NotificationPrefs;
    } catch {
      // Ignore storage error
    }
    return {
      notifyEnabled: false,
      notifyNewExpense: true,
      notifySettlementReminder: true,
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore quota error
    }
  }, [prefs]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }

    if ('serviceWorker' in navigator) {
      try {
        registerSW({ immediate: true });
        navigator.serviceWorker.ready
          .then(() => setSwReady(true))
          .catch(() => setSwReady(false));
      } catch {
        setSwReady(false);
      }
    }
  }, []);

  const triggerSystemPush = useCallback(
    async (options: { title: string; body: string; tag?: string }) => {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        return false;
      }
      if (Notification.permission !== 'granted') {
        return false;
      }

      try {
        if ('serviceWorker' in navigator) {
          const registration = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
          ]);
          if (registration && typeof registration.showNotification === 'function') {
            await registration.showNotification(options.title, {
              body: options.body,
              icon: '/pwa-192x192.png',
              badge: '/pwa-192x192.png',
              tag: options.tag || 'cuentasclaras-alert',
              data: { url: '/' },
            });
            return true;
          }
        }

        new Notification(options.title, {
          body: options.body,
          icon: '/pwa-192x192.png',
          tag: options.tag || 'cuentasclaras-alert',
        });
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  const requestPermissionAndEnable = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      return 'unsupported' as const;
    }

    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      setPrefs((prev) => ({ ...prev, notifyEnabled: true }));
      await triggerSystemPush({
        title: 'Notificaciones activadas en CuentasClaras',
        body: 'Vas a recibir alertas de nuevos gastos y recordatorios de transferencias pendientes.',
        tag: 'cuentasclaras-welcome',
      });
    } else {
      setPrefs((prev) => ({ ...prev, notifyEnabled: false }));
    }
    return result;
  }, [triggerSystemPush]);

  return {
    permission,
    swReady,
    prefs,
    setPrefs,
    requestPermissionAndEnable,
    triggerSystemPush,
  };
}
