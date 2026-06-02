'use client';
import { useEffect } from 'react';
import { getStorageHealthReport } from '../storage/persistence-policy';

const isProduction = process.env.NODE_ENV === 'production';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const withBasePath = (path: string) =>
  `${basePath}${path.startsWith('/') ? path : `/${path}`}`;

/** Run the full storage health check and emit structured console output. */
async function runStorageHealthCheck(): Promise<void> {
  if (!('storage' in navigator)) {
    console.warn('[SW] Storage API not available; skipping persistence check.');
    return;
  }

  const report = await getStorageHealthReport(navigator.storage);

  if (report.quotaLevel === 'critical') {
    console.error('[SW] storage health: CRITICAL —', report.reason);
  } else if (report.quotaLevel === 'low') {
    console.warn('[SW] storage health: LOW —', report.reason);
  } else {
    console.info('[SW] storage health:', report.reason);
  }
}

export default function BootPWA() {
  useEffect(() => {
    // In development, a stale service worker can cache old Next.js chunks and
    // cause blank screens after hot reloads or restarts. Keep SW disabled.
    if (!isProduction) {
      const cleanupDevelopmentServiceWorkers = async () => {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }

        if ('caches' in window) {
          const keys = await window.caches.keys();
          await Promise.all(keys.map((key) => window.caches.delete(key)));
        }
      };

      void cleanupDevelopmentServiceWorkers();
      return;
    }

    if ('serviceWorker' in navigator) {
      const register = async () => {
        try {
          const registration =
            await navigator.serviceWorker.register(withBasePath('/service-worker.js'));
          console.info(
            '[SW] registered',
            registration.scope,
            registration.updateViaCache,
          );
        } catch (error) {
          console.error('[SW] registration failed', error);
        }

        // Run the storage health check after SW registration so the browser
        // is more likely to honour a persist() request (some browsers require
        // the site to be "engaged" or have an installed SW first).
        await runStorageHealthCheck();
      };

      if (document.readyState === 'complete') {
        void register();
      } else {
        const handleLoad = () => {
          void register();
        };
        window.addEventListener('load', handleLoad, { once: true });
        return () => window.removeEventListener('load', handleLoad);
      }
    } else {
      // No service-worker support; still attempt persist + quota check so the
      // local IndexedDB data has the best chance of surviving cache eviction.
      void runStorageHealthCheck();
    }
  }, []);
  return null;
}
