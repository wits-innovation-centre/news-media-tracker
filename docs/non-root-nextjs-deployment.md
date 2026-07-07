# Non-root Next.js Deployment Pattern

This document describes a generalized approach for deploying any Next.js application from a non-root URL path such as `/<your-endpoint>`.

## 1. Configure `basePath` in `next.config.mjs`

The application must be built with the same base path that it will be served from.

- read `NEXT_PUBLIC_BASE_PATH` from environment
- normalize it to remove any trailing slash
- set `basePath` to that normalized value
- expose the same normalized value to the client

Example:

```js
const normalisedBasePath =
  process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") ?? "";

module.exports = {
  basePath: normalisedBasePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: normalisedBasePath,
  },
};
```

That makes Next build asset and route URLs under the deployed base path instead of `/`.

## 2. Publish a shared base-path helper

Create one reusable helper for constructing URLs consistently.

Typical helpers:

- `getBasePath()`
- `withBasePath(path: string)`
- `getApiUrl(path: string)`

Use the helper for all browser-visible paths, for example:

- `withBasePath('/favicon.ico')` → `/<your-endpoint>/favicon.ico`
- `getApiUrl('/api/example')` → `/<your-endpoint>/api/example`

This avoids hard-coded root-relative strings in multiple places.

## 3. Keep HTML asset references base-path-aware

Any asset or metadata reference that appears in rendered HTML must include the base path.

Key examples:

- root layout links
  - `<link rel="manifest" href={withBasePath('/api/manifest')} />`
  - `<link rel="icon" href={withBasePath('/favicon.ico')} />`
- manifest entries
  - `start_url` / `scope` should use the base path
  - icon `src` values should use the base path

If static HTML still references `/favicon.ico`, `/manifest.json`, or other root paths, the browser may request the wrong URL.

## 4. Prefer dynamic manifest generation when possible

A static manifest can work, but a dynamic route is easier to keep aligned with `NEXT_PUBLIC_BASE_PATH`.

For example:

- `app/api/manifest/route.ts` returns JSON built from `getBasePath()`
- the layout points to `withBasePath('/api/manifest')`

That avoids hard-coding the manifest path and keeps the app portable across different deployments.

## 5. Avoid hard-coded root `/api/...` URLs in client code

Any client-side API request needs the same base path.

Search for patterns like:

- `fetch('/api/...')`
- `axios('/api/...')`
- `new URL('/api/...', ...)`
- literal `'/api/...'` strings used for browser requests

Replace them with the helper:

- `fetch(getApiUrl('/api/your-route'))`
- `axios.get(getApiUrl('/api/your-route'))`

Under a base path, `fetch('/api/...')` will otherwise target the wrong origin path.

## 6. Serve the favicon and other static metadata under base path

Static metadata is often requested from root by default.

To avoid this, ensure the app exposes and links the favicon under the base path:

- `withBasePath('/favicon.ico')`
- `withBasePath('/apple-touch-icon.png')`

If the browser loads `/favicon.ico` while the app lives at `/<your-endpoint>`, the request will fail or be routed incorrectly.

## 7. Handle optional service worker registration carefully

If your app uses a service worker, the registration URL and `scope` must also use the base path.

- register `withBasePath('/service-worker.js')`
- set `scope: withBasePath('/')`

In addition, the service worker should derive its effective base path from `self.registration.scope` so cache keys and network handling stay aligned.

If you do not need PWA/offline behavior, it is better to keep `display: 'browser'` and avoid SW registration entirely.

## 8. Verify fallback/offline assets are base-path-aware

Any fallback HTML or offline/page shell should also use base-path-aware asset URLs.

Examples:

- `public/offline.html`
- `public/404.html`
- any HTML templates rendered by the app

Otherwise the browser may still request `/favicon.ico`, `/manifest.json`, or `/service-worker.js` from root.

## 9. Reset browser state after deployment path changes

When switching an app from root to a non-root path, stale browser state can cause issues.

Clear or unregister:

- old service workers
- old caches
- old manifest registrations
- old site data for the application path

Use browser DevTools Application panel to inspect and clear stale registrations.

## 10. Deployment and proxy considerations

The base path must be visible to both the proxy and the app.

- mount the app at the chosen path, e.g. `/home`
- do not rewrite away the browser-visible path before it reaches Next
- pass the same `NEXT_PUBLIC_BASE_PATH` into the app container or runtime
- ensure the configured prefix matches the actual proxy mount path

That keeps Next routing, asset URLs, and browser paths consistent.

## Minimal checklist for any app

1. set `NEXT_PUBLIC_BASE_PATH=/<your-endpoint>`
2. configure Next `basePath` from that env value
3. expose the same value to client code
4. create a shared base-path helper
5. use it for:
   - manifest/reference URLs
   - favicon/media links
   - client API calls
   - service worker registration/scope (if used)
6. keep any offline/fallback HTML base-path-aware
7. avoid hard-coded `'/api/...'` on the browser side
8. clear stale browser service worker/cache state after path changes
9. test the app at `/<your-endpoint>`

## Why this pattern works

Next.js `basePath` changes the route prefix used by the framework, but it does not automatically rewrite every browser-visible URL.

Therefore every layer that emits or consumes a URL must use the same base path:

- built routes and static assets
- HTML metadata and manifest entries
- client-side API calls
- service worker scope and registrations

If any layer still uses root `/`, the app may fail in deployment even though the build succeeded.

This is the general approach for deploying a Next.js application from a non-root URL path.
