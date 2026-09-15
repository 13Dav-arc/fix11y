import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHealthCheckServer, setupKeepAlive } from '../src/worker.js';
import { AccessibleLogger } from '../src/cli/accessible-logger.js';

test('createHealthCheckServer - responds 200 OK to / and /health, 404 to unknown routes', async () => {
  const logger = new AccessibleLogger();
  // Using port 0 allows OS to assign an available port
  const server = createHealthCheckServer(0, logger);

  await new Promise<void>((resolve) => {
    server.on('listening', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. GET /
    const resRoot = await fetch(`${baseUrl}/`);
    assert.equal(resRoot.status, 200);
    const bodyRoot = (await resRoot.json()) as { status: string; uptime: number };
    assert.equal(bodyRoot.status, 'ok');
    assert.ok(typeof bodyRoot.uptime === 'number');

    // 2. GET /health
    const resHealth = await fetch(`${baseUrl}/health`);
    assert.equal(resHealth.status, 200);
    const bodyHealth = (await resHealth.json()) as { status: string };
    assert.equal(bodyHealth.status, 'ok');

    // 3. GET /unknown
    const resNotFound = await fetch(`${baseUrl}/some/unknown/route`);
    assert.equal(resNotFound.status, 404);
    const bodyNotFound = (await resNotFound.json()) as { error: string };
    assert.equal(bodyNotFound.error, 'Not Found');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('setupKeepAlive - returns undefined when no external URL is configured', () => {
  const previousEnv = process.env.RENDER_EXTERNAL_URL;
  delete process.env.RENDER_EXTERNAL_URL;

  try {
    const timer = setupKeepAlive(undefined, new AccessibleLogger());
    assert.equal(timer, undefined);
  } finally {
    if (previousEnv) process.env.RENDER_EXTERNAL_URL = previousEnv;
  }
});

test('setupKeepAlive - schedules unreferenced keep-alive self-ping when external URL is provided', async () => {
  let pingReceived = false;

  // Create mock receiver server
  const mockServer = http.createServer((req, res) => {
    if (req.url === '/health') {
      pingReceived = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => {
    mockServer.listen(0, '127.0.0.1', () => resolve());
  });

  const address = mockServer.address() as any;
  const targetUrl = `http://127.0.0.1:${address.port}`;

  // Use short interval (50ms) for testing
  const timer = setupKeepAlive(targetUrl, new AccessibleLogger(), 50);
  assert.ok(timer, 'Timer should be returned');

  // Wait 120ms to allow at least one ping to fire
  await new Promise((resolve) => setTimeout(resolve, 120));

  clearInterval(timer);
  await new Promise<void>((resolve) => mockServer.close(() => resolve()));

  assert.equal(pingReceived, true, 'Mock server should receive keep-alive ping');
});
