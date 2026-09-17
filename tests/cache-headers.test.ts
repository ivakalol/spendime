import type express from 'express';
import { describe, expect, it, vi } from 'vitest';
import { CACHE_CONTROL, setClientStaticHeaders } from '../src/server/app.js';

function headerMapFor(filePath: string): Map<string, string> {
  const headers = new Map<string, string>();
  const response = {
    setHeader: vi.fn((name: string, value: string) => headers.set(name, value)),
  } as unknown as express.Response;
  setClientStaticHeaders(response, filePath);
  return headers;
}

describe('production client cache headers', () => {
  it.each(['index.html', 'sw.js', 'sw-cache-migration.js'])('%s must revalidate', (fileName) => {
    const headers = headerMapFor(`C:/app/dist/client/${fileName}`);
    expect(headers.get('Cache-Control')).toBe(CACHE_CONTROL.revalidate);
    expect(headers.get('Pragma')).toBe('no-cache');
    expect(headers.get('Expires')).toBe('0');
  });

  it('allows the generated service worker scope at the application root', () => {
    expect(headerMapFor('C:/app/dist/client/sw.js').get('Service-Worker-Allowed')).toBe('/');
  });

  it('revalidates the manifest', () => {
    expect(headerMapFor('C:/app/dist/client/manifest.webmanifest').get('Cache-Control'))
      .toBe(CACHE_CONTROL.manifest);
  });

  it('immutably caches fingerprinted Workbox runtime files', () => {
    expect(headerMapFor('C:/app/dist/client/workbox-98f7a950.js').get('Cache-Control'))
      .toBe(CACHE_CONTROL.immutable);
  });
});
