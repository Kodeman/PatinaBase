import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center bg-[var(--bg-primary)] px-6 py-12">
      <section className="max-w-lg text-center">
        <p className="font-heading text-2xl text-[var(--text-primary)]">This page isn’t on the Desk.</p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">The address may have changed.</p>
        <Link
          className="mt-5 inline-flex min-h-[44px] items-center px-4 text-sm text-[var(--text-primary)] underline underline-offset-4"
          href="/desk"
        >
          Back to the Desk
        </Link>
      </section>
    </main>
  );
}
