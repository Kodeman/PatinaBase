import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useHeldAct } from '@/lib/document/spotlight/use-held-act';

function HeldAgreementSend() {
  const [remaining, setRemaining] = useState(['scope', 'fee']);
  const holds = remaining.map((id) => ({
    id,
    target: () => document.getElementById(`agreement-${id}-fix`),
    label: `${id} part`,
    reason: `${id} needs attention`,
  }));
  const { activate, spotlight } = useHeldAct(holds, undefined);

  return (
    <section data-spotlight-frame style={{ position: 'relative' }}>
      <button aria-disabled="true" onClick={(event) => activate(event.currentTarget)}>
        Send agreement
      </button>
      {remaining.map((id) => (
        <button
          id={`agreement-${id}-fix`}
          key={id}
          onClick={() => setRemaining((items) => items.filter((item) => item !== id))}
        >
          Fix {id}
        </button>
      ))}
      {spotlight}
    </section>
  );
}

test('held agreement send opens one window per attention part and drops a fixed part', async () => {
  render(<HeldAgreementSend />);

  fireEvent.click(screen.getByRole('button', { name: 'Send agreement' }));
  await waitFor(() => expect(document.querySelectorAll('[data-hold-spotlight-window]')).toHaveLength(2));

  fireEvent.click(screen.getByRole('button', { name: 'Fix scope' }));
  await waitFor(() => expect(document.querySelectorAll('[data-hold-spotlight-window]')).toHaveLength(1));
});
