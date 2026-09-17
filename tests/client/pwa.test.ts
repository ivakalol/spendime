import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
describe('PWA security configuration',()=>{
  const source=readFileSync('vite.config.ts','utf8');
  const registration=readFileSync('src/client/components/PwaStatus.tsx','utf8');
  const migration=readFileSync('public/sw-cache-migration.js','utf8');
  it('automatically activates updates and keeps APIs network-only',()=>{
    expect(source).toContain("registerType: 'autoUpdate'");
    expect(source).toContain('skipWaiting: true');
    expect(source).toContain('clientsClaim: true');
    expect(source).toContain("handler: 'NetworkOnly'");
  });
  it('uses network-first navigation without precaching the HTML shell',()=>{
    expect(source).toContain("handler: 'NetworkFirst'");
    expect(source).toContain("'**/index.html'");
    expect(source).toContain('manifest: false');
    expect(source).toContain("cacheName: 'spendime-navigation-v2'");
  });
  it('bypasses the HTTP cache during startup checks and migrates legacy precaches',()=>{
    expect(registration).toContain("updateViaCache: 'none'");
    expect(registration).toContain('registration.update()');
    expect(migration).toContain("cacheName.startsWith('workbox-precache-v2-')");
    expect(migration).toContain("self.clients.matchAll({ type: 'window' })");
    expect(migration).not.toContain('localStorage');
    expect(migration).not.toContain('cookie');
  });
  it('ships install icons at required sizes',()=>{expect(statSync('public/icons/icon-192.png').size).toBeGreaterThan(100);expect(statSync('public/icons/icon-512.png').size).toBeGreaterThan(100);expect(statSync('public/icons/apple-touch-icon.png').size).toBeGreaterThan(100)});
});
