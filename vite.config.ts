import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import path from 'node:path';

export default defineConfig({
  plugins: [
    cloudflare({ configPath: './wrangler.jsonc' }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, './src/shared'),
      '@worker': path.resolve(import.meta.dirname, './src/worker'),
      '@web': path.resolve(import.meta.dirname, './src/web'),
    },
  },
  server: {
    port: 5174,
  },
});
