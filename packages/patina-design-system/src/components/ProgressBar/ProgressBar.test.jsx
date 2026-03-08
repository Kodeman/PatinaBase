"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const vitest_1 = require("vitest");
const ProgressBar_1 = require("./ProgressBar");
(0, vitest_1.describe)('ProgressBar', () => {
    (0, vitest_1.it)('renders with default props', () => {
        const { container } = (0, react_1.render)(<ProgressBar_1.ProgressBar value={50}/>);
        const progressBar = container.querySelector('[role="progressbar"]');
        (0, vitest_1.expect)(progressBar).toBeInTheDocument();
    });
    (0, vitest_1.it)('displays correct value', () => {
        const { container } = (0, react_1.render)(<ProgressBar_1.ProgressBar value={75} max={100}/>);
        const progressBar = container.querySelector('[role="progressbar"]');
        (0, vitest_1.expect)(progressBar).toHaveAttribute('aria-valuenow', '75');
        (0, vitest_1.expect)(progressBar).toHaveAttribute('aria-valuemax', '100');
    });
    (0, vitest_1.it)('shows percentage label when showLabel is true', () => {
        (0, react_1.render)(<ProgressBar_1.ProgressBar value={60} showLabel/>);
        (0, vitest_1.expect)(react_1.screen.getByText('60%')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('60 / 100')).toBeInTheDocument();
    });
    (0, vitest_1.it)('does not show label when showLabel is false', () => {
        (0, react_1.render)(<ProgressBar_1.ProgressBar value={60} showLabel={false}/>);
        (0, vitest_1.expect)(react_1.screen.queryByText('60%')).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('handles custom max value', () => {
        (0, react_1.render)(<ProgressBar_1.ProgressBar value={50} max={200} showLabel/>);
        (0, vitest_1.expect)(react_1.screen.getByText('25%')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('50 / 200')).toBeInTheDocument();
    });
    (0, vitest_1.it)('clamps value to 100%', () => {
        (0, react_1.render)(<ProgressBar_1.ProgressBar value={150} max={100} showLabel/>);
        (0, vitest_1.expect)(react_1.screen.getByText('100%')).toBeInTheDocument();
    });
    (0, vitest_1.it)('supports different sizes', () => {
        const { container, rerender } = (0, react_1.render)(<ProgressBar_1.ProgressBar value={50} size="sm"/>);
        let progressBar = container.querySelector('[role="progressbar"]');
        (0, vitest_1.expect)(progressBar).toHaveClass('h-1');
        rerender(<ProgressBar_1.ProgressBar value={50} size="lg"/>);
        progressBar = container.querySelector('[role="progressbar"]');
        (0, vitest_1.expect)(progressBar).toHaveClass('h-3');
    });
    (0, vitest_1.it)('supports different variants', () => {
        const { container, rerender } = (0, react_1.render)(<ProgressBar_1.ProgressBar value={50} variant="success"/>);
        let progressBar = container.querySelector('[role="progressbar"]');
        (0, vitest_1.expect)(progressBar).toBeInTheDocument();
        rerender(<ProgressBar_1.ProgressBar value={50} variant="error"/>);
        progressBar = container.querySelector('[role="progressbar"]');
        (0, vitest_1.expect)(progressBar).toBeInTheDocument();
    });
    (0, vitest_1.it)('handles indeterminate state', () => {
        const { container } = (0, react_1.render)(<ProgressBar_1.ProgressBar indeterminate/>);
        const progressBar = container.querySelector('[role="progressbar"]');
        (0, vitest_1.expect)(progressBar).toBeInTheDocument();
        // Indeterminate should not have a value
        (0, vitest_1.expect)(progressBar).not.toHaveAttribute('aria-valuenow');
    });
    (0, vitest_1.it)('does not show label in indeterminate state', () => {
        (0, react_1.render)(<ProgressBar_1.ProgressBar indeterminate showLabel/>);
        (0, vitest_1.expect)(react_1.screen.queryByText('%')).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('handles zero value', () => {
        (0, react_1.render)(<ProgressBar_1.ProgressBar value={0} showLabel/>);
        (0, vitest_1.expect)(react_1.screen.getByText('0%')).toBeInTheDocument();
    });
    (0, vitest_1.it)('handles full completion', () => {
        (0, react_1.render)(<ProgressBar_1.ProgressBar value={100} showLabel/>);
        (0, vitest_1.expect)(react_1.screen.getByText('100%')).toBeInTheDocument();
    });
});
//# sourceMappingURL=ProgressBar.test.jsx.map