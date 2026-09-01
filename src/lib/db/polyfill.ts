import crypto from 'node:crypto';

if (typeof (globalThis as any).require === 'undefined') {
  (globalThis as any).require = (id: string) => {
    if (id === 'crypto') return crypto;
    throw new Error(`Dynamic require('${id}') is not supported in Cloudflare Workers.`);
  };
}