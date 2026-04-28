import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Stub packages that are not installed in the sparse worktree node_modules
      'winston': path.resolve(__dirname, './__mocks__/winston.js'),
    },
  },
  test: {
    environment: 'node',
    // storage.local-encryption.test.ts uses process.chdir() which is not
    // permitted in worker_threads (the default 'threads' pool). Forks pool
    // uses child processes and supports chdir.
    poolMatchGlobs: [
      ['**/storage.local-encryption.test.ts', 'forks'],
    ],
  },
};
