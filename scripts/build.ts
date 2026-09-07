import { cp, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
const result = await Bun.build({ entrypoints: ['./src/index.html'], outdir: 'dist', target: 'browser', minify: true });
if (!result.success) throw new AggregateError(result.logs, 'Build failed');
await cp('public', 'dist', { recursive: true });
console.log('Built application and static assets in dist/');
