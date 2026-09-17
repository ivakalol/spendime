import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
describe('PWA security configuration',()=>{
  const source=readFileSync('vite.config.ts','utf8');
  it('uses prompt updates and NetworkOnly API caching',()=>{expect(source).toContain("registerType: 'prompt'");expect(source).toContain("handler: 'NetworkOnly'")});
  it('ships install icons at required sizes',()=>{expect(statSync('public/icons/icon-192.png').size).toBeGreaterThan(100);expect(statSync('public/icons/icon-512.png').size).toBeGreaterThan(100);expect(statSync('public/icons/apple-touch-icon.png').size).toBeGreaterThan(100)});
});
