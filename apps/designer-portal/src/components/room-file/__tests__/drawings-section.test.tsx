/**
 * DrawingsSection — the inline floor-plan preview (Rendered Room v2, P1).
 *
 * The signing client is mocked at its module boundary (a relative-alias import,
 * so no `@patina/*` mock-resolution question arises). What matters here is the
 * contract the section promises: the PLAN sheet — and only the plan sheet — is
 * signed on mount, a skeleton holds the space until it lands, and every failure
 * path collapses silently back to the downloads-only layout.
 */

import { render, screen, waitFor } from '@testing-library/react';
import type { RoomFileDrawings } from '@patina/supabase';
import { DrawingsSection } from '../drawings-section';

const mockSign = jest.fn();

jest.mock('@/lib/room-file/room-file-download', () => ({
  signRoomScansUrl: (...args: unknown[]) => mockSign(...args),
  downloadRoomFileArtifact: jest.fn(),
}));

function sheet(id: string, title: string) {
  return {
    id,
    title,
    svg_url: `https://storage.invalid/${id}.svg`,
    svg_sha256: 'sha-svg',
    pdf_url: `https://storage.invalid/${id}.pdf`,
    pdf_sha256: 'sha-pdf',
  };
}

function drawings(): RoomFileDrawings {
  return {
    sheets: [sheet('plan', 'FLOOR PLAN'), sheet('elev-north', 'ELEVATION — NORTH')],
    dxf_url: 'https://storage.invalid/room.dxf',
    generated_at: '2026-08-18',
  };
}

function renderSection(d: RoomFileDrawings = drawings()) {
  return render(<DrawingsSection drawings={d} version={2} roomName="Living room" />);
}

describe('DrawingsSection — inline plan preview', () => {
  it('signs the plan sheet on mount and draws it with alt text', async () => {
    mockSign.mockResolvedValue('https://storage.example/signed-plan.svg');

    renderSection();

    const img = await screen.findByAltText('Floor plan of Living room, drawn from the scan');
    expect(img).toHaveAttribute('src', 'https://storage.example/signed-plan.svg');
    // Only the plan is signed on mount — elevations stay download-only.
    expect(mockSign).toHaveBeenCalledTimes(1);
    expect(mockSign).toHaveBeenCalledWith('https://storage.invalid/plan.svg');
  });

  it('holds a skeleton while the URL is being signed', async () => {
    let resolveSign: (url: string) => void = () => {};
    mockSign.mockReturnValue(new Promise<string>((resolve) => {
      resolveSign = resolve;
    }));

    renderSection();

    expect(screen.getByTestId('plan-preview-skeleton')).toBeInTheDocument();

    resolveSign('https://storage.example/signed-plan.svg');
    await waitFor(() =>
      expect(screen.queryByTestId('plan-preview-skeleton')).not.toBeInTheDocument(),
    );
  });

  it('falls back silently to downloads-only when signing fails', async () => {
    mockSign.mockRejectedValue(new Error('denied'));

    renderSection();

    await waitFor(() =>
      expect(screen.queryByTestId('plan-preview-skeleton')).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    // The sheet list is untouched — no error line was introduced.
    expect(screen.getByText('FLOOR PLAN')).toBeInTheDocument();
    expect(screen.getByText('ELEVATION — NORTH')).toBeInTheDocument();
  });

  it('renders nothing extra when the version carries no plan sheet', () => {
    renderSection({ ...drawings(), sheets: [sheet('elev-north', 'ELEVATION — NORTH')] });

    expect(mockSign).not.toHaveBeenCalled();
    expect(screen.queryByTestId('plan-preview-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
