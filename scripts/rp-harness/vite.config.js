// Dev server for the RotationPal layout harness:
//   npx vite --config scripts/rp-harness/vite.config.js
// Serves this folder on :5174 and swaps the app's Supabase client for a stub.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^(\.\.\/)+supabase(\.js)?$/, replacement: `${here}supabase-mock.js` },
    ],
  },
  server: { port: 5174, strictPort: true, fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
});
