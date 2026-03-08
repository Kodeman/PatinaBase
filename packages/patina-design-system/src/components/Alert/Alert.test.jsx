"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const Alert_1 = require("./Alert");
(0, vitest_1.describe)('Alert', () => {
    (0, vitest_1.it)('renders alert with title and description', () => {
        (0, react_1.render)(<Alert_1.Alert title="Test Title" description="Test Description" variant="info"/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Test Title')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Test Description')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders children when provided', () => {
        (0, react_1.render)(<Alert_1.Alert variant="success">
        <Alert_1.AlertTitle>Custom Title</Alert_1.AlertTitle>
        <Alert_1.AlertDescription>Custom Description</Alert_1.AlertDescription>
      </Alert_1.Alert>);
        (0, vitest_1.expect)(react_1.screen.getByText('Custom Title')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Custom Description')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders correct variant styles', () => {
        const { rerender, container } = (0, react_1.render)(<Alert_1.Alert variant="info"/>);
        (0, vitest_1.expect)(container.querySelector('[role="alert"]')).toHaveClass('bg-blue-50');
        rerender(<Alert_1.Alert variant="success"/>);
        (0, vitest_1.expect)(container.querySelector('[role="alert"]')).toHaveClass('bg-green-50');
        rerender(<Alert_1.Alert variant="warning"/>);
        (0, vitest_1.expect)(container.querySelector('[role="alert"]')).toHaveClass('bg-yellow-50');
        rerender(<Alert_1.Alert variant="error"/>);
        (0, vitest_1.expect)(container.querySelector('[role="alert"]')).toHaveClass('bg-red-50');
    });
    (0, vitest_1.it)('renders default variant icon', () => {
        const { container } = (0, react_1.render)(<Alert_1.Alert variant="success"/>);
        (0, vitest_1.expect)(container.querySelector('svg')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders custom icon when provided', () => {
        (0, react_1.render)(<Alert_1.Alert icon={<span data-testid="custom-icon">!</span>} variant="info"/>);
        (0, vitest_1.expect)(react_1.screen.getByTestId('custom-icon')).toBeInTheDocument();
    });
    (0, vitest_1.it)('shows close button when closable', () => {
        (0, react_1.render)(<Alert_1.Alert closable variant="info"/>);
        (0, vitest_1.expect)(react_1.screen.getByRole('button', { name: /close alert/i })).toBeInTheDocument();
    });
    (0, vitest_1.it)('calls onClose and hides alert when close button clicked', async () => {
        const user = user_event_1.default.setup();
        const onClose = vitest_1.vi.fn();
        (0, react_1.render)(<Alert_1.Alert closable onClose={onClose} title="Test Alert"/>);
        const closeButton = react_1.screen.getByRole('button', { name: /close alert/i });
        await user.click(closeButton);
        (0, vitest_1.expect)(onClose).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(react_1.screen.queryByText('Test Alert')).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('has proper role attribute', () => {
        (0, react_1.render)(<Alert_1.Alert variant="info"/>);
        (0, vitest_1.expect)(react_1.screen.getByRole('alert')).toBeInTheDocument();
    });
    (0, vitest_1.it)('applies custom className', () => {
        const { container } = (0, react_1.render)(<Alert_1.Alert className="custom-class" variant="info"/>);
        (0, vitest_1.expect)(container.querySelector('[role="alert"]')).toHaveClass('custom-class');
    });
    (0, vitest_1.it)('forwards ref correctly', () => {
        const ref = vitest_1.vi.fn();
        (0, react_1.render)(<Alert_1.Alert ref={ref} variant="info"/>);
        (0, vitest_1.expect)(ref).toHaveBeenCalled();
    });
});
//# sourceMappingURL=Alert.test.jsx.map