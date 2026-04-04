import Link from 'next/link';
import { StrataMark } from '@/components/portal/strata-mark';

export default function LandingPage() {
  return (
    <div
      className="relative min-h-screen flex flex-col justify-end"
      style={{ padding: 'clamp(2rem, 6vw, 6rem) clamp(1.5rem, 5vw, 4rem)' }}
    >
      {/* Pearl gradient wash — right edge */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-[40%]"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, var(--color-pearl) 50%, transparent 100%)',
          opacity: 0.4,
        }}
      />

      {/* Content */}
      <div className="relative">
        {/* Meta label */}
        <div className="type-meta mb-12 animate-section-enter">
          Patina &mdash; Designer Portal
        </div>

        {/* Heading */}
        <h1
          className="font-heading font-normal mb-6 animate-text-reveal"
          style={{
            fontSize: 'clamp(3rem, 7vw, 5.5rem)',
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
          }}
        >
          The Designer Portal
          <span
            className="block font-heading italic font-normal"
            style={{
              fontSize: '0.65em',
              letterSpacing: '0',
              color: 'var(--color-aged-oak)',
            }}
          >
            Where craft meets commerce
          </span>
        </h1>

        {/* Subtitle */}
        <p
          className="type-body max-w-[540px] mb-16 animate-section-enter"
          style={{ animationDelay: '200ms', fontSize: '1.15rem' }}
        >
          A professional design hub where information hierarchy replaces
          containers, type does the speaking, and the interface gets out of
          the way of the work.
        </p>

        {/* Strata divider */}
        <StrataMark variant="full" />

        {/* Footer metadata */}
        <div
          className="flex flex-wrap gap-16 animate-section-enter"
          style={{ animationDelay: '400ms' }}
        >
          <div>
            <p className="type-meta mb-1">Enter</p>
            <Link
              href="/portal"
              className="type-body-small text-patina-charcoal hover:text-patina-clay transition-colors"
            >
              Designer Portal
            </Link>
          </div>
          <div>
            <p className="type-meta mb-1">Account</p>
            <Link
              href="/auth/signin"
              className="type-body-small text-patina-charcoal hover:text-patina-clay transition-colors"
            >
              Sign In
            </Link>
          </div>
          <div>
            <p className="type-meta mb-1">New Here?</p>
            <Link
              href="/auth/signup"
              className="type-body-small text-patina-charcoal hover:text-patina-clay transition-colors"
            >
              Create Account
            </Link>
          </div>
          <div>
            <p className="type-meta mb-1">Platform</p>
            <p className="type-body-small text-patina-charcoal">
              Patina v1.0 &mdash; March 2026
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
