/// <reference types="node" />
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Dev server only: the listening pass (src/state/listeningStore.ts) reads and writes its
 * ratings here, so they land in the repo for the M3 sign-off.
 */
function listeningFile(): Plugin {
  return {
    name: 'motif-listening-file',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__listening', (req, res) => {
        void (async () => {
          try {
            // Mounted at /__listening, so req.url is "/?pass=<file>".
            const pass = new URL(req.url ?? '/', 'http://local').searchParams.get('pass') ?? '';
            if (!/^[a-z0-9-]+$/.test(pass)) throw new Error('bad pass name');
            const file = resolve(`docs/progress/listening/${pass}.json`);
            if (req.method === 'GET') {
              // No file yet: an empty object, so the page falls back without a console error.
              const body = await readFile(file, 'utf8').catch(() => '{}');
              res.setHeader('Content-Type', 'application/json');
              res.end(body);
              return;
            }
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end();
              return;
            }
            let body = '';
            for await (const chunk of req) body += String(chunk);
            const data: unknown = JSON.parse(body);
            if (typeof data !== 'object' || data === null || !('ratings' in data)) {
              throw new Error('not a listening pass file');
            }
            await mkdir(dirname(file), { recursive: true });
            await writeFile(file, JSON.stringify(data, null, 2) + '\n');
            res.statusCode = 204;
            res.end();
          } catch (error) {
            res.statusCode = 400;
            res.end(String(error));
          }
        })();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), listeningFile()],
  build: {
    rolldownOptions: {
      output: {
        // Libraries in their own files: each stays under Vite's 500 kB warning, downloads in
        // parallel and stays cached when only app code changes. All load at start (samples
        // start loading at once), so the total is the same.
        codeSplitting: {
          groups: [
            { name: 'tone', test: /node_modules[\\/]tone[\\/]/ },
            { name: 'smplr', test: /node_modules[\\/]smplr[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'vendor', test: /node_modules[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'packages/*/tests/**/*.test.ts'],
  },
});
