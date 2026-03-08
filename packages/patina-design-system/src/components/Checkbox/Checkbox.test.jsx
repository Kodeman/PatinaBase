"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const Checkbox_1 = require("./Checkbox");
(0, vitest_1.describe)('Checkbox', () => {
    (0, vitest_1.it)('renders correctly', () => {
        const { container } = (0, react_1.render)(<Checkbox_1.Checkbox />);
        const checkbox = container.querySelector('button[role="checkbox"]');
        (0, vitest_1.expect)(checkbox).toBeInTheDocument();
    });
    (0, vitest_1.it)('is unchecked by default', () => {
        const { container } = (0, react_1.render)(<Checkbox_1.Checkbox />);
        const checkbox = container.querySelector('button[role="checkbox"]');
        (0, vitest_1.expect)(checkbox).toHaveAttribute('data-state', 'unchecked');
    });
    (0, vitest_1.it)('can be checked', async () => {
        const user = user_event_1.default.setup();
        const handleChange = vitest_1.vi.fn();
        const { container } = (0, react_1.render)(<Checkbox_1.Checkbox onCheckedChange={handleChange}/>);
        const checkbox = container.querySelector('button[role="checkbox"]');
        await user.click(checkbox);
        (0, vitest_1.expect)(handleChange).toHaveBeenCalledWith(true);
    });
    (0, vitest_1.it)('handles controlled checked state', () => {
        const { container, rerender } = (0, react_1.render)(<Checkbox_1.Checkbox checked={false}/>);
        const checkbox = container.querySelector('button[role="checkbox"]');
        (0, vitest_1.expect)(checkbox).toHaveAttribute('data-state', 'unchecked');
        rerender(<Checkbox_1.Checkbox checked={true}/>);
        (0, vitest_1.expect)(checkbox).toHaveAttribute('data-state', 'checked');
    });
    (0, vitest_1.it)('handles indeterminate state', () => {
        const { container } = (0, react_1.render)(<Checkbox_1.Checkbox checked="indeterminate"/>);
        const checkbox = container.querySelector('button[role="checkbox"]');
        (0, vitest_1.expect)(checkbox).toHaveAttribute('data-state', 'indeterminate');
    });
    (0, vitest_1.it)('applies size variants', () => {
        const { container: smContainer } = (0, react_1.render)(<Checkbox_1.Checkbox size="sm"/>);
        const { container: mdContainer } = (0, react_1.render)(<Checkbox_1.Checkbox size="md"/>);
        const { container: lgContainer } = (0, react_1.render)(<Checkbox_1.Checkbox size="lg"/>);
        (0, vitest_1.expect)(smContainer.querySelector('button')).toHaveClass('h-4 w-4');
        (0, vitest_1.expect)(mdContainer.querySelector('button')).toHaveClass('h-5 w-5');
        (0, vitest_1.expect)(lgContainer.querySelector('button')).toHaveClass('h-6 w-6');
    });
    (0, vitest_1.it)('is disabled when disabled prop is set', () => {
        const { container } = (0, react_1.render)(<Checkbox_1.Checkbox disabled/>);
        const checkbox = container.querySelector('button[role="checkbox"]');
        (0, vitest_1.expect)(checkbox).toBeDisabled();
    });
    (0, vitest_1.it)('does not trigger onChange when disabled', async () => {
        const user = user_event_1.default.setup();
        const handleChange = vitest_1.vi.fn();
        const { container } = (0, react_1.render)(<Checkbox_1.Checkbox disabled onCheckedChange={handleChange}/>);
        const checkbox = container.querySelector('button[role="checkbox"]');
        await user.click(checkbox);
        (0, vitest_1.expect)(handleChange).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('applies custom className', () => {
        const { container } = (0, react_1.render)(<Checkbox_1.Checkbox className="custom-class"/>);
        const checkbox = container.querySelector('button[role="checkbox"]');
        (0, vitest_1.expect)(checkbox).toHaveClass('custom-class');
    });
    (0, vitest_1.it)('forwards ref correctly', () => {
        const ref = vitest_1.vi.fn();
        (0, react_1.render)(<Checkbox_1.Checkbox ref={ref}/>);
        (0, vitest_1.expect)(ref).toHaveBeenCalled();
    });
    (0, vitest_1.it)('can be used with label', async () => {
        const user = user_event_1.default.setup();
        const handleChange = vitest_1.vi.fn();
        const { container } = (0, react_1.render)(<div>
        <Checkbox_1.Checkbox id="terms" onCheckedChange={handleChange}/>
        <label htmlFor="terms">Accept terms</label>
      </div>);
        const label = react_1.screen.getByText('Accept terms');
        await user.click(label);
        (0, vitest_1.expect)(handleChange).toHaveBeenCalledWith(true);
    });
    (0, vitest_1.it)('toggles between checked and unchecked', async () => {
        const user = user_event_1.default.setup();
        const { container } = (0, react_1.render)(<Checkbox_1.Checkbox />);
        const checkbox = container.querySelector('button[role="checkbox"]');
        (0, vitest_1.expect)(checkbox).toHaveAttribute('data-state', 'unchecked');
        await user.click(checkbox);
        (0, vitest_1.expect)(checkbox).toHaveAttribute('data-state', 'checked');
        await user.click(checkbox);
        (0, vitest_1.expect)(checkbox).toHaveAttribute('data-state', 'unchecked');
    });
    (0, vitest_1.it)('shows check icon when checked', () => {
        const { container } = (0, react_1.render)(<Checkbox_1.Checkbox checked={true}/>);
        const icon = container.querySelector('svg');
        (0, vitest_1.expect)(icon).toBeInTheDocument();
    });
    (0, vitest_1.it)('shows minus icon when indeterminate', () => {
        const { container } = (0, react_1.render)(<Checkbox_1.Checkbox checked="indeterminate"/>);
        const icon = container.querySelector('svg');
        (0, vitest_1.expect)(icon).toBeInTheDocument();
    });
    (0, vitest_1.it)('has proper ARIA attributes', () => {
        const { container } = (0, react_1.render)(<Checkbox_1.Checkbox aria-label="Accept terms"/>);
        const checkbox = container.querySelector('button[role="checkbox"]');
        (0, vitest_1.expect)(checkbox).toHaveAttribute('aria-label', 'Accept terms');
    });
    (0, vitest_1.it)('supports required attribute', () => {
        const { container } = (0, react_1.render)(<Checkbox_1.Checkbox required/>);
        const checkbox = container.querySelector('button[role="checkbox"]');
        (0, vitest_1.expect)(checkbox).toHaveAttribute('required');
    });
});
//# sourceMappingURL=Checkbox.test.jsx.map