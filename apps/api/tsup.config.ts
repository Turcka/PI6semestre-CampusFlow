import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/jobs/worker.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // O pacote compartilhado é TypeScript puro (sem build); precisa ser embutido no bundle.
  noExternal: ['@campusflow/shared'],
});
