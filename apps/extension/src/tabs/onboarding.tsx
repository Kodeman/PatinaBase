/**
 * Flow 0 — Install & onboarding (O1–O4). A standalone Plasmo tab opened on first
 * install: welcome → connect workspace → page-access primer → ready (pin +
 * shortcut). Standalone so it has room the 340px panel doesn't.
 */
import { useEffect, useMemo, useState } from 'react';
import { PORTAL_URL } from '../lib/supabase';
import '../style.css';

const STEPS = ['Welcome', 'Connect', 'Access', 'Ready'] as const;

function Mark() {
  return (
    <span
      className="inline-block h-4 w-4 rounded-sm"
      style={{
        background:
          'conic-gradient(from 210deg, var(--brass-2), var(--verdigris), var(--rust-2), var(--brass-2))',
      }}
    />
  );
}

function Shell({
  step,
  eyebrow,
  title,
  children,
  primary,
  onPrimary,
  onBack,
}: {
  step: number;
  eyebrow: string;
  title: React.ReactNode;
  children: React.ReactNode;
  primary: string;
  onPrimary: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="min-h-screen bg-paper font-body text-ink">
      <div className="mx-auto flex min-h-screen max-w-[560px] flex-col px-6 py-10">
        <div className="flex items-center gap-2 font-display text-[1.2rem]">
          <Mark /> Patina Capture
        </div>
        <div className="mt-1 flex gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-verdigris' : 'bg-line'}`}
            />
          ))}
        </div>

        <div className="flex flex-1 flex-col justify-center py-10">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-verdigris">
            {eyebrow}
          </p>
          <h1 className="mt-3 font-display text-[2.4rem] leading-tight">{title}</h1>
          <div className="mt-4 max-w-[46ch] text-[1rem] leading-relaxed text-ink-2">
            {children}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPrimary}
            className="rounded-md bg-verdigris px-5 py-2.5 font-mono text-[0.72rem] uppercase tracking-[0.08em] text-paper hover:bg-verdigris-ink"
          >
            {primary}
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-soft hover:text-ink"
            >
              Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Onboarding() {
  const [step, setStep] = useState(0);
  const [shortcut, setShortcut] = useState<string | null>(null);

  useEffect(() => {
    chrome.commands?.getAll?.((cmds) => {
      const c = cmds.find((x) => x.name === 'capture-product');
      setShortcut(c?.shortcut || null);
    });
  }, []);

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  if (step === 0) {
    return (
      <Shell step={0} eyebrow="Welcome" title={<>Capture, in<br />one keystroke.</>} primary="Get started" onPrimary={next}>
        Pull any furniture page into your Patina library — read, priced, and
        routed to the right project. Let's set it up; it takes a minute.
      </Shell>
    );
  }
  if (step === 1) {
    return (
      <Shell
        step={1}
        eyebrow="Connect workspace"
        title="Sign in to Patina"
        primary="Create a Patina account"
        onPrimary={() => window.open(`${PORTAL_URL}/auth/signup?source=ext`, '_blank')}
        onBack={back}
      >
        Capture saves straight into your workspace. Sign in to the Patina portal
        and the extension picks up your sign-in on its own — then come back here.
        <div className="mt-4 flex flex-col items-start gap-2">
          <button
            type="button"
            onClick={() => window.open(`${PORTAL_URL}/auth/signin?source=ext`, '_blank')}
            className="font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-soft hover:text-ink"
          >
            Already have one? Sign in
          </button>
          <button
            type="button"
            onClick={next}
            className="font-mono text-[0.68rem] uppercase tracking-[0.06em] text-verdigris hover:text-verdigris-ink"
          >
            I'm signed in →
          </button>
        </div>
      </Shell>
    );
  }
  if (step === 2) {
    return (
      <Shell step={2} eyebrow="Why page access" title="Reading the page" primary="Makes sense" onPrimary={next} onBack={back}>
        To read a product's name, price, and images, Patina reads the page you're
        on when you capture — only then, only that tab. What it reads goes to
        your Patina workspace. We keep light usage stats — what you do in the
        extension, never the page. Chrome words this permission broadly ('Read
        and change all your data on all websites'); we use it only at the
        moment you capture.
      </Shell>
    );
  }
  return (
    <Shell
      step={3}
      eyebrow="Ready"
      title="You're set to capture"
      primary="Start capturing"
      onPrimary={() => window.close()}
      onBack={back}
    >
      Pin Patina to your toolbar so it's one click away — open the puzzle-piece
      menu in Chrome and pin it.
      <div className="mt-4 rounded-md border border-line bg-paper-3 p-3 font-mono text-[0.8rem]">
        {shortcut ? (
          <>
            Shortcut: <span className="text-verdigris">{shortcut}</span>
          </>
        ) : (
          <>Set a shortcut at chrome://extensions/shortcuts</>
        )}
      </div>
    </Shell>
  );
}

export default Onboarding;
