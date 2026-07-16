import { render, screen } from '@testing-library/react';
import { prototypeRoom } from '@/lib/room-view/__fixtures__/room-fixture';
import type { RoomGeometry } from '@/lib/room-view/geometry';
import { FactsRail } from '../facts-rail';

/** All-high-confidence variant of the fixture, for the Verify-line-absence case. */
function highConfidenceRoom(): RoomGeometry {
  const g = prototypeRoom();
  return { ...g, walls: g.walls.map((w) => ({ ...w, conf: 'high' })) };
}

describe('FactsRail — pure-prop content given geometry fixtures', () => {
  it('renders Area from the geometry (ftIn width × depth)', () => {
    render(
      <FactsRail
        geometry={prototypeRoom()}
        thicknessConvention={false}
        scanDate={null}
        qualityGrade={null}
        coveragePercentage={null}
      />,
    );
    // 19 x 14 fixture → 266 sq ft, 19′ 0″ × 14′ 0″
    expect(screen.getByText(/266 sq ft/)).toBeInTheDocument();
    expect(screen.getByText(/19′ 0″ × 14′ 0″/)).toBeInTheDocument();
  });

  it('renders the wall count + wall height, with the ceiling stand-in sub always present', () => {
    render(
      <FactsRail
        geometry={prototypeRoom()}
        thicknessConvention={false}
        scanDate={null}
        qualityGrade={null}
        coveragePercentage={null}
      />,
    );
    expect(screen.getByText(/5 walls/)).toBeInTheDocument();
    expect(screen.getByText(/8′ 0″/)).toBeInTheDocument();
    expect(screen.getByText('stands in for ceiling — RoomPlan captures none')).toBeInTheDocument();
  });

  it('shows the wall-thickness-convention sub line ONLY when thicknessConvention is true', () => {
    const { rerender } = render(
      <FactsRail
        geometry={prototypeRoom()}
        thicknessConvention={false}
        scanDate={null}
        qualityGrade={null}
        coveragePercentage={null}
      />,
    );
    expect(screen.queryByText('wall thickness drawn by convention')).not.toBeInTheDocument();

    rerender(
      <FactsRail
        geometry={prototypeRoom()}
        thicknessConvention={true}
        scanDate={null}
        qualityGrade={null}
        coveragePercentage={null}
      />,
    );
    expect(screen.getByText('wall thickness drawn by convention')).toBeInTheDocument();
  });

  it('renders windows/doors/openings counts', () => {
    render(
      <FactsRail
        geometry={prototypeRoom()}
        thicknessConvention={false}
        scanDate={null}
        qualityGrade={null}
        coveragePercentage={null}
      />,
    );
    // fixture: 2 windows, 1 door, 1 opening
    expect(screen.getByText(/2 windows/)).toBeInTheDocument();
    expect(screen.getByText(/1 door\b/)).toBeInTheDocument();
    expect(screen.getByText(/1 opening\b/)).toBeInTheDocument();
  });

  it('renders detected object categories, grouped with counts, in first-appearance order', () => {
    render(
      <FactsRail
        geometry={prototypeRoom()}
        thicknessConvention={false}
        scanDate={null}
        qualityGrade={null}
        coveragePercentage={null}
      />,
    );
    // fixture objects: sofa, coffee table(cat 'table'), chair, chair, television
    expect(screen.getByText('sofa · table · 2 chairs · television')).toBeInTheDocument();
  });

  it('renders the Scan line from date/quality/coverage', () => {
    render(
      <FactsRail
        geometry={prototypeRoom()}
        thicknessConvention={false}
        scanDate="2026-07-15"
        qualityGrade="high"
        coveragePercentage={0.92}
      />,
    );
    expect(screen.getByText(/Jul 15/)).toBeInTheDocument();
    expect(screen.getByText(/quality high/)).toBeInTheDocument();
    expect(screen.getByText(/0\.92/)).toBeInTheDocument();
  });

  it('shows the Verify fact, naming the wall, when a low-confidence wall exists (I73a)', () => {
    render(
      <FactsRail
        geometry={prototypeRoom()}
        thicknessConvention={false}
        scanDate={null}
        qualityGrade={null}
        coveragePercentage={null}
      />,
    );
    expect(screen.getByText('Verify')).toBeInTheDocument();
    expect(screen.getByText(/North wall \(east run\)/)).toBeInTheDocument();
    expect(screen.getByText(/drawn dashed; confirm on site/)).toBeInTheDocument();
  });

  it('omits the Verify fact entirely when no wall reads low confidence', () => {
    render(
      <FactsRail
        geometry={highConfidenceRoom()}
        thicknessConvention={false}
        scanDate={null}
        qualityGrade={null}
        coveragePercentage={null}
      />,
    );
    expect(screen.queryByText('Verify')).not.toBeInTheDocument();
    expect(screen.queryByText(/drawn dashed; confirm on site/)).not.toBeInTheDocument();
  });
});
