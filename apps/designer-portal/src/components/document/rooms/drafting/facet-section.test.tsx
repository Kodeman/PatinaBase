import { useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ComposeSection } from '../../compose/compose-section';
import { FacetSection } from './facet-section';

type SectionProps = {
  name: string;
  status: string;
  done: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

function StatefulEditor({ label }: { label: string }) {
  const [value, setValue] = useState('');
  return (
    <label>
      {label}
      <input
        aria-label={label}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </label>
  );
}

function SingleActiveFixture({
  Section,
  label,
}: {
  Section: ComponentType<SectionProps>;
  label: string;
}) {
  const [open, setOpen] = useState<'first' | 'second'>('first');
  return (
    <>
      <Section
        name="First facet"
        status="in progress"
        done={false}
        open={open === 'first'}
        onToggle={() => setOpen('first')}
      >
        <StatefulEditor label={`${label} first draft`} />
      </Section>
      <Section
        name="Second facet"
        status="not yet written"
        done={false}
        open={open === 'second'}
        onToggle={() => setOpen('second')}
      >
        <StatefulEditor label={`${label} second draft`} />
      </Section>
    </>
  );
}

describe.each([
  ['ComposeSection', 'compose', ComposeSection],
  ['FacetSection', 'drafting', FacetSection],
] as const)('%s visited editor persistence', (_name, label, Section) => {
  it('mounts lazily, preserves local input, and makes the inactive body hidden and inert', () => {
    render(<SingleActiveFixture Section={Section} label={label} />);

    const firstToggle = screen.getByRole('button', { name: /First facet/i });
    const secondToggle = screen.getByRole('button', {
      name: /Second facet/i,
    });
    const firstId = firstToggle.getAttribute('aria-controls');
    const secondId = secondToggle.getAttribute('aria-controls');

    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();
    expect(firstToggle).toHaveAttribute('aria-expanded', 'true');
    expect(secondToggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(secondId!)).toBeNull();
    expect(screen.queryByLabelText(`${label} second draft`)).toBeNull();

    const firstInput = screen.getByLabelText(`${label} first draft`);
    fireEvent.change(firstInput, { target: { value: 'keep this wording' } });
    expect(firstInput).toHaveValue('keep this wording');

    fireEvent.click(secondToggle);

    const inactiveFirstBody = document.getElementById(firstId!);
    const activeSecondBody = document.getElementById(secondId!);
    expect(firstToggle).toHaveAttribute('aria-expanded', 'false');
    expect(secondToggle).toHaveAttribute('aria-expanded', 'true');
    expect(inactiveFirstBody).toHaveAttribute('hidden');
    expect(inactiveFirstBody).toHaveAttribute('inert');
    expect(inactiveFirstBody).toHaveAttribute('aria-hidden', 'true');
    expect(activeSecondBody).not.toHaveAttribute('hidden');
    expect(activeSecondBody).not.toHaveAttribute('inert');
    expect(firstInput).not.toBeVisible();
    expect(firstInput).toHaveValue('keep this wording');

    fireEvent.click(firstToggle);

    expect(document.getElementById(firstId!)).toBe(inactiveFirstBody);
    expect(firstToggle).toHaveAttribute('aria-expanded', 'true');
    expect(secondToggle).toHaveAttribute('aria-expanded', 'false');
    expect(inactiveFirstBody).not.toHaveAttribute('hidden');
    expect(inactiveFirstBody).not.toHaveAttribute('inert');
    expect(screen.getByLabelText(`${label} first draft`)).toHaveValue(
      'keep this wording',
    );
    expect(activeSecondBody).toHaveAttribute('hidden');
    expect(activeSecondBody).toHaveAttribute('inert');
    expect(activeSecondBody).toHaveAttribute('aria-hidden', 'true');
  });
});
