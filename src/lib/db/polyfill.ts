import { createRequire } from 'node:module';

if (typeof globalThis.require === 'undefined') {
  // @ts-ignore
  globalThis.require = createRequire(import.meta.url);
}