"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const Spinner_1 = require("./Spinner");
(0, vitest_1.describe)('Spinner', () => {
    (0, vitest_1.it)('renders circular spinner by default', () => {
        (0, react_1.render)(<Spinner_1.Spinner />);
        (0, vitest_1.expect)(react_1.screen.getByRole('status')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Loading...')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders with custom label', () => {
        (0, react_1.render)(<Spinner_1.Spinner label="Processing..."/>);
        (0, vitest_1.expect)(react_1.screen.getByLabelText('Processing...')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Processing...')).toHaveClass('sr-only');
    });
    (0, vitest_1.it)('renders circular variant with SVG', () => {
        const { container } = (0, react_1.render)(<Spinner_1.Spinner variant="circular"/>);
        (0, vitest_1.expect)(container.querySelector('svg')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders dots variant', () => {
        const { container } = (0, react_1.render)(<Spinner_1.Spinner variant="dots"/>);
        const dots = container.querySelectorAll('.rounded-full');
        (0, vitest_1.expect)(dots).toHaveLength(3);
    });
    (0, vitest_1.it)('renders bars variant', () => {
        const { container } = (0, react_1.render)(<Spinner_1.Spinner variant="bars"/>);
        const bars = container.querySelectorAll('.rounded-sm');
        (0, vitest_1.expect)(bars).toHaveLength(3);
    });
    (0, vitest_1.it)('applies size variants', () => {
        const { rerender, container } = (0, react_1.render)(<Spinner_1.Spinner size="sm" variant="circular"/>);
        (0, vitest_1.expect)(container.querySelector('svg')).toHaveClass('h-4', 'w-4');
        rerender(<Spinner_1.Spinner size="md" variant="circular"/>);
        (0, vitest_1.expect)(container.querySelector('svg')).toHaveClass('h-6', 'w-6');
        rerender(<Spinner_1.Spinner size="lg" variant="circular"/>);
        (0, vitest_1.expect)(container.querySelector('svg')).toHaveClass('h-8', 'w-8');
        rerender(<Spinner_1.Spinner size="xl" variant="circular"/>);
        (0, vitest_1.expect)(container.querySelector('svg')).toHaveClass('h-12', 'w-12');
    });
    (0, vitest_1.it)('applies color variants', () => {
        const { rerender, container } = (0, react_1.render)(<Spinner_1.Spinner color="primary"/>);
        (0, vitest_1.expect)(container.querySelector('svg')).toHaveClass('text-primary');
        rerender(<Spinner_1.Spinner color="secondary"/>);
        (0, vitest_1.expect)(container.querySelector('svg')).toHaveClass('text-secondary');
        rerender(<Spinner_1.Spinner color="white"/>);
        (0, vitest_1.expect)(container.querySelector('svg')).toHaveClass('text-white');
        rerender(<Spinner_1.Spinner color="current"/>);
        (0, vitest_1.expect)(container.querySelector('svg')).toHaveClass('text-current');
    });
    (0, vitest_1.it)('applies speed variants', () => {
        const { rerender, container } = (0, react_1.render)(<Spinner_1.Spinner speed="slow"/>);
        (0, vitest_1.expect)(container.querySelector('svg')).toHaveClass('animate-spin-slow');
        rerender(<Spinner_1.Spinner speed="normal"/>);
        (0, vitest_1.expect)(container.querySelector('svg')).toHaveClass('animate-spin');
        rerender(<Spinner_1.Spinner speed="fast"/>);
        (0, vitest_1.expect)(container.querySelector('svg')).toHaveClass('animate-spin-fast');
    });
    (0, vitest_1.it)('applies custom className', () => {
        const { container } = (0, react_1.render)(<Spinner_1.Spinner className="custom-class"/>);
        (0, vitest_1.expect)(container.querySelector('[role="status"]')).toHaveClass('custom-class');
    });
    (0, vitest_1.it)('has proper accessibility attributes', () => {
        (0, react_1.render)(<Spinner_1.Spinner label="Loading data"/>);
        const spinner = react_1.screen.getByRole('status');
        (0, vitest_1.expect)(spinner).toHaveAttribute('aria-label', 'Loading data');
    });
    (0, vitest_1.it)('forwards ref correctly', () => {
        const ref = vitest_1.vi.fn();
        (0, react_1.render)(<Spinner_1.Spinner ref={ref}/>);
        (0, vitest_1.expect)(ref).toHaveBeenCalled();
    });
    (0, vitest_1.it)('passes through additional props', () => {
        (0, react_1.render)(<Spinner_1.Spinner data-testid="custom-spinner"/>);
        (0, vitest_1.expect)(react_1.screen.getByTestId('custom-spinner')).toBeInTheDocument();
    });
});
//# sourceMappingURL=Spinner.test.jsx.map