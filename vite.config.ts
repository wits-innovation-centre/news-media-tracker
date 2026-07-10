import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { powerApps } from "@microsoft/power-apps-vite/plugin";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const windowsIcons = [
  { src: '/icons/windows11/SmallTile.scale-100.png', sizes: '71x71' },
  { src: '/icons/windows11/SmallTile.scale-125.png', sizes: '89x89' },
  { src: '/icons/windows11/SmallTile.scale-150.png', sizes: '107x107' },
  { src: '/icons/windows11/SmallTile.scale-200.png', sizes: '142x142' },
  { src: '/icons/windows11/SmallTile.scale-400.png', sizes: '284x284' },
  { src: '/icons/windows11/Square150x150Logo.scale-100.png', sizes: '150x150' },
  { src: '/icons/windows11/Square150x150Logo.scale-125.png', sizes: '188x188' },
  { src: '/icons/windows11/Square150x150Logo.scale-150.png', sizes: '225x225' },
  { src: '/icons/windows11/Square150x150Logo.scale-200.png', sizes: '300x300' },
  { src: '/icons/windows11/Square150x150Logo.scale-400.png', sizes: '600x600' },
  { src: '/icons/windows11/Wide310x150Logo.scale-100.png', sizes: '310x150' },
  { src: '/icons/windows11/Wide310x150Logo.scale-125.png', sizes: '388x188' },
  { src: '/icons/windows11/Wide310x150Logo.scale-150.png', sizes: '465x225' },
  { src: '/icons/windows11/Wide310x150Logo.scale-200.png', sizes: '620x300' },
  { src: '/icons/windows11/Wide310x150Logo.scale-400.png', sizes: '1240x600' },
  { src: '/icons/windows11/LargeTile.scale-100.png', sizes: '310x310' },
  { src: '/icons/windows11/LargeTile.scale-125.png', sizes: '388x388' },
  { src: '/icons/windows11/LargeTile.scale-150.png', sizes: '465x465' },
  { src: '/icons/windows11/LargeTile.scale-200.png', sizes: '620x620' },
  { src: '/icons/windows11/LargeTile.scale-400.png', sizes: '1240x1240' },
  { src: '/icons/windows11/Square44x44Logo.scale-100.png', sizes: '44x44' },
  { src: '/icons/windows11/Square44x44Logo.scale-125.png', sizes: '55x55' },
  { src: '/icons/windows11/Square44x44Logo.scale-150.png', sizes: '66x66' },
  { src: '/icons/windows11/Square44x44Logo.scale-200.png', sizes: '88x88' },
  { src: '/icons/windows11/Square44x44Logo.scale-400.png', sizes: '176x176' },
  { src: '/icons/windows11/StoreLogo.scale-100.png', sizes: '50x50' },
  { src: '/icons/windows11/StoreLogo.scale-125.png', sizes: '63x63' },
  { src: '/icons/windows11/StoreLogo.scale-150.png', sizes: '75x75' },
  { src: '/icons/windows11/StoreLogo.scale-200.png', sizes: '100x100' },
  { src: '/icons/windows11/StoreLogo.scale-400.png', sizes: '200x200' },
  { src: '/icons/windows11/SplashScreen.scale-100.png', sizes: '620x300' },
  { src: '/icons/windows11/SplashScreen.scale-125.png', sizes: '775x375' },
  { src: '/icons/windows11/SplashScreen.scale-150.png', sizes: '930x450' },
  { src: '/icons/windows11/SplashScreen.scale-200.png', sizes: '1240x600' },
  { src: '/icons/windows11/SplashScreen.scale-400.png', sizes: '2480x1200' },
  { src: '/icons/windows11/Square44x44Logo.targetsize-16.png', sizes: '16x16' },
  { src: '/icons/windows11/Square44x44Logo.targetsize-20.png', sizes: '20x20' },
  { src: '/icons/windows11/Square44x44Logo.targetsize-24.png', sizes: '24x24' },
  { src: '/icons/windows11/Square44x44Logo.targetsize-30.png', sizes: '30x30' },
  { src: '/icons/windows11/Square44x44Logo.targetsize-32.png', sizes: '32x32' },
  { src: '/icons/windows11/Square44x44Logo.targetsize-36.png', sizes: '36x36' },
  { src: '/icons/windows11/Square44x44Logo.targetsize-40.png', sizes: '40x40' },
  { src: '/icons/windows11/Square44x44Logo.targetsize-44.png', sizes: '44x44' },
  { src: '/icons/windows11/Square44x44Logo.targetsize-48.png', sizes: '48x48' },
  { src: '/icons/windows11/Square44x44Logo.targetsize-60.png', sizes: '60x60' },
  { src: '/icons/windows11/Square44x44Logo.targetsize-64.png', sizes: '64x64' },
  { src: '/icons/windows11/Square44x44Logo.targetsize-72.png', sizes: '72x72' },
  { src: '/icons/windows11/Square44x44Logo.targetsize-80.png', sizes: '80x80' },
  { src: '/icons/windows11/Square44x44Logo.targetsize-96.png', sizes: '96x96' },
  { src: '/icons/windows11/Square44x44Logo.targetsize-256.png', sizes: '256x256' },
  { src: '/icons/windows11/Square44x44Logo.altform-unplated_targetsize-16.png', sizes: '16x16' },
  { src: '/icons/windows11/Square44x44Logo.altform-unplated_targetsize-20.png', sizes: '20x20' },
  { src: '/icons/windows11/Square44x44Logo.altform-unplated_targetsize-24.png', sizes: '24x24' },
  { src: '/icons/windows11/Square44x44Logo.altform-unplated_targetsize-30.png', sizes: '30x30' },
  { src: '/icons/windows11/Square44x44Logo.altform-unplated_targetsize-32.png', sizes: '32x32' },
  { src: '/icons/windows11/Square44x44Logo.altform-unplated_targetsize-36.png', sizes: '36x36' },
  { src: '/icons/windows11/Square44x44Logo.altform-unplated_targetsize-40.png', sizes: '40x40' },
  { src: '/icons/windows11/Square44x44Logo.altform-unplated_targetsize-44.png', sizes: '44x44' },
  { src: '/icons/windows11/Square44x44Logo.altform-unplated_targetsize-48.png', sizes: '48x48' },
  { src: '/icons/windows11/Square44x44Logo.altform-unplated_targetsize-60.png', sizes: '60x60' },
  { src: '/icons/windows11/Square44x44Logo.altform-unplated_targetsize-64.png', sizes: '64x64' },
  { src: '/icons/windows11/Square44x44Logo.altform-unplated_targetsize-72.png', sizes: '72x72' },
  { src: '/icons/windows11/Square44x44Logo.altform-unplated_targetsize-80.png', sizes: '80x80' },
  { src: '/icons/windows11/Square44x44Logo.altform-unplated_targetsize-96.png', sizes: '96x96' },
];

const headersPlugin = {
  handlerWillRespond: async ({ response }: { response: any }) => {
    const headers = new Headers(response.headers);
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  },
};

export default defineConfig({
  plugins: [
    react(), powerApps(), tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@sqlite.org/sqlite-wasm/**/*.wasm',
          dest: 'assets'
        },
        {
          src: 'node_modules/@sqlite.org/sqlite-wasm/**/*-proxy.js',
          dest: 'assets'
        }
      ]
    }),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'News Report Tracker',
        short_name: 'NewsTracker',
        description: 'A utility tool to collect, track, and analyse news media.',
        start_url: '/',
        display: 'standalone',
        background_color: '#111827',
        theme_color: '#111827',
        orientation: 'any',
        scope: '/',
        lang: 'en',
        prefer_related_applications: false,
        categories: ['news', 'productivity', 'utilities', 'research'],
        icons: windowsIcons.map((icon) => ({
          ...icon,
          type: 'image/png',
          purpose: 'any',
        })),
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        globIgnores: [
          '**/*sqlite3-opfs-async-proxy*.js',
          '**/*.wasm'
        ],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => ['document', 'iframe', 'worker'].includes(request.destination),
            handler: 'NetworkOnly',
            options: {
              plugins: [headersPlugin],
            },
          },
        ],
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
});
