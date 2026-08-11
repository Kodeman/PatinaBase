/** @jest-environment node */

type HeaderEntry = {
  key: string;
  value: string;
};

type HeaderRule = {
  headers: HeaderEntry[];
};

const nextConfig = jest.requireActual('../../../next.config.js') as {
  headers: () => Promise<HeaderRule[]>;
};

describe('designer portal development CSP', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  });

  it('allows Auth and Realtime calls to the configured Supabase project', async () => {
    process.env.NODE_ENV = 'development';
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      'https://configured-project.supabase.co';

    const rules = await nextConfig.headers();
    const csp = rules[0]?.headers.find(
      (header) => header.key === 'Content-Security-Policy',
    )?.value;

    const connectSrc = csp
      ?.split('; ')
      .find((directive) => directive.startsWith('connect-src '));

    expect(connectSrc).toContain('https://configured-project.supabase.co');
    expect(connectSrc).toContain('wss://configured-project.supabase.co');
  });
});
