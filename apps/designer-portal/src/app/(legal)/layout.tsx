import Link from 'next/link';

/**
 * The (legal) route group: static, public-not-landing pages (/privacy,
 * /terms — see middleware's isPublicPage). No auth shell, no TopBar, no
 * document chrome — a bare reading page a signed-out visitor (or the Chrome
 * Web Store reviewer) can land on directly. Auth/role gating happens in
 * middleware, not here.
 */
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)] px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-[65ch]">
        <Link
          href="/"
          className="font-heading text-sm font-semibold tracking-[0.15em] text-[var(--color-charcoal)] no-underline"
        >
          PATINA
        </Link>
        <div className="mt-10 text-[var(--text-body)]">{children}</div>
      </div>
    </main>
  );
}
