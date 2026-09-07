import home from './src/index.html';
import rendererTest from './tests/render.html';

// Development only. The built dist/ folder can be served by any static host.
const server = Bun.serve({
  hostname: '127.0.0.1', port: Number(process.env.PORT || 3000),
  routes: { '/': home, '/render': rendererTest },
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (/^\/fonts\/(?:licenses\.txt|[a-z-]+\/(?:wght\.css|LICENSE|files\/[a-z0-9-]+\.woff2))$/.test(path)) {
      const file = Bun.file(`public${path}`);
      if (await file.exists()) return new Response(file);
    }
    return new Response('Not found', { status: 404 }); },
  development: { hmr: true, console: true },
});
console.log(`Karaoke studio: ${server.url}`);
