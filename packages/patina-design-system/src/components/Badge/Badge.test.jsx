"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const Badge_1 = require("./Badge");
const lucide_react_1 = require("lucide-react");
(0, vitest_1.describe)('Badge', () => {
    (0, vitest_1.it)('renders with text content', () => {
        (0, react_1.render)(<Badge_1.Badge>New</Badge_1.Badge>);
        (0, vitest_1.expect)(react_1.screen.getByText('New')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders with default variant and color', () => {
        const { container } = (0, react_1.render)(<Badge_1.Badge>Default</Badge_1.Badge>);
        const badge = container.querySelector('span');
        (0, vitest_1.expect)(badge).toHaveClass('bg-primary');
    });
    (0, vitest_1.it)('renders solid variant colors', () => {
        const { rerender, container } = (0, react_1.render)(<Badge_1.Badge variant="solid" color="success">Success</Badge_1.Badge>);
        (0, vitest_1.expect)(container.querySelector('span')).toHaveClass('bg-green-600');
        rerender(<Badge_1.Badge variant="solid" color="warning">Warning</Badge_1.Badge>);
        (0, vitest_1.expect)(container.querySelector('span')).toHaveClass('bg-yellow-600');
        rerender(<Badge_1.Badge variant="solid" color="error">Error</Badge_1.Badge>);
        (0, vitest_1.expect)(container.querySelector('span')).toHaveClass('bg-red-600');
        rerender(<Badge_1.Badge variant="solid" color="info">Info</Badge_1.Badge>);
        (0, vitest_1.expect)(container.querySelector('span')).toHaveClass('bg-blue-600');
    });
    (0, vitest_1.it)('renders subtle variant colors', () => {
        const { container } = (0, react_1.render)(<Badge_1.Badge variant="subtle" color="success">Subtle</Badge_1.Badge>);
        (0, vitest_1.expect)(container.querySelector('span')).toHaveClass('bg-green-100');
    });
    (0, vitest_1.it)('renders outline variant with border', () => {
        const { container } = (0, react_1.render)(<Badge_1.Badge variant="outline" color="primary">Outline</Badge_1.Badge>);
        const badge = container.querySelector('span');
        (0, vitest_1.expect)(badge).toHaveClass('border');
        (0, vitest_1.expect)(badge).toHaveClass('border-primary');
    });
    (0, vitest_1.it)('renders different sizes', () => {
        const { rerender, container } = (0, react_1.render)(<Badge_1.Badge size="sm">Small</Badge_1.Badge>);
        (0, vitest_1.expect)(container.querySelector('span')).toHaveClass('text-xs');
        rerender(<Badge_1.Badge size="md">Medium</Badge_1.Badge>);
        (0, vitest_1.expect)(container.querySelector('span')).toHaveClass('text-sm');
        rerender(<Badge_1.Badge size="lg">Large</Badge_1.Badge>);
        (0, vitest_1.expect)(container.querySelector('span')).toHaveClass('text-base');
    });
    (0, vitest_1.it)('renders with icon', () => {
        (0, react_1.render)(<Badge_1.Badge icon={<lucide_react_1.Star data-testid="star-icon"/>}>Featured</Badge_1.Badge>);
        (0, vitest_1.expect)(react_1.screen.getByTestId('star-icon')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders dot indicator when showDot is true and variant is dot', () => {
        const { container } = (0, react_1.render)(<Badge_1.Badge variant="dot" showDot color="success">
        Live
      </Badge_1.Badge>);
        const dot = container.querySelector('[aria-hidden="true"]');
        (0, vitest_1.expect)(dot).toBeInTheDocument();
        (0, vitest_1.expect)(dot).toHaveClass('bg-green-600');
    });
    (0, vitest_1.it)('does not render dot when showDot is false', () => {
        const { container } = (0, react_1.render)(<Badge_1.Badge variant="dot" showDot={false}>
        No Dot
      </Badge_1.Badge>);
        (0, vitest_1.expect)(container.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('applies custom className', () => {
        const { container } = (0, react_1.render)(<Badge_1.Badge className="custom-class">Custom</Badge_1.Badge>);
        (0, vitest_1.expect)(container.querySelector('span')).toHaveClass('custom-class');
    });
    (0, vitest_1.it)('forwards ref correctly', () => {
        const ref = vitest_1.vi.fn();
        (0, react_1.render)(<Badge_1.Badge ref={ref}>Ref Test</Badge_1.Badge>);
        (0, vitest_1.expect)(ref).toHaveBeenCalled();
    });
    (0, vitest_1.it)('passes through additional props', () => {
        (0, react_1.render)(<Badge_1.Badge data-testid="custom-badge" aria-label="Custom label">Test</Badge_1.Badge>);
        const badge = react_1.screen.getByTestId('custom-badge');
        (0, vitest_1.expect)(badge).toHaveAttribute('aria-label', 'Custom label');
    });
});
//# sourceMappingURL=Badge.test.jsx.map