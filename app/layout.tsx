import type { Metadata } from 'next';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import 'react-toastify/dist/ReactToastify.css';
import './globals.css';
import BootPWA from '@/lib/components/boot-pwa';
import ToastProvider from '@/lib/components/toast-provider';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const withBasePath = (path: string) =>
  `${basePath}${path.startsWith('/') ? path : `/${path}`}`;

export const metadata: Metadata = {
  title: 'News Report Tracker',
  description: 'A utility tool to collect, track, and analyse news reports.',
  manifest: withBasePath('/manifest.webmanifest'),
};

const devServiceWorkerCleanupScript = `
(() => {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .catch(() => undefined);

  if ('caches' in window) {
    window.caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => window.caches.delete(key))))
      .catch(() => undefined);
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {process.env.NODE_ENV !== 'production' && (
          <script dangerouslySetInnerHTML={{ __html: devServiceWorkerCleanupScript }} />
        )}
        <link rel="manifest" href={withBasePath('/manifest.webmanifest')} />
        <meta name="theme-color" content="#111827" />
        {/* Favicon */}
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href={withBasePath('/icons/ios/32.png')}
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href={withBasePath('/icons/ios/16.png')}
        />
        {/* Apple Touch Icon */}
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href={withBasePath('/icons/ios/180.png')}
        />
        {/* Android Chrome Icons */}
        <link
          rel="icon"
          type="image/png"
          sizes="192x192"
          href={withBasePath('/icons/android/android-launchericon-192-192.png')}
        />
        <link
          rel="icon"
          type="image/png"
          sizes="512x512"
          href={withBasePath('/icons/android/android-launchericon-512-512.png')}
        />
        {/* Windows 11 Large Tile */}
        <link
          rel="icon"
          type="image/png"
          sizes="150x150"
          href={withBasePath('/icons/windows11/Square150x150Logo.scale-100.png')}
        />
      </head>
      <body>
        <BootPWA />
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
