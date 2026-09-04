import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Dev-only: POST /__snap?name=x with a data URL body writes docs/screenshots/x.png (used by the debug panel). */
function snapshotSink(): Plugin {
  return {
    name: 'snapshot-sink',
    configureServer(server) {
      server.middlewares.use('/__snap', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        const name = (new URL(req.url ?? '/', 'http://x').searchParams.get('name') ?? 'shot').replace(/[^a-z0-9_-]/gi, '_');
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          const b64 = body.replace(/^data:image\/\w+;base64,/, '');
          const dir = join(process.cwd(), 'docs', 'screenshots');
          mkdirSync(dir, { recursive: true });
          const file = join(dir, `${name}.png`);
          writeFileSync(file, Buffer.from(b64, 'base64'));
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: true, file }));
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [snapshotSink()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { fs: { strict: true } },
  optimizeDeps: { exclude: ['@babylonjs/havok'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  assetsInclude: ['**/*.glb', '**/*.gltf', '**/*.hdr', '**/*.env'],
});
