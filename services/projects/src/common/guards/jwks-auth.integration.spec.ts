import { Controller, Get, Req } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { HybridAuthGuard } from '@patina/auth';
import { generateKeyPairSync } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sign } from 'jsonwebtoken';
import request from 'supertest';

@Controller()
class AuthProbeController {
  @Get('/auth-probe')
  probe(@Req() req: { user: Record<string, unknown> }) {
    return req.user;
  }
}

describe('retained service JWKS authentication', () => {
  const issuer = 'https://bkvcixdmuyejfzcijpdg.supabase.co/auth/v1';
  const originalEnv = { ...process.env };
  let jwksServer: Server;

  afterEach(async () => {
    process.env = { ...originalEnv };
    if (jwksServer?.listening) {
      await new Promise<void>((resolve, reject) => {
        jwksServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('accepts a valid ES256 Supabase request without a legacy HMAC secret', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const publicJwk = publicKey.export({ format: 'jwk' });
    const kid = 'projects-request-key';
    jwksServer = createServer((_req, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ keys: [{ ...publicJwk, alg: 'ES256', kid, use: 'sig' }] }));
    });
    await new Promise<void>((resolve, reject) => {
      jwksServer.once('error', reject);
      jwksServer.listen(0, '127.0.0.1', resolve);
    });
    const address = jwksServer.address() as AddressInfo;

    delete process.env.JWT_SECRET;
    delete process.env.SUPABASE_JWT_SECRET;
    process.env.SUPABASE_JWT_ISSUER = issuer;
    process.env.SUPABASE_JWT_AUDIENCE = 'authenticated';
    process.env.SUPABASE_JWKS_URL = `http://127.0.0.1:${address.port}/jwks.json`;

    const token = sign(
      { role: 'authenticated', app_metadata: { roles: ['designer'] } },
      privateKey,
      {
        algorithm: 'ES256',
        audience: 'authenticated',
        expiresIn: '1h',
        issuer,
        keyid: kid,
        subject: 'designer-1',
      },
    );
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthProbeController],
      providers: [{ provide: APP_GUARD, useClass: HybridAuthGuard }],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .get('/auth-probe')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: 'designer-1',
          sub: 'designer-1',
          userId: 'designer-1',
          role: 'authenticated',
          roles: ['designer'],
        });
      });

    await app.close();
  });
});
