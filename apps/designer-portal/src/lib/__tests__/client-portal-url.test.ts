import {
  DEFAULT_CLIENT_PORTAL_ORIGIN,
  guestProposalShareUrl,
  resolveClientPortalOrigin,
} from '../client-portal-url';

const TOKEN = '0123456789abcdef'.repeat(4);
const ORIGINAL_CLIENT_PORTAL_URL = process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL;

afterEach(() => {
  if (ORIGINAL_CLIENT_PORTAL_URL === undefined) {
    delete process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL;
  } else {
    process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL = ORIGINAL_CLIENT_PORTAL_URL;
  }
});

describe('client portal guest URLs', () => {
  it('sends a production designer share to the client portal', () => {
    delete process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL;

    expect(guestProposalShareUrl(TOKEN, 'https://app.patina.cloud')).toBe(
      `https://client.patina.cloud/share/${TOKEN}`,
    );
  });

  it('maps the local designer portal to the local client portal', () => {
    delete process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL;

    expect(guestProposalShareUrl(TOKEN, 'http://localhost:3000')).toBe(
      `http://localhost:3002/share/${TOKEN}`,
    );
  });

  it('uses the configured client portal origin for non-standard environments', () => {
    process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL =
      'https://client.preview.patina.cloud/surplus/path';

    expect(
      resolveClientPortalOrigin('https://designer.preview.patina.cloud'),
    ).toBe('https://client.preview.patina.cloud');
  });

  it('falls back safely when neither the config nor current origin is usable', () => {
    process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL = 'not a URL';

    expect(resolveClientPortalOrigin('not a URL')).toBe(
      DEFAULT_CLIENT_PORTAL_ORIGIN,
    );
  });
});
