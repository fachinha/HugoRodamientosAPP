import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrationsPath = path.join(import.meta.dirname, 'migrations');
  const migrations = await readD1Migrations(migrationsPath);

  return {
    plugins: [
      cloudflareTest({
        wrangler: {
          configPath: './wrangler.jsonc',
        },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            SETUP_TOKEN: 'cambiar-por-un-valor-aleatorio-largo',
          },
        },
      }),
    ],
    resolve: {
      alias: {
        '@shared': path.resolve(import.meta.dirname, './src/shared'),
        '@worker': path.resolve(import.meta.dirname, './src/worker'),
        '@web': path.resolve(import.meta.dirname, './src/web'),
      },
    },
    test: {
      globals: true,
      setupFiles: ['./tests/setup.ts'],
    },
  };
});
