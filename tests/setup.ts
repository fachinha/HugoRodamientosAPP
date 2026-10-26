import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

const cfEnv = env as any;
if (cfEnv?.DB && cfEnv?.TEST_MIGRATIONS) {
  await applyD1Migrations(cfEnv.DB, cfEnv.TEST_MIGRATIONS);
}
