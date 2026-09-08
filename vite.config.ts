import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  appType: 'mpa',
  plugins: [
    tailwindcss(),
    svelte(),
    {
      name: 'renderer-test-page',
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          if (request.url?.split('?')[0] === '/render') {
            request.url = request.url.replace('/render', '/tests/render.html');
          }
          next();
        });
      },
    },
  ],
  server: { host: '127.0.0.1', port: Number(process.env.PORT || 3000), strictPort: true },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: ['index.html', 'guide/index.html'],
    },
  },
});
