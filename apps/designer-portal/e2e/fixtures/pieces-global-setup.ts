import type { FullConfig } from '@playwright/test';
import { warmAuthenticatedRoutes } from '../helpers/warm-authenticated-routes';

export default async function globalSetup(config: FullConfig): Promise<void> {
  // Compile before a signed-in browser can receive a full reload from next-dev.
  await warmAuthenticatedRoutes(config, ['/desk', '/doc/e6590000-0000-4000-8000-000000000001/pieces']);
}
