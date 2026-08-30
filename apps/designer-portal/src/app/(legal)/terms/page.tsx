import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms of Service — Patina' };

export default function TermsPage() {
  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-semibold text-[var(--color-charcoal)]">
          Terms of Service
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Effective August 29, 2026
        </p>
      </header>

      <Section heading="The service">
        <p>
          Patina connects interior designers with the manufacturers who build
          their furniture. The Designer Portal at{' '}
          <span className="font-medium text-[var(--color-charcoal)]">
            app.patina.cloud
          </span>
          , and the Patina Chrome extension that captures products into it, are
          both covered by these terms.
        </p>
      </Section>

      <Section heading="Your account">
        <p>
          You need an account to use Patina. You&rsquo;re responsible for what
          happens under it — keep your credentials to yourself, and tell us if
          you think someone else has access.
        </p>
      </Section>

      <Section heading="Acceptable use">
        <p>
          Use Patina for what it&rsquo;s built for: running your design work.
          Don&rsquo;t misuse the service — don&rsquo;t try to break it, scrape
          it beyond normal use, or use it to violate someone else&rsquo;s
          rights.
        </p>
      </Section>

      <Section heading="Your content">
        <p>
          The projects, products, images, and notes you put into Patina are
          yours. Putting them into Patina gives us the license we need to store,
          display, and operate on that content in order to run the service for
          you — nothing more.
        </p>
      </Section>

      <Section heading="Payments">
        <p>
          Where Patina involves a payment — a deposit, an invoice, an order —
          it&rsquo;s processed through Stripe. Stripe&rsquo;s own terms apply to
          how it handles your payment information.
        </p>
      </Section>

      <Section heading="Disclaimers and limitation of liability">
        <p>
          Patina is provided as-is. We work to keep it reliable, but we
          don&rsquo;t promise it will be uninterrupted or error-free. To the
          extent the law allows, Patina isn&rsquo;t liable for indirect or
          consequential damages arising from your use of the service.
        </p>
      </Section>

      <Section heading="Termination">
        <p>
          You can close your account at any time from account settings, or by
          emailing us. We can suspend or close an account that violates these
          terms.
        </p>
      </Section>

      <Section heading="Governing law">
        <p>These terms are governed by the laws of the State of Minnesota.</p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions about these terms go to{' '}
          <a
            href="mailto:hello@patina.cloud"
            className="underline decoration-[var(--border-default)] hover:text-[var(--color-charcoal)]"
          >
            hello@patina.cloud
          </a>
          .
        </p>
      </Section>
    </article>
  );
}

function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-xl font-semibold text-[var(--color-charcoal)]">
        {heading}
      </h2>
      <div className="space-y-3 text-[15px] leading-7 text-[var(--text-body)]">
        {children}
      </div>
    </section>
  );
}
