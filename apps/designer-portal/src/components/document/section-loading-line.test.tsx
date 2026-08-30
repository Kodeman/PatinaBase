import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { LOADING_SELECTOR } from '@/hooks/use-lens-density';
import { render, screen } from '@testing-library/react';
import { SectionLoadingLine } from './section-loading-line';

describe('SectionLoadingLine', () => {
  it('announces the label to assistive tech via a status region', () => {
    render(<SectionLoadingLine label="Reading the work" />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Reading the work');
    expect(status).toHaveAttribute('aria-live', 'polite');
    // D-B46 — was: `not.toHaveAttribute('aria-busy')`. The register is now the
    // lens's own signal that a body has not arrived, and `aria-busy` is the
    // half of that signal which survives a class rename. It is also the honest
    // reading of this element: a live region that is, right now, busy.
    expect(status).toHaveAttribute('aria-busy', 'true');
  });

  it('renders the label as sr-only text rather than visible prose', () => {
    render(<SectionLoadingLine label="Loading working budget" />);

    const label = screen.getByText('Loading working budget');
    expect(label).toHaveClass('sr-only');
  });

  it('hides the decorative pulse bar from assistive tech', () => {
    const { container } = render(<SectionLoadingLine label="Opening the brief" />);

    const pulse = container.querySelector('[aria-hidden]');
    expect(pulse).not.toBeNull();
    expect(pulse).toHaveClass('animate-pulse');
  });

  it('paints the pulse bar with a token this app actually defines', () => {
    const { container } = render(<SectionLoadingLine label="Opening the brief" />);

    const pulse = container.querySelector('[aria-hidden]');
    // --bg-muted does not exist anywhere in this app's CSS (globals.css
    // defines --bg-primary/--bg-surface/--bg-hover/--bg-subtle/--bg-warm,
    // never --bg-muted) — an undefined custom property makes
    // background-color invalid at computed-value time, so the bar renders
    // transparent. Pin the class to a token globals.css actually declares.
    expect(pulse).toHaveClass('bg-[var(--color-pearl)]');
    expect(pulse?.className).not.toMatch(/--bg-muted/);
  });

  it('accepts a className escape hatch for call-site spacing', () => {
    const { container } = render(
      <SectionLoadingLine label="Reading approvals" className="mt-3" />,
    );

    expect(container.firstElementChild).toHaveClass('mt-3');
  });

  // D-B39/W5-R3 — the second form: a bar meant to ride inside another line
  // (a head's count line, or the nearest printed line above a sub-block),
  // never to stand as a line box of its own.
  describe('the inline variant (D-B39/W5-R3)', () => {
    it('renders a <span>, never a <p> — it is a passenger inside another line', () => {
      const { container } = render(
        <SectionLoadingLine label="Checking readiness" variant="inline" />,
      );

      expect(container.querySelector('p')).toBeNull();
      const status = screen.getByRole('status');
      expect(status.tagName).toBe('SPAN');
      expect(status).toHaveAttribute('aria-live', 'polite');
    });

    it('still announces the label to assistive tech, sr-only', () => {
      render(<SectionLoadingLine label="Checking readiness" variant="inline" />);

      const label = screen.getByText('Checking readiness');
      expect(label).toHaveClass('sr-only');
    });

    it('sizes the pulse to the line it rides in, not the block form\'s 24-wide bar', () => {
      const { container } = render(
        <SectionLoadingLine label="Checking readiness" variant="inline" />,
      );

      const pulse = container.querySelector('[aria-hidden]');
      expect(pulse).not.toBeNull();
      expect(pulse).toHaveClass('h-[0.85em]');
      expect(pulse).toHaveClass('animate-pulse');
      expect(pulse).toHaveClass('motion-reduce:animate-none');
      // The block form's width (`w-24 max-w-[45%]`) belongs to a line of its
      // own; the inline form takes a character-width instead, and never the
      // block width — the two forms print at different sizes on purpose.
      expect(pulse).toHaveClass('w-[3ch]');
      expect(pulse?.className).not.toMatch(/w-24/);
      expect(pulse?.className).not.toMatch(/max-w-\[45%\]/);
    });

    it('stands still under reduced motion and disappears on resolve — its printed reduced form', () => {
      const { container, rerender } = render(
        <SectionLoadingLine label="Checking readiness" variant="inline" />,
      );
      const pulse = container.querySelector('[aria-hidden]');
      expect(pulse).toHaveClass('motion-reduce:animate-none');

      rerender(<div />);
      expect(screen.queryByText('Checking readiness')).not.toBeInTheDocument();
    });

    it('defaults to the block form when no variant is given — the eight block sites are untouched', () => {
      const { container } = render(<SectionLoadingLine label="Opening the brief" />);

      expect(container.firstElementChild?.tagName).toBe('P');
      const pulse = container.querySelector('[aria-hidden]');
      expect(pulse).toHaveClass('w-24');
    });
  });
});

describe('the loading registers are a contract, not a heuristic (D-B46)', () => {
  // The lens refuses to measure a paper whose bodies are still arriving, and
  // this is the selector it asks with. Imported rather than restated so the
  // register and the gate are one declaration: a register that stopped
  // matching would let the lens promote off a skeleton, which is the whole
  // defect D-B46 closes.
  const registers: Array<{ kind: string; element: React.ReactElement }> = [
    {
      kind: 'SectionLoadingLine, block',
      element: <SectionLoadingLine label="Reading the work" />,
    },
    {
      kind: 'SectionLoadingLine, inline (W5-R3)',
      element: <SectionLoadingLine label="Checking readiness" variant="inline" />,
    },
  ];

  for (const register of registers) {
    it(`${register.kind} declares itself to the lens`, () => {
      const { container } = render(register.element);
      expect(container.querySelector(LOADING_SELECTOR)).not.toBeNull();
      // `aria-busy` is the half that survives a class rename, so it must be
      // there on its own — not only the pulse class.
      expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    });
  }

  it('goes silent the moment its data lands — the gate can open', () => {
    const { container, rerender } = render(
      <SectionLoadingLine label="Checking readiness" variant="inline" />,
    );
    expect(container.querySelector(LOADING_SELECTOR)).not.toBeNull();
    rerender(<div />);
    expect(container.querySelector(LOADING_SELECTOR)).toBeNull();
  });

  it('every skeleton under the document declares itself — aria-busy is the primary arm (W4F3-03)', () => {
    // `.animate-pulse` is belt-and-braces: it is a Tailwind class, and a class
    // can be renamed by a refactor that has never heard of the lens. The
    // semantic half is the contract, and this is the ratchet — a NEW skeleton
    // that forgets it fails here rather than silently letting the lens measure
    // a paper whose bodies are still arriving.
    const root = join(process.cwd(), 'src/components/document');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.tsx')) continue;
        if (entry.name.includes('.test.')) continue;
        const source = readFileSync(full, 'utf8');
        if (!source.includes('animate-pulse')) continue;
        if (!source.includes('aria-busy')) {
          offenders.push(full.slice(process.cwd().length + 1));
        }
      }
    };
    walk(root);

    expect(offenders).toEqual([]);
  });
});
