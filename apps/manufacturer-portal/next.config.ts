import type { NextConfig } from 'next';

/**
 * Patina Manufacturer Portal — scaffolded as part of Sprint 3 (S3.9).
 *
 * v1 is a placeholder workspace: routing structure, auth wiring, and a
 * single /onboarding stub the manufacturer email CTA can deep-link to
 * after S3.7 outreach. The full onboarding flow (manufacturer adds
 * products → layer='catalog' rows tagged with their nomination_id)
 * ships in a dedicated post-pilot session.
 *
 * Production URL: manufacturer.patina.cloud. The portal is packaged for
 * Cloudflare Workers through its checked-in Wrangler configuration.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@patina/supabase'],
};

export default nextConfig;
