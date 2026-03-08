"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const TimelineSegment_1 = require("./TimelineSegment");
const mockSegment = {
    id: '1',
    type: 'milestone',
    status: 'completed',
    title: 'Test Milestone',
    description: 'Test description',
    date: new Date('2024-01-15'),
};
// Mock IntersectionObserver
global.IntersectionObserver = vitest_1.vi.fn().mockImplementation(() => ({
    observe: vitest_1.vi.fn(),
    unobserve: vitest_1.vi.fn(),
    disconnect: vitest_1.vi.fn(),
}));
(0, vitest_1.describe)('TimelineSegment', () => {
    (0, vitest_1.it)('renders segment title and description', () => {
        (0, react_1.render)(<TimelineSegment_1.TimelineSegment segment={mockSegment}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Test Milestone')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Test description')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders date when provided', () => {
        (0, react_1.render)(<TimelineSegment_1.TimelineSegment segment={mockSegment}/>);
        (0, vitest_1.expect)(react_1.screen.getByText(/Jan 15, 2024/)).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders type badge', () => {
        (0, react_1.render)(<TimelineSegment_1.TimelineSegment segment={mockSegment}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('milestone')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders completed status correctly', () => {
        const { container } = (0, react_1.render)(<TimelineSegment_1.TimelineSegment segment={mockSegment}/>);
        const marker = container.querySelector('svg');
        (0, vitest_1.expect)(marker).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders active status correctly', () => {
        const activeSegment = { ...mockSegment, status: 'active' };
        (0, react_1.render)(<TimelineSegment_1.TimelineSegment segment={activeSegment}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('In Progress')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders upcoming status correctly', () => {
        const upcomingSegment = { ...mockSegment, status: 'upcoming' };
        const { container } = (0, react_1.render)(<TimelineSegment_1.TimelineSegment segment={upcomingSegment}/>);
        (0, vitest_1.expect)(container.firstChild).toHaveClass(/opacity-60/);
    });
    (0, vitest_1.it)('renders blocked status correctly', () => {
        const blockedSegment = { ...mockSegment, status: 'blocked' };
        const { container } = (0, react_1.render)(<TimelineSegment_1.TimelineSegment segment={blockedSegment}/>);
        (0, vitest_1.expect)(container.firstChild).toHaveClass(/opacity-40/);
        (0, vitest_1.expect)(container.firstChild).toHaveClass(/cursor-not-allowed/);
    });
    (0, vitest_1.it)('handles different segment sizes', () => {
        const { container, rerender } = (0, react_1.render)(<TimelineSegment_1.TimelineSegment segment={mockSegment} size="compact"/>);
        (0, vitest_1.expect)(container.firstChild).toHaveClass(/py-4/);
        rerender(<TimelineSegment_1.TimelineSegment segment={mockSegment} size="hero"/>);
        (0, vitest_1.expect)(container.firstChild).toHaveClass(/py-16/);
    });
    (0, vitest_1.it)('shows expand/collapse button when expandable', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<TimelineSegment_1.TimelineSegment segment={mockSegment} expandable/>);
        const expandButton = react_1.screen.getByRole('button', { name: /show more/i });
        (0, vitest_1.expect)(expandButton).toBeInTheDocument();
        await user.click(expandButton);
        (0, vitest_1.expect)(react_1.screen.getByRole('button', { name: /show less/i })).toBeInTheDocument();
    });
    (0, vitest_1.it)('calls onExpand when expanded', async () => {
        const user = user_event_1.default.setup();
        const onExpand = vitest_1.vi.fn();
        (0, react_1.render)(<TimelineSegment_1.TimelineSegment segment={mockSegment} expandable onExpand={onExpand}/>);
        const expandButton = react_1.screen.getByRole('button', { name: /show more/i });
        await user.click(expandButton);
        (0, vitest_1.expect)(onExpand).toHaveBeenCalledWith('1');
    });
    (0, vitest_1.it)('renders custom icon when provided', () => {
        const customIcon = <span data-testid="custom-icon">★</span>;
        const segmentWithIcon = { ...mockSegment, icon: customIcon };
        (0, react_1.render)(<TimelineSegment_1.TimelineSegment segment={segmentWithIcon}/>);
        (0, vitest_1.expect)(react_1.screen.getByTestId('custom-icon')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders children when provided', () => {
        (0, react_1.render)(<TimelineSegment_1.TimelineSegment segment={mockSegment}>
        <div data-testid="custom-content">Custom Content</div>
      </TimelineSegment_1.TimelineSegment>);
        (0, vitest_1.expect)(react_1.screen.getByTestId('custom-content')).toBeInTheDocument();
    });
    (0, vitest_1.it)('hides children when collapsed and expandable', () => {
        const { container } = (0, react_1.render)(<TimelineSegment_1.TimelineSegment segment={mockSegment} expandable>
        <div>Content to hide</div>
      </TimelineSegment_1.TimelineSegment>);
        const contentWrapper = container.querySelector('.max-h-0');
        (0, vitest_1.expect)(contentWrapper).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders different segment types with correct badges', () => {
        const types = [
            'milestone',
            'task',
            'approval',
            'update',
        ];
        types.forEach((type) => {
            const { rerender } = (0, react_1.render)(<TimelineSegment_1.TimelineSegment segment={{ ...mockSegment, type }}/>);
            (0, vitest_1.expect)(react_1.screen.getByText(type)).toBeInTheDocument();
            rerender(<div />);
        });
    });
});
//# sourceMappingURL=TimelineSegment.test.jsx.map