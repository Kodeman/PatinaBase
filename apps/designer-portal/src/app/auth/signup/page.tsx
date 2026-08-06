'use client';

import { useState, Suspense, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { buildAuthCallbackUrl, createBrowserClient, normalizeAuthError, safeAuthReturnPath } from '@patina/supabase';
import { PortalAuthNotice, type AuthFormField } from '@patina/design-system';
import Link from 'next/link';
import { authEvents } from '@/lib/analytics/events';
import { DESIGNER_AUTH_DESTINATION, DesignerAuthShell } from '../auth-shell';

/**
 * The fields are set here rather than through the legacy `AuthForm`: that
 * component owns its own header logo, tinted alert cards, icon-led inputs and
 * shadcn button, none of which can be reached from the outside. The handlers,
 * the field list and every string are unchanged — only the vocabulary moved to
 * the warm paper family the rest of portal auth speaks.
 */
const SEAM =
  "relative after:pointer-events-none after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-[38%] after:bg-[var(--portal-auth-accent)] after:transition-[width] after:duration-[320ms] after:ease-[cubic-bezier(0.25,1,0.5,1)] after:content-[''] focus-within:after:w-full motion-reduce:after:transition-none";
const LABEL =
  'block text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.15em] text-[#65594E]';
const INPUT =
  'h-12 w-full border bg-white px-3 text-base text-[#2C2926] outline-none transition-colors placeholder:text-[#7A6A5B] focus:border-[#5C4A3C] focus:ring-2 focus:ring-[#5C4A3C] disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none';
const CTA =
  'h-12 w-full bg-[#1A1816] px-4 text-sm font-semibold text-[#FAF7F2] transition-colors hover:bg-[#2C2926] focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none';
const INLINE_LINK =
  'font-semibold text-[#2C2926] underline decoration-[#8B7355] underline-offset-4 transition-colors hover:decoration-[#2C2926] focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2 motion-reduce:transition-none';
const GILDED_RULE =
  'h-px bg-[linear-gradient(90deg,rgba(196,162,101,0.8)_0%,rgba(139,115,85,0.3)_52%,rgba(139,115,85,0)_100%)]';

const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function SignUpContent() {
  const searchParams = useSearchParams();
  const callbackUrl = safeAuthReturnPath(searchParams.get('callbackUrl'), DESIGNER_AUTH_DESTINATION);

  const supabase = createBrowserClient();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const fields: AuthFormField[] = [
    {
      name: 'name',
      label: 'Full Name',
      type: 'text',
      placeholder: 'John Doe',
      required: true,
      autoComplete: 'name',
    },
    {
      name: 'company',
      label: 'Company/Studio Name',
      type: 'text',
      placeholder: 'Your Design Studio',
      required: true,
      autoComplete: 'organization',
    },
    {
      name: 'email',
      label: 'Email Address',
      type: 'email',
      placeholder: 'you@example.com',
      required: true,
      autoComplete: 'email',
    },
    {
      name: 'phone',
      label: 'Phone Number',
      type: 'tel',
      placeholder: '+1 (555) 000-0000',
      required: false,
      autoComplete: 'tel',
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      placeholder: 'Create a strong password',
      required: true,
      autoComplete: 'new-password',
    },
    {
      name: 'confirmPassword',
      label: 'Confirm Password',
      type: 'password',
      placeholder: 'Confirm your password',
      required: true,
      autoComplete: 'new-password',
    },
  ];

  const handleInputChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear field error when user types
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  // Same rules the legacy AuthForm applied before it handed the data over.
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    fields.forEach((field) => {
      const value = formData[field.name] || '';

      if (field.required && !value.trim()) {
        errors[field.name] = `${field.label} is required`;
      } else if (field.pattern && value && !new RegExp(field.pattern).test(value)) {
        errors[field.name] = `Invalid ${field.label.toLowerCase()}`;
      } else if (field.type === 'email' && value && !isValidEmail(value)) {
        errors[field.name] = 'Invalid email address';
      }
    });

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (data: Record<string, string>) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Validate password match
      if (data.password !== data.confirmPassword) {
        setError('Passwords do not match');
        setIsLoading(false);
        return;
      }

      // Validate password strength
      if (data.password.length < 8) {
        setError('Password must be at least 8 characters long');
        setIsLoading(false);
        return;
      }

      const { error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: buildAuthCallbackUrl(window.location.origin, callbackUrl),
          data: {
            name: data.name,
            company: data.company,
            phone: data.phone,
          },
        },
      });

      if (authError) {
        throw new Error(authError.message || 'Registration failed');
      }

      authEvents.signup('credentials');

      setSuccess('Account created successfully! Please check your email to verify your account.');

      // Redirect to sign in page after 2 seconds
      setTimeout(() => {
        const params = new URLSearchParams({
          registered: 'true',
          callbackUrl,
        });
        window.location.replace(`/auth/signin?${params.toString()}`);
      }, 2000);
    } catch (err) {
      setError(normalizeAuthError(err, 'unknown').message);
    } finally {
      setIsLoading(false);
    }
  };

  const onFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateForm()) return;
    await handleSubmit(formData);
  };

  return (
    <DesignerAuthShell>
      <div className="space-y-5">
        <div>
          <h2 className="font-heading text-3xl leading-[1.1] tracking-[-0.03em] text-[#2C2926]">
            Create Designer Account
          </h2>
          <div aria-hidden="true" className={`mt-3.5 ${GILDED_RULE}`} />
          <p className="mt-3 text-sm leading-6 text-[#65594E]">
            Join Patina to start creating beautiful spaces
          </p>
        </div>

        {error && <PortalAuthNotice tone="error">{error}</PortalAuthNotice>}
        {success && <PortalAuthNotice tone="success">{success}</PortalAuthNotice>}

        <form className="space-y-5" onSubmit={onFormSubmit}>
          {fields.map((field) => {
            const fieldError = fieldErrors[field.name] || field.error;
            return (
              <div key={field.name} className="space-y-2">
                <label htmlFor={field.name} className={LABEL}>
                  {field.label}
                </label>
                <div className={SEAM}>
                  <input
                    id={field.name}
                    name={field.name}
                    type={field.type}
                    placeholder={field.placeholder}
                    required={field.required}
                    autoComplete={field.autoComplete}
                    value={formData[field.name] || ''}
                    onChange={(event) => handleInputChange(field.name, event.target.value)}
                    disabled={isLoading}
                    aria-invalid={Boolean(fieldError) || undefined}
                    aria-describedby={fieldError ? `${field.name}-error` : undefined}
                    className={`${INPUT} ${fieldError ? 'border-[#9C3D31]' : 'border-[#8B7355]'}`}
                  />
                </div>
                {fieldError && (
                  <p id={`${field.name}-error`} className="text-[13px] leading-5 text-[#65594E]">
                    {fieldError}
                  </p>
                )}
              </div>
            );
          })}

          <button type="submit" className={CTA} disabled={isLoading} aria-busy={isLoading || undefined}>
            {isLoading ? 'Loading...' : 'Create Account'}
          </button>
        </form>

        <div className="space-y-3 border-t border-[#8B7355] pt-4">
          <p className="text-xs leading-5 text-[#65594E]">
            By creating an account, you agree to our{' '}
            <Link href="/terms" className={INLINE_LINK}>
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className={INLINE_LINK}>
              Privacy Policy
            </Link>
          </p>
          <p className="text-sm leading-6 text-[#65594E]">
            Already have an account?{' '}
            <Link href={`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`} className={INLINE_LINK}>
              Sign in
            </Link>
          </p>
        </div>

        {/* Development Mode Notice */}
        {process.env.NODE_ENV === 'development' && (
          <p className="border-t-2 border-t-[#8B7355] pt-4 text-xs leading-5 text-[#65594E]">
            <strong className="font-semibold text-[#2C2926]">Development Mode:</strong> Account will be created automatically
          </p>
        )}
      </div>
    </DesignerAuthShell>
  );
}

function SignUpLoadingFallback() {
  return (
    <DesignerAuthShell>
      <div className="space-y-5">
        <div>
          <h2 className="font-heading text-3xl leading-[1.1] tracking-[-0.03em] text-[#2C2926]">
            Create Designer Account
          </h2>
          <div aria-hidden="true" className={`mt-3.5 ${GILDED_RULE}`} />
          <p className="mt-3 text-sm leading-6 text-[#65594E]">Loading...</p>
        </div>
      </div>
    </DesignerAuthShell>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<SignUpLoadingFallback />}>
      <SignUpContent />
    </Suspense>
  );
}
