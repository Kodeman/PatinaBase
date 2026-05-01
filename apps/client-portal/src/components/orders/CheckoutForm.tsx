'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';

interface CheckoutFormProps {
  orderId: string;
  amountCents: number;
  currency: string;
}

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise() {
  if (!PUBLISHABLE_KEY) return null;
  if (!stripePromise) stripePromise = loadStripe(PUBLISHABLE_KEY);
  return stripePromise;
}

export function CheckoutForm({ orderId, amountCents, currency }: CheckoutFormProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchIntent() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/orders/${orderId}/checkout/payment-intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, amount: amountCents, currency }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Payment intent failed (${res.status})`);
        }
        const data = (await res.json()) as { clientSecret?: string; client_secret?: string };
        const secret = data.clientSecret ?? data.client_secret;
        if (!secret) throw new Error('No client secret returned');
        if (!cancelled) setClientSecret(secret);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to set up payment');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchIntent();
    return () => {
      cancelled = true;
    };
  }, [orderId, amountCents, currency]);

  if (!PUBLISHABLE_KEY) {
    return (
      <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
        <p className="type-body-small text-[var(--text-muted)]">
          Stripe isn&rsquo;t configured for this environment. Set{' '}
          <code className="font-mono text-xs">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> to enable
          checkout.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
        <p className="type-body-small text-[var(--text-muted)]">Setting up secure checkout…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-patina-terracotta/30 bg-[rgba(199,123,110,0.04)] p-5">
        <p className="type-body-small text-patina-terracotta">{error}</p>
      </div>
    );
  }

  if (!clientSecret) return null;

  return (
    <Elements
      stripe={getStripePromise()}
      options={{
        clientSecret,
        appearance: { theme: 'stripe' },
      }}
    >
      <PaymentInner orderId={orderId} />
    </Elements>
  );
}

function PaymentInner({ orderId }: { orderId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returnUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/orders/${orderId}?payment=success`;
  }, [orderId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: submitError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    });

    if (submitError) {
      setError(submitError.message ?? 'Payment failed');
      setSubmitting(false);
    } else {
      router.push(`/orders/${orderId}?payment=success`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="stripe-checkout-form">
      <PaymentElement />
      {error && (
        <p className="text-sm text-patina-terracotta" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="rounded-[3px] bg-patina-charcoal px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        data-testid="stripe-checkout-submit"
      >
        {submitting ? 'Processing…' : 'Pay now'}
      </button>
    </form>
  );
}
