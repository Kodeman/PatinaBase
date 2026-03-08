"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const MilestoneCard_1 = require("./MilestoneCard");
const lucide_react_1 = require("lucide-react");
(0, vitest_1.describe)('MilestoneCard', () => {
    (0, vitest_1.it)('renders with title', () => {
        (0, react_1.render)(<MilestoneCard_1.MilestoneCard title="Test Milestone"/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Test Milestone')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders description when provided', () => {
        (0, react_1.render)(<MilestoneCard_1.MilestoneCard title="Test Milestone" description="This is a test description"/>);
        (0, vitest_1.expect)(react_1.screen.getByText('This is a test description')).toBeInTheDocument();
    });
    (0, vitest_1.it)('displays date when provided', () => {
        const date = new Date('2024-10-15');
        (0, react_1.render)(<MilestoneCard_1.MilestoneCard title="Test Milestone" date={date}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('October 15, 2024')).toBeInTheDocument();
    });
    (0, vitest_1.it)('applies correct status styling', () => {
        const { container } = (0, react_1.render)(<MilestoneCard_1.MilestoneCard title="Test" status="completed"/>);
        const card = container.querySelector('div');
        (0, vitest_1.expect)(card).toHaveClass('border-green-200');
    });
    (0, vitest_1.it)('renders icon when provided', () => {
        (0, react_1.render)(<MilestoneCard_1.MilestoneCard title="Test" icon={<lucide_react_1.Calendar data-testid="calendar-icon"/>}/>);
        (0, vitest_1.expect)(react_1.screen.getByTestId('calendar-icon')).toBeInTheDocument();
    });
    (0, vitest_1.it)('shows completion percentage', () => {
        (0, react_1.render)(<MilestoneCard_1.MilestoneCard title="Test" completionPercentage={75}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('75%')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Progress')).toBeInTheDocument();
    });
    (0, vitest_1.it)('displays metrics when provided', () => {
        const metrics = [
            { label: 'Days', value: '5' },
            { label: 'Items', value: '10' },
        ];
        (0, react_1.render)(<MilestoneCard_1.MilestoneCard title="Test" metrics={metrics}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Days')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('5')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Items')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('10')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders progress photos', () => {
        const photos = [
            { id: '1', url: '/photo1.jpg', alt: 'Photo 1' },
            { id: '2', url: '/photo2.jpg', alt: 'Photo 2' },
        ];
        (0, react_1.render)(<MilestoneCard_1.MilestoneCard title="Test" progressPhotos={photos}/>);
        (0, vitest_1.expect)(react_1.screen.getByAltText('Photo 1')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByAltText('Photo 2')).toBeInTheDocument();
    });
    (0, vitest_1.it)('displays designer note', () => {
        const note = {
            author: 'Sarah Johnson',
            message: 'Great progress!',
            timestamp: new Date('2024-10-15'),
        };
        (0, react_1.render)(<MilestoneCard_1.MilestoneCard title="Test" designerNote={note}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Sarah Johnson')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Great progress!')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders primary action button', () => {
        const handleClick = vitest_1.vi.fn();
        (0, react_1.render)(<MilestoneCard_1.MilestoneCard title="Test" primaryAction={{
                label: 'Approve',
                onClick: handleClick,
            }}/>);
        const button = react_1.screen.getByText('Approve');
        (0, vitest_1.expect)(button).toBeInTheDocument();
        react_1.fireEvent.click(button);
        (0, vitest_1.expect)(handleClick).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)('renders secondary action buttons', () => {
        const handleClick1 = vitest_1.vi.fn();
        const handleClick2 = vitest_1.vi.fn();
        (0, react_1.render)(<MilestoneCard_1.MilestoneCard title="Test" secondaryActions={[
                { label: 'Action 1', onClick: handleClick1 },
                { label: 'Action 2', onClick: handleClick2 },
            ]}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Action 1')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Action 2')).toBeInTheDocument();
    });
    (0, vitest_1.it)('applies custom className', () => {
        const { container } = (0, react_1.render)(<MilestoneCard_1.MilestoneCard title="Test" className="custom-class"/>);
        const card = container.querySelector('.custom-class');
        (0, vitest_1.expect)(card).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders in compact size', () => {
        const { container } = (0, react_1.render)(<MilestoneCard_1.MilestoneCard title="Test" size="compact"/>);
        const card = container.querySelector('.p-4');
        (0, vitest_1.expect)(card).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders in hero size', () => {
        const { container } = (0, react_1.render)(<MilestoneCard_1.MilestoneCard title="Test" size="hero"/>);
        const card = container.querySelector('.p-8');
        (0, vitest_1.expect)(card).toBeInTheDocument();
    });
    (0, vitest_1.it)('applies floating elevation', () => {
        const { container } = (0, react_1.render)(<MilestoneCard_1.MilestoneCard title="Test" elevation="floating"/>);
        const card = container.querySelector('div');
        (0, vitest_1.expect)(card).toHaveClass('shadow-lg');
        (0, vitest_1.expect)(card).toHaveClass('hover:shadow-xl');
    });
    (0, vitest_1.it)('shows status badge with text', () => {
        (0, react_1.render)(<MilestoneCard_1.MilestoneCard title="Test" status="active" statusText="In Progress"/>);
        (0, vitest_1.expect)(react_1.screen.getByText('In Progress')).toBeInTheDocument();
    });
    (0, vitest_1.it)('limits photo display to 4 images', () => {
        const photos = Array.from({ length: 6 }, (_, i) => ({
            id: `${i}`,
            url: `/photo${i}.jpg`,
            alt: `Photo ${i}`,
        }));
        (0, react_1.render)(<MilestoneCard_1.MilestoneCard title="Test" progressPhotos={photos}/>);
        const images = react_1.screen.getAllByRole('img');
        // Should show 4 photos plus the avatar if designer note is present
        (0, vitest_1.expect)(images.length).toBeLessThanOrEqual(4);
    });
    (0, vitest_1.it)('shows overflow count for extra photos', () => {
        const photos = Array.from({ length: 6 }, (_, i) => ({
            id: `${i}`,
            url: `/photo${i}.jpg`,
            alt: `Photo ${i}`,
        }));
        (0, react_1.render)(<MilestoneCard_1.MilestoneCard title="Test" progressPhotos={photos}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('+2')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders custom children content', () => {
        (0, react_1.render)(<MilestoneCard_1.MilestoneCard title="Test">
        <div>Custom content</div>
      </MilestoneCard_1.MilestoneCard>);
        (0, vitest_1.expect)(react_1.screen.getByText('Custom content')).toBeInTheDocument();
    });
});
//# sourceMappingURL=MilestoneCard.test.jsx.map