"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const vitest_1 = require("vitest");
const EmptyState_1 = require("./EmptyState");
(0, vitest_1.describe)('EmptyState', () => {
    (0, vitest_1.it)('renders with title and description', () => {
        (0, react_1.render)(<EmptyState_1.EmptyState title="No results found" description="Try adjusting your search terms"/>);
        (0, vitest_1.expect)(react_1.screen.getByText('No results found')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Try adjusting your search terms')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders with icon', () => {
        const TestIcon = () => <div data-testid="test-icon">Icon</div>;
        (0, react_1.render)(<EmptyState_1.EmptyState icon={<TestIcon />} title="Empty"/>);
        (0, vitest_1.expect)(react_1.screen.getByTestId('test-icon')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders with action buttons', () => {
        (0, react_1.render)(<EmptyState_1.EmptyState title="No items" action={<button>Add Item</button>} secondaryAction={<button>Learn More</button>}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Add Item')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Learn More')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders with custom children', () => {
        (0, react_1.render)(<EmptyState_1.EmptyState>
        <EmptyState_1.EmptyStateIcon>
          <span data-testid="custom-icon">🎨</span>
        </EmptyState_1.EmptyStateIcon>
        <EmptyState_1.EmptyStateTitle>Custom Title</EmptyState_1.EmptyStateTitle>
        <EmptyState_1.EmptyStateDescription>Custom description</EmptyState_1.EmptyStateDescription>
        <EmptyState_1.EmptyStateActions>
          <button>Action</button>
        </EmptyState_1.EmptyStateActions>
      </EmptyState_1.EmptyState>);
        (0, vitest_1.expect)(react_1.screen.getByTestId('custom-icon')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Custom Title')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Custom description')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Action')).toBeInTheDocument();
    });
    (0, vitest_1.it)('supports different sizes', () => {
        const { container, rerender } = (0, react_1.render)(<EmptyState_1.EmptyState size="sm" title="Small"/>);
        let emptyState = container.firstChild;
        (0, vitest_1.expect)(emptyState).toHaveClass('py-8', 'px-4');
        rerender(<EmptyState_1.EmptyState size="lg" title="Large"/>);
        emptyState = container.firstChild;
        (0, vitest_1.expect)(emptyState).toHaveClass('py-16', 'px-8');
    });
    (0, vitest_1.it)('applies custom className', () => {
        const { container } = (0, react_1.render)(<EmptyState_1.EmptyState className="custom-class" title="Test"/>);
        (0, vitest_1.expect)(container.firstChild).toHaveClass('custom-class');
    });
    (0, vitest_1.it)('renders without icon when not provided', () => {
        const { container } = (0, react_1.render)(<EmptyState_1.EmptyState title="No icon"/>);
        const icons = container.querySelectorAll('[class*="EmptyStateIcon"]');
        (0, vitest_1.expect)(icons.length).toBe(0);
    });
    (0, vitest_1.it)('renders without actions when not provided', () => {
        (0, react_1.render)(<EmptyState_1.EmptyState title="No actions"/>);
        (0, vitest_1.expect)(react_1.screen.queryByRole('button')).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('handles complex description content', () => {
        (0, react_1.render)(<EmptyState_1.EmptyState title="Complex Content" description={<div>
            <p>First paragraph</p>
            <p>Second paragraph</p>
          </div>}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('First paragraph')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Second paragraph')).toBeInTheDocument();
    });
});
//# sourceMappingURL=EmptyState.test.jsx.map