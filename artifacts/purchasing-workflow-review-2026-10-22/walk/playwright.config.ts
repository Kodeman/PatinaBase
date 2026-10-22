import { defineConfig } from "@playwright/test";
// Server: ./start-server.sh (designer portal only, :3400, local Supabase). Seed: node seed.mjs (INSERT-only).
export default defineConfig({
  testDir: ".",
  testMatch: "capture.spec.ts",
  workers: 1,
  timeout: 900_000,
  use: { baseURL: "http://localhost:3400", viewport: { width: 1440, height: 900 } },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
