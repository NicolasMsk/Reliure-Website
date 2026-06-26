import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../src/app';

const app = createApp();
const server: Server = app.listen(0);
const base = () => {
  const addr = server.address();
  if (addr && typeof addr === 'object') return `http://127.0.0.1:${addr.port}`;
  throw new Error('server address unavailable');
};

after(() => server.close());

test('GET /api/health renvoie 200 et { ok: true }', async () => {
  const res = await fetch(`${base()}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test("GET / sert la page d'accueil (HTML)", async () => {
  const res = await fetch(`${base()}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/html/);
});
