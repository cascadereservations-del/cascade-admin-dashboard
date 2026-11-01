/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// The legacy single-file admin lives at the repository root (index.html).
// The new application lives under app/ and builds to dist/ so both can be
// deployed side by side during rollout (PRD section 11, rollout step 1).
export default defineConfig({
  root: 'app',
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./app/src', import.meta.url)) } },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    host: '127.0.0.1', port: 5178, strictPort: true,
    fs: {
      strict: true,
      allow: [fileURLToPath(new URL('./', import.meta.url))],
      deny: ['**/.env', '**/.env.*', '**/*.{crt,pem}', '**/.git/**', '**/*.local.json', '**/*.local.jsonl', '**/*.private.*', '**/guest-details.md', '**/private/**', '**/Airbnb Client Details/**'],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    pool: 'vmThreads',
    vmMemoryLimit: '300MB',
    projects: [
      // vmThreads: jsdom is created once per worker. embed-shell redefines window.top, which vm contexts forbid, so it stays on forks.
      { extends: true, test: { name: 'vm', include: ['src/**/*.test.{ts,tsx}'], exclude: ['**/node_modules/**', 'src/components/shell/embed-shell.test.tsx'] } },
      { extends: true, test: { name: 'forks', pool: 'forks', include: ['src/components/shell/embed-shell.test.tsx'] } },
    ],
    testTimeout: 20000, // Radix-driven tests exceed 5s when several lanes load the machine
  },
});
