/**
 * K9 (00796) — the new-project sheet asks which studio only when the designer
 * holds two or more; the choice is required then and reaches open_project_direct
 * as studioId. One studio: no question, no studioId, the server stamps it as
 * before. A refusal is said in words, never printed raw.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { OpenProjectSheet } from '../open-project-sheet';

const mutate = jest.fn();
const STUDIO_A = {
  id: 'studio-a',
  name: 'Middle West Studio',
  type: 'design_studio',
  status: 'active',
  membership: { role: 'owner', status: 'active' },
};
const STUDIO_B = {
  id: 'studio-b',
  name: 'Ames Interiors',
  type: 'design_studio',
  status: 'active',
  membership: { role: 'member', status: 'active' },
};
let mockOrganizations: Array<Record<string, unknown>> = [];

jest.mock('@patina/supabase', () => ({
  useOrganizations: () => ({ data: mockOrganizations }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/hooks/use-project-lifecycle', () => ({
  useOpenProjectDirect: () => ({ mutate, isPending: false }),
}));

jest.mock('@/components/portal/client-picker', () => ({
  ClientPicker: () => <button type="button">Choose household</button>,
}));

const nameIt = () =>
  fireEvent.change(screen.getByRole('textbox', { name: 'Project title' }), {
    target: { value: 'Lake house refresh' },
  });
const create = () =>
  fireEvent.click(screen.getByRole('button', { name: /create project file/i }));

beforeEach(() => {
  mutate.mockReset();
  mockOrganizations = [];
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: jest.fn(() => 'project-1'),
  });
});

describe('OpenProjectSheet · the studio question (K9)', () => {
  it('asks nothing of a designer with one studio, and sends no studioId', () => {
    mockOrganizations = [STUDIO_A];
    render(<OpenProjectSheet open onClose={jest.fn()} />);
    expect(screen.queryByRole('combobox', { name: 'Studio' })).not.toBeInTheDocument();
    nameIt();
    create();
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).not.toHaveProperty('studioId');
  });

  it('never counts a guest seat as a second studio', () => {
    mockOrganizations = [STUDIO_A, { ...STUDIO_B, membership: { role: 'guest', status: 'active' } }];
    render(<OpenProjectSheet open onClose={jest.fn()} />);
    expect(screen.queryByRole('combobox', { name: 'Studio' })).not.toBeInTheDocument();
  });

  it('asks which studio at two, requires it, and passes the choice as studioId', () => {
    mockOrganizations = [STUDIO_A, STUDIO_B];
    render(<OpenProjectSheet open onClose={jest.fn()} />);
    const picker = screen.getByRole('combobox', { name: 'Studio' });
    expect(picker).toHaveAttribute("aria-required", "true");
    expect(
      Array.from((picker as HTMLSelectElement).options).map((o) => o.textContent),
    ).toEqual(['Choose a studio', 'Ames Interiors', 'Middle West Studio']);

    nameIt();
    create();
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Choose the studio this project belongs to.');
    expect(picker).toHaveFocus();

    fireEvent.change(picker, { target: { value: 'studio-b' } });
    create();
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual(
      expect.objectContaining({ title: 'Lake house refresh', studioId: 'studio-b' }),
    );
  });

  it.each([
    [
      'open_project_direct: studio_not_member — you do not hold a seat in studio 9f',
      "You don't hold a seat in that studio. Choose another.",
    ],
    [
      'studio_id_not_designer_studio',
      'You belong to more than one studio. Choose the one this project belongs to.',
    ],
    ['some trigger: unexpected row', "The project file couldn't be created. Try again."],
  ])('says %s in words, never raw', (raw, said) => {
    mockOrganizations = [STUDIO_A];
    mutate.mockImplementation((_input: unknown, options: { onError: (e: Error) => void }) =>
      options.onError(new Error(raw)),
    );
    render(<OpenProjectSheet open onClose={jest.fn()} />);
    nameIt();
    create();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(said);
    expect(alert).not.toHaveTextContent(raw);
  });
});
