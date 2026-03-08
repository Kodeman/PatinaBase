"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const vitest_1 = require("vitest");
const Banner_1 = require("./Banner");
(0, vitest_1.describe)('Banner', () => {
    (0, vitest_1.it)('renders with title and description', () => {
        (0, react_1.render)(<Banner_1.Banner title="Test Title" description="Test description"/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Test Title')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Test description')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders with children', () => {
        (0, react_1.render)(<Banner_1.Banner>
        <Banner_1.BannerTitle>Custom Title</Banner_1.BannerTitle>
        <Banner_1.BannerDescription>Custom description</Banner_1.BannerDescription>
      </Banner_1.Banner>);
        (0, vitest_1.expect)(react_1.screen.getByText('Custom Title')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Custom description')).toBeInTheDocument();
    });
    (0, vitest_1.it)('applies correct variant styles', () => {
        const { container, rerender } = (0, react_1.render)(<Banner_1.Banner variant="success" title="Success"/>);
        let banner = container.querySelector('[role="region"]');
        (0, vitest_1.expect)(banner).toHaveClass('bg-green-50');
        rerender(<Banner_1.Banner variant="error" title="Error"/>);
        banner = container.querySelector('[role="region"]');
        (0, vitest_1.expect)(banner).toHaveClass('bg-red-50');
    });
    (0, vitest_1.it)('shows close button when closable', () => {
        (0, react_1.render)(<Banner_1.Banner title="Test" closable/>);
        const closeButton = react_1.screen.getByRole('button', { name: /close banner/i });
        (0, vitest_1.expect)(closeButton).toBeInTheDocument();
    });
    (0, vitest_1.it)('does not show close button by default', () => {
        (0, react_1.render)(<Banner_1.Banner title="Test"/>);
        const closeButton = react_1.screen.queryByRole('button', { name: /close banner/i });
        (0, vitest_1.expect)(closeButton).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('calls onClose when close button is clicked', async () => {
        const user = user_event_1.default.setup();
        const handleClose = vitest_1.vi.fn();
        (0, react_1.render)(<Banner_1.Banner title="Test" closable onClose={handleClose}/>);
        const closeButton = react_1.screen.getByRole('button', { name: /close banner/i });
        await user.click(closeButton);
        (0, vitest_1.expect)(handleClose).toHaveBeenCalled();
    });
    (0, vitest_1.it)('hides banner when closed', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Banner_1.Banner title="Test Banner" closable/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Test Banner')).toBeInTheDocument();
        const closeButton = react_1.screen.getByRole('button', { name: /close banner/i });
        await user.click(closeButton);
        (0, vitest_1.expect)(react_1.screen.queryByText('Test Banner')).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('renders action element', () => {
        (0, react_1.render)(<Banner_1.Banner title="Test" action={<button>Learn More</button>}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Learn More')).toBeInTheDocument();
    });
    (0, vitest_1.it)('supports different positions', () => {
        const { container, rerender } = (0, react_1.render)(<Banner_1.Banner title="Test" position="top"/>);
        let banner = container.querySelector('[role="region"]');
        (0, vitest_1.expect)(banner).toHaveClass('fixed', 'top-0');
        rerender(<Banner_1.Banner title="Test" position="bottom"/>);
        banner = container.querySelector('[role="region"]');
        (0, vitest_1.expect)(banner).toHaveClass('fixed', 'bottom-0');
        rerender(<Banner_1.Banner title="Test" position="static"/>);
        banner = container.querySelector('[role="region"]');
        (0, vitest_1.expect)(banner).toHaveClass('relative');
    });
    (0, vitest_1.it)('has correct ARIA attributes', () => {
        const { container } = (0, react_1.render)(<Banner_1.Banner title="Test"/>);
        const banner = container.querySelector('[role="region"]');
        (0, vitest_1.expect)(banner).toHaveAttribute('aria-live', 'polite');
    });
    (0, vitest_1.it)('renders default icon for each variant', () => {
        const { container, rerender } = (0, react_1.render)(<Banner_1.Banner variant="info" title="Info"/>);
        (0, vitest_1.expect)(container.querySelector('svg')).toBeInTheDocument();
        rerender(<Banner_1.Banner variant="success" title="Success"/>);
        (0, vitest_1.expect)(container.querySelector('svg')).toBeInTheDocument();
        rerender(<Banner_1.Banner variant="warning" title="Warning"/>);
        (0, vitest_1.expect)(container.querySelector('svg')).toBeInTheDocument();
        rerender(<Banner_1.Banner variant="error" title="Error"/>);
        (0, vitest_1.expect)(container.querySelector('svg')).toBeInTheDocument();
    });
    (0, vitest_1.it)('supports custom icon', () => {
        const CustomIcon = () => <span data-testid="custom-icon">⭐</span>;
        (0, react_1.render)(<Banner_1.Banner title="Test" icon={<CustomIcon />}/>);
        (0, vitest_1.expect)(react_1.screen.getByTestId('custom-icon')).toBeInTheDocument();
    });
});
//# sourceMappingURL=Banner.test.jsx.map