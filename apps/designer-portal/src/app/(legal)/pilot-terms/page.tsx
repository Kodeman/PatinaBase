import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Pilot Terms — Patina' };

export default function PilotTermsPage() {
  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-semibold text-[var(--color-charcoal)]">
          Pilot Terms
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Effective September 23, 2026
        </p>
      </header>

      <Section heading="What this covers">
        <p>
          A studio comes into Patina by introduction. These terms are for that
          pilot — the first ninety days, on the house you choose to run through
          Patina. Patina&rsquo;s{' '}
          <a
            href="/terms"
            className="underline decoration-[var(--border-default)] hover:text-[var(--color-charcoal)]"
          >
            Terms of Service
          </a>{' '}
          still apply to the service itself; where the two speak to the same
          thing during the pilot, this page does.
        </p>
      </Section>

      <Section heading="What it costs">
        <p>
          Nothing, for ninety days from the day you accept. No card, no invoice
          from us, no charge at the end of it. If the pilot ends and you want to
          keep going, that&rsquo;s a conversation we have with you, in writing,
          before anything changes.
        </p>
      </Section>

      <Section heading="What assistance means">
        <p>
          When a bill is due, you can ask for a sit-down and Kody will take it
          with you — screen shared, your actual invoice, however long it takes
          to get it out the door. On request, each time. There is no queue and
          no ticket number; you say when.
        </p>
      </Section>

      <Section heading="What you get access to">
        <p>During the pilot you have the whole of what Patina is today:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>the designer portal at app.patina.cloud, for your studio</li>
          <li>the Patina Field app, for the work that happens on site</li>
          <li>the client page, for the homeowners on the houses you run here</li>
        </ul>
      </Section>

      <Section heading="Taking your work back out">
        <p>
          Your invoices, your payments, and your clients come back to you as a
          spreadsheet whenever you ask — during the pilot, at the end of it, or
          after. Email us and we send it. Nothing is held back, and you
          don&rsquo;t have to be a customer to ask.
        </p>
      </Section>

      <Section heading="Stopping">
        <p>
          You can stop at any time. Tell us in writing, or simply stop using it
          — both end the pilot, and neither owes us an explanation. For thirty
          days after you stop, your work stays exportable: ask and you get the
          same spreadsheet.
        </p>
      </Section>

      <Section heading="Support">
        <p>
          One address, for anything at all —{' '}
          <a
            href="mailto:hello@patina.cloud"
            className="underline decoration-[var(--border-default)] hover:text-[var(--color-charcoal)]"
          >
            hello@patina.cloud
          </a>
          .
        </p>
      </Section>

      <Section heading="Your data">
        <p>
          What happens to your data is written out in full on our{' '}
          <a
            href="/privacy"
            className="underline decoration-[var(--border-default)] hover:text-[var(--color-charcoal)]"
          >
            Privacy Policy
          </a>
          , and the pilot doesn&rsquo;t change any of it. In short: your
          projects, products, images and notes stay yours; we share them only
          with the providers that run Patina. One of those is Anthropic — when
          you ask Patina to read a document or draft something for you, we send
          that content to Anthropic&rsquo;s Claude API as a processor to produce
          the result, and it is not used to train Anthropic&rsquo;s models. We
          do not sell your data.
        </p>
      </Section>

      <Section heading="Governing law">
        {/* JURISDICTION: /terms says Minnesota; VISION §1 says Madison, WI — Kody to rule (PROGRAM.md §7) */}
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
