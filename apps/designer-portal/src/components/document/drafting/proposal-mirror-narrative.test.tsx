import { render, screen } from '@testing-library/react';
import { MirrorNarrativeSection } from './proposal-mirror';

jest.mock('@patina/supabase', () => ({}));
jest.mock('@patina/utils', () => ({}));
jest.mock('@patina/design-system', () => ({}));

describe('designer proposal narrative mirror', () => {
  it('renders the client-visible section title, body, and concept metadata', () => {
    render(
      <MirrorNarrativeSection
        section={{
          id: 'concept-1',
          type: 'concept',
          title: 'A quiet material story',
          body: 'Warm oak, worn linen, and a restrained mineral palette.',
          metadata: {
            mood_board_urls: ['https://example.invalid/mood.jpg'],
            color_palette: [{ hex: '#A8B5A6', name: 'Soft sage' }],
          },
        }}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'A quiet material story' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Warm oak, worn linen/)).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://example.invalid/mood.jpg',
    );
    expect(screen.getByLabelText('Soft sage')).toHaveStyle({
      backgroundColor: '#A8B5A6',
    });
  });

  it('matches the client space-plan pending state', () => {
    render(
      <MirrorNarrativeSection
        section={{
          id: 'space-1',
          type: 'space_plan',
          title: 'Space plan',
          body: null,
          metadata: {},
        }}
      />,
    );

    expect(screen.getByText('Space plan pending')).toBeInTheDocument();
  });
});
