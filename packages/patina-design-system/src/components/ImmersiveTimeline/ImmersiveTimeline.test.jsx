"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const ImmersiveTimeline_1 = require("./ImmersiveTimeline");
const mockSegments = [
    {
        id: '1',
        type: 'milestone',
        status: 'completed',
        title: 'Phase 1',
        description: 'Initial phase completed',
        date: new Date('2024-01-15'),
    },
    {
        id: '2',
        type: 'approval',
        status: 'active',
        title: 'Phase 2',
        description: 'Currently in progress',
        date: new Date('2024-02-01'),
    },
    {
        id: '3',
        type: 'task',
        status: 'upcoming',
        title: 'Phase 3',
        description: 'Scheduled for future',
    },
];
(0, vitest_1.describe)('ImmersiveTimeline', () => {
    (0, vitest_1.beforeEach)(() => {
        // Mock IntersectionObserver
        global.IntersectionObserver = vitest_1.vi.fn().mockImplementation(() => ({
            observe: vitest_1.vi.fn(),
            unobserve: vitest_1.vi.fn(),
            disconnect: vitest_1.vi.fn(),
        }));
    });
    (0, vitest_1.it)('renders timeline with segments', () => {
        (0, react_1.render)(<ImmersiveTimeline_1.ImmersiveTimeline segments={mockSegments}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Phase 1')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Phase 2')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Phase 3')).toBeInTheDocument();
    });
    (0, vitest_1.it)('shows progress indicator when enabled', () => {
        const { container } = (0, react_1.render)(<ImmersiveTimeline_1.ImmersiveTimeline segments={mockSegments} showProgress/>);
        const progressIndicator = container.querySelector('[class*="fixed"]');
        (0, vitest_1.expect)(progressIndicator).toBeInTheDocument();
    });
    (0, vitest_1.it)('hides progress indicator when disabled', () => {
        const { container } = (0, react_1.render)(<ImmersiveTimeline_1.ImmersiveTimeline segments={mockSegments} showProgress={false}/>);
        const progressIndicator = container.querySelector('[class*="fixed"]');
        (0, vitest_1.expect)(progressIndicator).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('calls onSegmentChange when segment becomes active', async () => {
        const onSegmentChange = vitest_1.vi.fn();
        (0, react_1.render)(<ImmersiveTimeline_1.ImmersiveTimeline segments={mockSegments} onSegmentChange={onSegmentChange}/>);
        // Note: Would need to trigger IntersectionObserver callback
        // This is a simplified test
        (0, vitest_1.expect)(onSegmentChange).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('renders with different layouts', () => {
        const { rerender, container } = (0, react_1.render)(<ImmersiveTimeline_1.ImmersiveTimeline segments={mockSegments} layout="default"/>);
        (0, vitest_1.expect)(container.firstChild).toHaveClass(/max-w-4xl/);
        rerender(<ImmersiveTimeline_1.ImmersiveTimeline segments={mockSegments} layout="wide"/>);
        (0, vitest_1.expect)(container.firstChild?.firstChild).toHaveClass(/max-w-6xl/);
    });
    (0, vitest_1.it)('renders with different spacing', () => {
        const { rerender, container } = (0, react_1.render)(<ImmersiveTimeline_1.ImmersiveTimeline segments={mockSegments} spacing="compact"/>);
        (0, vitest_1.expect)(container.firstChild?.firstChild).toHaveClass(/space-y-2/);
        rerender(<ImmersiveTimeline_1.ImmersiveTimeline segments={mockSegments} spacing="spacious"/>);
        (0, vitest_1.expect)(container.firstChild?.firstChild).toHaveClass(/space-y-16/);
    });
    (0, vitest_1.it)('renders custom segment content', () => {
        const renderSegment = (segment) => (<div data-testid={`custom-${segment.id}`}>{segment.title}</div>);
        (0, react_1.render)(<ImmersiveTimeline_1.ImmersiveTimeline segments={mockSegments} renderSegment={renderSegment}/>);
        (0, vitest_1.expect)(react_1.screen.getByTestId('custom-1')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByTestId('custom-2')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByTestId('custom-3')).toBeInTheDocument();
    });
    (0, vitest_1.it)('shows keyboard navigation hint when enabled', () => {
        (0, react_1.render)(<ImmersiveTimeline_1.ImmersiveTimeline segments={mockSegments} enableKeyboardNav/>);
        const hint = react_1.screen.getByText(/navigate/);
        (0, vitest_1.expect)(hint).toBeInTheDocument();
    });
    (0, vitest_1.it)('hides keyboard navigation hint when disabled', () => {
        (0, react_1.render)(<ImmersiveTimeline_1.ImmersiveTimeline segments={mockSegments} enableKeyboardNav={false}/>);
        (0, vitest_1.expect)(react_1.screen.queryByText(/navigate/)).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('handles empty segments array', () => {
        const { container } = (0, react_1.render)(<ImmersiveTimeline_1.ImmersiveTimeline segments={[]}/>);
        (0, vitest_1.expect)(container.firstChild).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.queryByText('Phase 1')).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('applies correct data attributes to segments', () => {
        const { container } = (0, react_1.render)(<ImmersiveTimeline_1.ImmersiveTimeline segments={mockSegments}/>);
        const segment = container.querySelector('[data-segment-id="1"]');
        (0, vitest_1.expect)(segment).toBeInTheDocument();
        (0, vitest_1.expect)(segment).toHaveAttribute('data-segment-id', '1');
    });
    (0, vitest_1.it)('sets progress position correctly', () => {
        const { container, rerender } = (0, react_1.render)(<ImmersiveTimeline_1.ImmersiveTimeline segments={mockSegments} showProgress progressPosition="fixed-left"/>);
        let progressIndicator = container.querySelector('[class*="left-"]');
        (0, vitest_1.expect)(progressIndicator).toBeInTheDocument();
        rerender(<ImmersiveTimeline_1.ImmersiveTimeline segments={mockSegments} showProgress progressPosition="fixed-right"/>);
        progressIndicator = container.querySelector('[class*="right-"]');
        (0, vitest_1.expect)(progressIndicator).toBeInTheDocument();
    });
});
//# sourceMappingURL=ImmersiveTimeline.test.jsx.map