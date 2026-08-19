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
  const originalEdgeApiUrl = process.env.NEXT_PUBLIC_EDGE_API_URL;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    process.env.NEXT_PUBLIC_EDGE_API_URL = originalEdgeApiUrl;
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

  it.each(['development', 'production'])(
    'allows the SPLAT renderer to fetch its inlined WASM in %s',
    async (env) => {
      // @sparkjsdev/spark ships its Rust splat decoder as a
      // `data:application/wasm;base64,…` URI and fetch()es it at init. A fetch of
      // a data: URL is still governed by connect-src, so without `data:` the whole
      // Spark module dies at SplatMesh.staticInitialize() with a bare "Failed to
      // fetch" and the Splat stage hangs on its loading line — which is exactly
      // how this was found, in a browser, after the unit tests were green.
      process.env.NODE_ENV = env;

      const rules = await nextConfig.headers();
      const csp = rules[0]?.headers.find(
        (header) => header.key === 'Content-Security-Policy',
      )?.value;

      const connectSrc = csp
        ?.split('; ')
        .find((directive) => directive.startsWith('connect-src '));

      expect(connectSrc).toMatch(/(^|\s)data:(\s|$)/);
    },
  );

  it.each(['development', 'production'])(
    'allows the scan read path to reach the configured edge API origin in %s',
    async (env) => {
      // The Rendered Room v2 read path (use-splat-url.ts) fetches
      // NEXT_PUBLIC_EDGE_API_URL directly from the browser — a *.workers.dev
      // host, not covered by the patina.cloud allowance. Without this the
      // fetch is silently CSP-blocked even though the env var is wired.
      process.env.NODE_ENV = env;
      process.env.NEXT_PUBLIC_EDGE_API_URL =
        'https://patina-edge-api-staging.kody-be3.workers.dev';

      const rules = await nextConfig.headers();
      const csp = rules[0]?.headers.find(
        (header) => header.key === 'Content-Security-Policy',
      )?.value;

      const connectSrc = csp
        ?.split('; ')
        .find((directive) => directive.startsWith('connect-src '));

      expect(connectSrc).toContain(
        'https://patina-edge-api-staging.kody-be3.workers.dev',
      );
    },
  );

  it('does not widen connect-src when NEXT_PUBLIC_EDGE_API_URL is unset', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.NEXT_PUBLIC_EDGE_API_URL;

    const rules = await nextConfig.headers();
    const csp = rules[0]?.headers.find(
      (header) => header.key === 'Content-Security-Policy',
    )?.value;

    const connectSrc = csp
      ?.split('; ')
      .find((directive) => directive.startsWith('connect-src '));

    expect(connectSrc).not.toContain('workers.dev');
  });
});
