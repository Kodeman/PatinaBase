"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const Switch_1 = require("./Switch");
(0, vitest_1.describe)('Switch', () => {
    (0, vitest_1.it)('renders correctly', () => {
        (0, react_1.render)(<Switch_1.Switch />);
        const switchElement = react_1.screen.getByRole('switch');
        (0, vitest_1.expect)(switchElement).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders with label', () => {
        (0, react_1.render)(<Switch_1.Switch label="Enable notifications"/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Enable notifications')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders with label and description', () => {
        (0, react_1.render)(<Switch_1.Switch label="Enable notifications" description="Receive updates via email"/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Enable notifications')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Receive updates via email')).toBeInTheDocument();
    });
    (0, vitest_1.it)('handles checked state', () => {
        (0, react_1.render)(<Switch_1.Switch checked/>);
        const switchElement = react_1.screen.getByRole('switch');
        (0, vitest_1.expect)(switchElement).toHaveAttribute('data-state', 'checked');
    });
    (0, vitest_1.it)('handles unchecked state', () => {
        (0, react_1.render)(<Switch_1.Switch checked={false}/>);
        const switchElement = react_1.screen.getByRole('switch');
        (0, vitest_1.expect)(switchElement).toHaveAttribute('data-state', 'unchecked');
    });
    (0, vitest_1.it)('calls onCheckedChange when clicked', async () => {
        const user = user_event_1.default.setup();
        const handleChange = vitest_1.vi.fn();
        (0, react_1.render)(<Switch_1.Switch onCheckedChange={handleChange}/>);
        const switchElement = react_1.screen.getByRole('switch');
        await user.click(switchElement);
        (0, vitest_1.expect)(handleChange).toHaveBeenCalledWith(true);
    });
    (0, vitest_1.it)('respects disabled state', async () => {
        const user = user_event_1.default.setup();
        const handleChange = vitest_1.vi.fn();
        (0, react_1.render)(<Switch_1.Switch disabled onCheckedChange={handleChange}/>);
        const switchElement = react_1.screen.getByRole('switch');
        await user.click(switchElement);
        (0, vitest_1.expect)(handleChange).not.toHaveBeenCalled();
        (0, vitest_1.expect)(switchElement).toBeDisabled();
    });
    (0, vitest_1.it)('applies size variants', () => {
        const { rerender } = (0, react_1.render)(<Switch_1.Switch size="sm"/>);
        let switchElement = react_1.screen.getByRole('switch');
        (0, vitest_1.expect)(switchElement).toHaveClass('h-5', 'w-9');
        rerender(<Switch_1.Switch size="md"/>);
        switchElement = react_1.screen.getByRole('switch');
        (0, vitest_1.expect)(switchElement).toHaveClass('h-6', 'w-11');
        rerender(<Switch_1.Switch size="lg"/>);
        switchElement = react_1.screen.getByRole('switch');
        (0, vitest_1.expect)(switchElement).toHaveClass('h-7', 'w-14');
    });
    (0, vitest_1.it)('supports keyboard navigation', async () => {
        const user = user_event_1.default.setup();
        const handleChange = vitest_1.vi.fn();
        (0, react_1.render)(<Switch_1.Switch onCheckedChange={handleChange}/>);
        const switchElement = react_1.screen.getByRole('switch');
        switchElement.focus();
        (0, vitest_1.expect)(switchElement).toHaveFocus();
        await user.keyboard(' ');
        (0, vitest_1.expect)(handleChange).toHaveBeenCalled();
    });
    (0, vitest_1.it)('renders label on the left when labelPosition is left', () => {
        const { container } = (0, react_1.render)(<Switch_1.Switch label="Enable notifications" labelPosition="left"/>);
        const wrapper = container.firstChild;
        const label = react_1.screen.getByText('Enable notifications');
        const switchElement = react_1.screen.getByRole('switch');
        // Label should come before switch in DOM
        (0, vitest_1.expect)(wrapper.children[0]).toContain(label);
        (0, vitest_1.expect)(wrapper.children[1]).toBe(switchElement);
    });
});
//# sourceMappingURL=Switch.test.jsx.map