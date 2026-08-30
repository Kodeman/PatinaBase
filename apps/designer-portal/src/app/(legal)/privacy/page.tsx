import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy Policy — Patina' };

export default function PrivacyPage() {
  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-semibold text-[var(--color-charcoal)]">
          Privacy Policy
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Effective August 29, 2026
        </p>
      </header>

      <Section heading="Who we are">
        <p>
          Patina connects interior designers with the manufacturers who build
          their furniture. This policy covers the Patina Designer Portal at{' '}
          <span className="font-medium text-[var(--color-charcoal)]">
            app.patina.cloud
          </span>{' '}
          and the Patina Chrome extension. If you have questions, write to{' '}
          <a
            href="mailto:hello@patina.cloud"
            className="underline decoration-[var(--border-default)] hover:text-[var(--color-charcoal)]"
          >
            hello@patina.cloud
          </a>
          .
        </p>
      </Section>

      <Section heading="What we collect">
        <p>We collect three kinds of information:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium text-[var(--color-charcoal)]">
              Account information
            </span>{' '}
            — your email, name, and studio, when you create a Patina account.
          </li>
          <li>
            <span className="font-medium text-[var(--color-charcoal)]">
              Content you add
            </span>{' '}
            — projects, the products you capture, images, notes, and client
            details you put into your workspace.
          </li>
          <li>
            <span className="font-medium text-[var(--color-charcoal)]">
              Usage information
            </span>{' '}
            — product analytics through PostHog, hosted in the US. The Chrome
            extension does not do session recording.
          </li>
        </ul>
        <p>
          On app.patina.cloud, and on the client and admin portals, PostHog may
          record how you use the screen — page views, clicks, and a replay of
          your session — so we can see where the product is confusing or broken.
          The Chrome extension does not record sessions.
        </p>
      </Section>

      <Section heading="The Chrome extension">
        <p>
          The extension reads the product page you&rsquo;re on only when you
          choose to capture it — from the toolbar, with ⌘⇧S, or from the
          right-click menu. When you do, it sends the product&rsquo;s name,
          price, images, description, and URL to your Patina workspace.
        </p>
        <p>
          It also reads your app.patina.cloud sign-in cookie, so you don&rsquo;t
          have to sign in a second time, and stores your session in the
          extension&rsquo;s local storage. It sends usage events tagged with
          your user ID and the extension version.
        </p>
        <p>
          It does not read pages you don&rsquo;t capture, and it does not track
          your browsing history.
        </p>
      </Section>

      <Section heading="Where your data lives">
        <p>
          Your data is stored with Supabase and served through Cloudflare, both
          in the United States.
        </p>
      </Section>

      <Section heading="Sharing">
        <p>
          We share data only with the service providers that run Patina, and
          only as needed:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Supabase and Cloudflare — hosting, database, storage</li>
          <li>PostHog — product analytics</li>
          <li>Resend — email delivery</li>
          <li>Stripe — payments</li>
          <li>
            Anthropic — when you ask us to process content (an uploaded FF&amp;E
            document for extraction, a companion message, a design-profile
            draft), we send it to Anthropic&rsquo;s Claude API to generate the
            result. It is not used to train Anthropic&rsquo;s models.
          </li>
          <li>
            Twilio — SMS to phone numbers you give us for field coordination,
            including the number and the message text.
          </li>
        </ul>
        <p>We do not sell your data.</p>
      </Section>

      <Section heading="Retention and deletion">
        <p>
          To delete your account, email{' '}
          <a
            href="mailto:hello@patina.cloud"
            className="underline decoration-[var(--border-default)] hover:text-[var(--color-charcoal)]"
          >
            hello@patina.cloud
          </a>
          . Deletion completes after a 30-day grace period, during which you can
          cancel the request. Once it completes, your captured products and
          project content are removed with the account.
        </p>
      </Section>

      <Section heading="Your choices">
        <p>
          You control what you capture and what you put into a project. You can
          review, edit, or remove your content from your workspace at any time,
          and you can ask us to export or delete your account data.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions about this policy or your data go to{' '}
          <a
            href="mailto:hello@patina.cloud"
            className="underline decoration-[var(--border-default)] hover:text-[var(--color-charcoal)]"
          >
            hello@patina.cloud
          </a>
          .
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          If we change this policy in a material way, we&rsquo;ll update the
          effective date above and let you know through the portal.
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
