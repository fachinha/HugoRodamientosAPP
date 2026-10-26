/// <reference types="vite/client" />

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ASSETS?: Fetcher;
    APP_ENV: string;
    SESSION_TTL_HOURS: string;
    SETUP_TOKEN?: string;
    TEST_MIGRATIONS?: any[];
  }
}

declare module 'read-excel-file/browser' {
  export default function readXlsxFile(
    file: Blob | File | ArrayBuffer,
    options?: any,
  ): Promise<any[][]>;
}
