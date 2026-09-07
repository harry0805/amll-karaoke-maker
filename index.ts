import home from './src/index.html';
import rendererTest from './tests/render.html';

// Development only. The built dist/ folder can be served by any static host.
const server = Bun.serve({
  hostname: '127.0.0.1', port: Number(process.env.PORT || 3000),
  routes: { '/': home, '/render': rendererTest },
  fetch() { return new Response('Not found', { status: 404 }); },
  development: { hmr: true, console: true },
});
console.log(`Karaoke studio: ${server.url}`);
