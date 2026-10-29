import { defineConfig } from 'vitest/config';

// One run for all workspaces. Each workspace keeps its own config (apps/web: vite.config.ts).
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
  },
});
