/** @jest-environment node */
import { NextRequest } from 'next/server';
import { corsHeaders, handleCors } from '../cors';

describe('QR auth CORS', () => {
  it.each([
    'https://app.patina.cloud',
    'https://admin.patina.cloud',
    'https://client.patina.cloud',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
  ])('allows the deployed/local portal origin %s', (origin) => {
    const request = new NextRequest('http://localhost:3000/api/auth/qr/status', { headers: { origin } });
    expect(corsHeaders(request)['Access-Control-Allow-Origin']).toBe(origin);
  });

  it('does not reflect an untrusted origin and preserves preflight semantics', () => {
    const request = new NextRequest('http://localhost:3000/api/auth/qr/status', {
      headers: { origin: 'https://untrusted.example' },
    });
    expect(corsHeaders(request)).toEqual({});
    expect(handleCors(request).status).toBe(204);
  });
});
