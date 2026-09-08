import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createServer, type ViteDevServer } from 'vite';

let server: ViteDevServer;
let origin: string;

beforeAll(async () => {
  server = await createServer({ server: { port: 0, open: false } });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === 'string') throw new Error('Expected an HTTP address');
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await server?.close();
});

for (const path of ['/guide/', '/guide/index.html']) {
  test(`serves the guide instead of the studio at ${path}`, async () => {
    const response = await fetch(`${origin}${path}`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('How to turn TTML lyrics into a karaoke MP4');
    expect(html).not.toContain('/src/app.ts');
    expect(html).not.toContain('id="app"');
  });
}

test('unknown pages do not fall back to the studio', async () => {
  const response = await fetch(`${origin}/missing-guide/`);
  expect(response.status).toBe(404);
});
