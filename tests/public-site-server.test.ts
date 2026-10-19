import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type pg from 'pg';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';

describe('production public SPA and protected APIs', () => {
  let directory: string;
  const pool = { query: vi.fn() };
  const config = loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://unused:unused@example.invalid/test', COOKIE_SECURE: 'never' });
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'spendime-public-'));
    mkdirSync(path.join(directory, 'dist/client'), { recursive: true });
    writeFileSync(path.join(directory, 'dist/client/index.html'), '<!doctype html><html><head><title>Spendime</title><!-- spendime:page-meta --></head><body><div id="root"></div></body></html>');
    vi.spyOn(process, 'cwd').mockReturnValue(directory);
    pool.query.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (directory.startsWith(path.join(tmpdir(), 'spendime-public-'))) rmSync(directory, { recursive: true, force: true });
  });
  const app = () => createApp(pool as unknown as pg.Pool, config);
  it.each(['/', '/tutorials', '/tutorials/accounts', '/privacy', '/terms'])('serves public %s without a session or database access', async url => {
    const result = await request(app()).get(url).set('Accept', 'text/html');
    expect(result.status).toBe(200);
    expect(result.text).toContain('content="index, follow"');
    expect(result.headers['cache-control']).toContain('no-store');
    expect(pool.query).not.toHaveBeenCalled();
  });
  it('preserves the banking callback destination query via a permanent redirect', async () => {
    const result = await request(app()).get('/banking?result=connected');
    expect(result.status).toBe(308);
    expect(result.headers.location).toBe('/app/banking?result=connected');
  });
  it('returns only a noindex shell for private app navigations', async () => {
    const result = await request(app()).get('/app/transactions').set('Accept', 'text/html');
    expect(result.status).toBe(200);
    expect(result.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(result.text).toContain('content="noindex, nofollow"');
    expect(pool.query).not.toHaveBeenCalled();
  });
  it.each(['/api/accounts', '/api/transactions', '/api/dashboard', '/api/banking/connections'])('continues to require authentication at %s', async url => {
    const result = await request(app()).get(url).set('Accept', 'application/json');
    expect(result.status).toBe(401);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(pool.query).not.toHaveBeenCalled();
  });
  it.each(['/not-a-page', '/tutorials/missing', '/app/missing'])('returns a noindex HTTP 404 at %s', async url => {
    const result = await request(app()).get(url).set('Accept', 'text/html');
    expect(result.status).toBe(404);
    expect(result.text).toContain('Page not found');
    expect(result.headers['x-robots-tag']).toBe('noindex, nofollow');
  });
  it('serves a sitemap and never converts an unknown API into HTML', async () => {
    const instance = app();
    const sitemap = await request(instance).get('/sitemap.xml');
    expect(sitemap.status).toBe(200);
    expect(sitemap.type).toMatch(/xml/);
    expect(sitemap.text).toContain('/tutorials/bank-imports');
    const unknown = await request(instance).get('/api/not-a-route').set('Accept', 'text/html');
    expect(unknown.status).toBe(404);
    expect(unknown.type).toBe('application/json');
  });
});
