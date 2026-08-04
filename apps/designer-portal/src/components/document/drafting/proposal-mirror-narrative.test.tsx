import { render, screen } from '@testing-library/react';
import {
  mapProposalMirrorBoard,
  MirrorNarrativeSection,
  MirrorPresentationAnalytics,
} from './proposal-mirror';

const mockPresented = jest.fn();

jest.mock('@patina/supabase', () => ({}));
jest.mock('@patina/utils', () => ({}));
jest.mock('@patina/design-system', () => ({}));
jest.mock('@/lib/analytics/mood-board-events', () => ({
  moodBoardEvents: { presented: (...args: unknown[]) => mockPresented(...args) },
}));

describe('designer proposal mirror', () => {
  beforeEach(() => {
    mockPresented.mockReset();
  });

  it('preserves persisted mood-board sections for the shared composition renderer', () => {
    const sections = [
      { id: 'section-1', name: 'Materials', color: '#D8C9B8' },
    ];

    expect(
      mapProposalMirrorBoard({
        id: 'board-1',
        name: 'Living room direction',
        canvas_width: 1200,
        canvas_height: 800,
        background_color: '#F7F4EF',
        sections,
        proposal_board_items: [{ id: 'item-1', type: 'image' }],
      }),
    ).toMatchObject({
      sections,
      items: [{ id: 'item-1', type: 'image' }],
    });
  });

  it('emits one duration-bearing presentation per board when mirror viewing ends', () => {
    const now = jest
      .fn()
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(350)
      .mockReturnValueOnce(500);
    const boardOne = mapProposalMirrorBoard({
      id: 'board-1',
      name: 'One',
      sections: [{ id: 'section-1', name: 'Palette' }],
      proposal_board_items: [{ id: 'item-1' }],
    });
    const boardTwo = mapProposalMirrorBoard({
      id: 'board-2',
      name: 'Two',
      sections: [],
      proposal_board_items: [{ id: 'item-2' }, { id: 'item-3' }],
    });

    const view = render(
      <MirrorPresentationAnalytics
        proposalId="proposal-1"
        boards={[boardOne, boardTwo]}
        now={now}
      />,
    );
    view.rerender(
      <MirrorPresentationAnalytics
        proposalId="proposal-1"
        boards={[boardTwo]}
        now={now}
      />,
    );
    view.unmount();

    expect(mockPresented).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        board_id: 'board-1',
        item_count: 1,
        section_count: 1,
        surface: 'mirror',
        duration_ms: 250,
        proposal_id: 'proposal-1',
      }),
    );
    expect(mockPresented).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        board_id: 'board-2',
        item_count: 2,
        section_count: 0,
        surface: 'mirror',
        duration_ms: 400,
        proposal_id: 'proposal-1',
      }),
    );
    expect(mockPresented).toHaveBeenCalledTimes(2);
  });

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
