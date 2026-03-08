"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const Input_1 = require("./Input");
const lucide_react_1 = require("lucide-react");
(0, vitest_1.describe)('Input', () => {
    (0, vitest_1.it)('renders correctly', () => {
        (0, react_1.render)(<Input_1.Input placeholder="Enter text"/>);
        (0, vitest_1.expect)(react_1.screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
    });
    (0, vitest_1.it)('accepts different types', () => {
        const { rerender } = (0, react_1.render)(<Input_1.Input type="email" data-testid="input"/>);
        (0, vitest_1.expect)(react_1.screen.getByTestId('input')).toHaveAttribute('type', 'email');
        rerender(<Input_1.Input type="number" data-testid="input"/>);
        (0, vitest_1.expect)(react_1.screen.getByTestId('input')).toHaveAttribute('type', 'number');
    });
    (0, vitest_1.it)('applies variant classes', () => {
        const { container } = (0, react_1.render)(<Input_1.Input variant="filled"/>);
        const input = container.querySelector('input');
        (0, vitest_1.expect)(input).toHaveClass('bg-muted');
    });
    (0, vitest_1.it)('applies size classes', () => {
        const { container } = (0, react_1.render)(<Input_1.Input size="lg"/>);
        const input = container.querySelector('input');
        (0, vitest_1.expect)(input).toHaveClass('h-12');
    });
    (0, vitest_1.it)('applies state classes', () => {
        const { container } = (0, react_1.render)(<Input_1.Input state="error"/>);
        const input = container.querySelector('input');
        (0, vitest_1.expect)(input).toHaveClass('border-destructive');
    });
    (0, vitest_1.it)('renders with left icon', () => {
        const { container } = (0, react_1.render)(<Input_1.Input leftIcon={<lucide_react_1.Mail data-testid="mail-icon"/>}/>);
        (0, vitest_1.expect)(react_1.screen.getByTestId('mail-icon')).toBeInTheDocument();
        const input = container.querySelector('input');
        (0, vitest_1.expect)(input).toHaveClass('pl-10');
    });
    (0, vitest_1.it)('renders with right icon', () => {
        const { container } = (0, react_1.render)(<Input_1.Input rightIcon={<lucide_react_1.Mail data-testid="mail-icon"/>}/>);
        (0, vitest_1.expect)(react_1.screen.getByTestId('mail-icon')).toBeInTheDocument();
        const input = container.querySelector('input');
        (0, vitest_1.expect)(input).toHaveClass('pr-10');
    });
    (0, vitest_1.it)('shows search icon for search type', () => {
        (0, react_1.render)(<Input_1.Input type="search"/>);
        const searchIcon = document.querySelector('svg');
        (0, vitest_1.expect)(searchIcon).toBeInTheDocument();
    });
    (0, vitest_1.it)('handles password visibility toggle', async () => {
        const user = user_event_1.default.setup();
        const { container } = (0, react_1.render)(<Input_1.Input type="password" defaultValue="secret"/>);
        const input = container.querySelector('input');
        (0, vitest_1.expect)(input).toHaveAttribute('type', 'password');
        const toggleButton = react_1.screen.getByLabelText('Show password');
        await user.click(toggleButton);
        (0, vitest_1.expect)(input).toHaveAttribute('type', 'text');
        (0, vitest_1.expect)(react_1.screen.getByLabelText('Hide password')).toBeInTheDocument();
    });
    (0, vitest_1.it)('shows clear button when clearable and has value', async () => {
        const user = user_event_1.default.setup();
        const onClear = vitest_1.vi.fn();
        (0, react_1.render)(<Input_1.Input clearable onClear={onClear} defaultValue="test"/>);
        const clearButton = react_1.screen.getByLabelText('Clear input');
        (0, vitest_1.expect)(clearButton).toBeInTheDocument();
        await user.click(clearButton);
        (0, vitest_1.expect)(onClear).toHaveBeenCalled();
    });
    (0, vitest_1.it)('does not show clear button when empty', () => {
        (0, react_1.render)(<Input_1.Input clearable/>);
        (0, vitest_1.expect)(react_1.screen.queryByLabelText('Clear input')).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('shows character counter when enabled', () => {
        (0, react_1.render)(<Input_1.Input showCount maxLength={10} defaultValue="test"/>);
        (0, vitest_1.expect)(react_1.screen.getByText('4/10')).toBeInTheDocument();
    });
    (0, vitest_1.it)('updates character counter on input', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Input_1.Input showCount maxLength={10} data-testid="input"/>);
        const input = react_1.screen.getByTestId('input');
        await user.type(input, 'hello');
        (0, vitest_1.expect)(react_1.screen.getByText('5/10')).toBeInTheDocument();
    });
    (0, vitest_1.it)('is disabled when disabled prop is set', () => {
        const { container } = (0, react_1.render)(<Input_1.Input disabled/>);
        const input = container.querySelector('input');
        (0, vitest_1.expect)(input).toBeDisabled();
    });
    (0, vitest_1.it)('is readonly when readonly prop is set', () => {
        const { container } = (0, react_1.render)(<Input_1.Input readOnly/>);
        const input = container.querySelector('input');
        (0, vitest_1.expect)(input).toHaveAttribute('readonly');
    });
    (0, vitest_1.it)('respects maxLength attribute', () => {
        const { container } = (0, react_1.render)(<Input_1.Input maxLength={5}/>);
        const input = container.querySelector('input');
        (0, vitest_1.expect)(input).toHaveAttribute('maxLength', '5');
    });
    (0, vitest_1.it)('forwards ref correctly', () => {
        const ref = vitest_1.vi.fn();
        (0, react_1.render)(<Input_1.Input ref={ref}/>);
        (0, vitest_1.expect)(ref).toHaveBeenCalled();
    });
    (0, vitest_1.it)('handles onChange event', async () => {
        const user = user_event_1.default.setup();
        const handleChange = vitest_1.vi.fn();
        (0, react_1.render)(<Input_1.Input onChange={handleChange} data-testid="input"/>);
        const input = react_1.screen.getByTestId('input');
        await user.type(input, 'test');
        (0, vitest_1.expect)(handleChange).toHaveBeenCalled();
    });
    (0, vitest_1.it)('combines password toggle and clear button', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Input_1.Input type="password" clearable defaultValue="secret"/>);
        (0, vitest_1.expect)(react_1.screen.getByLabelText('Show password')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByLabelText('Clear input')).toBeInTheDocument();
    });
    (0, vitest_1.it)('applies custom className', () => {
        const { container } = (0, react_1.render)(<Input_1.Input className="custom-class"/>);
        const input = container.querySelector('input');
        (0, vitest_1.expect)(input).toHaveClass('custom-class');
    });
    (0, vitest_1.it)('applies wrapperClassName when icons are present', () => {
        const { container } = (0, react_1.render)(<Input_1.Input leftIcon={<lucide_react_1.Mail />} wrapperClassName="custom-wrapper"/>);
        const wrapper = container.querySelector('.custom-wrapper');
        (0, vitest_1.expect)(wrapper).toBeInTheDocument();
    });
});
//# sourceMappingURL=Input.test.jsx.map