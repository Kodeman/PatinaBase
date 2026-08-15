import { Test } from '@nestjs/testing';
import { HybridAuthGuard, PermissionsGuard } from '@patina/auth';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('AppModule auth startup', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses the Supabase JWKS guards without requiring a legacy HMAC secret', async () => {
    delete process.env.JWT_SECRET;
    delete process.env.SUPABASE_JWT_SECRET;
    process.env.SUPABASE_URL = 'https://bkvcixdmuyejfzcijpdg.supabase.co';

    const appModuleSource = readFileSync(join(__dirname, 'app.module.ts'), 'utf8');
    expect(appModuleSource).not.toMatch(/AuthModule|common\/auth\/auth\.module/);

    const moduleRef = await Test.createTestingModule({
      providers: [HybridAuthGuard, PermissionsGuard],
    }).compile();
    expect(moduleRef.get(HybridAuthGuard)).toBeInstanceOf(HybridAuthGuard);
    expect(moduleRef.get(PermissionsGuard)).toBeInstanceOf(PermissionsGuard);
    await moduleRef.close();
  });
});
