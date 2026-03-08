"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const PinInput_1 = require("./PinInput");
(0, vitest_1.describe)('PinInput', () => {
    (0, vitest_1.it)('renders correct number of inputs', () => {
        (0, react_1.render)(<PinInput_1.PinInput length={4}/>);
        const inputs = react_1.screen.getAllByRole('textbox');
        (0, vitest_1.expect)(inputs).toHaveLength(4);
    });
    (0, vitest_1.it)('renders with custom length', () => {
        (0, react_1.render)(<PinInput_1.PinInput length={6}/>);
        const inputs = react_1.screen.getAllByRole('textbox');
        (0, vitest_1.expect)(inputs).toHaveLength(6);
    });
    (0, vitest_1.it)('auto-focuses first input when autoFocus is true', () => {
        (0, react_1.render)(<PinInput_1.PinInput length={4} autoFocus/>);
        const inputs = react_1.screen.getAllByRole('textbox');
        (0, vitest_1.expect)(inputs[0]).toHaveFocus();
    });
    (0, vitest_1.it)('moves to next input after entering a digit', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<PinInput_1.PinInput length={4} type="number"/>);
        const inputs = react_1.screen.getAllByRole('textbox');
        await user.type(inputs[0], '1');
        (0, vitest_1.expect)(inputs[1]).toHaveFocus();
    });
    (0, vitest_1.it)('calls onChange when value changes', async () => {
        const user = user_event_1.default.setup();
        const handleChange = vitest_1.vi.fn();
        (0, react_1.render)(<PinInput_1.PinInput length={4} onChange={handleChange}/>);
        const inputs = react_1.screen.getAllByRole('textbox');
        await user.type(inputs[0], '1');
        (0, vitest_1.expect)(handleChange).toHaveBeenCalledWith('1');
    });
    (0, vitest_1.it)('calls onComplete when all fields are filled', async () => {
        const user = user_event_1.default.setup();
        const handleComplete = vitest_1.vi.fn();
        (0, react_1.render)(<PinInput_1.PinInput length={4} type="number" onComplete={handleComplete}/>);
        const inputs = react_1.screen.getAllByRole('textbox');
        await user.type(inputs[0], '1');
        await user.type(inputs[1], '2');
        await user.type(inputs[2], '3');
        await user.type(inputs[3], '4');
        (0, vitest_1.expect)(handleComplete).toHaveBeenCalledWith('1234');
    });
    (0, vitest_1.it)('handles backspace navigation', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<PinInput_1.PinInput length={4} type="number"/>);
        const inputs = react_1.screen.getAllByRole('textbox');
        await user.type(inputs[0], '1');
        (0, vitest_1.expect)(inputs[1]).toHaveFocus();
        await user.keyboard('{Backspace}');
        (0, vitest_1.expect)(inputs[0]).toHaveFocus();
    });
    (0, vitest_1.it)('handles paste with allowPaste enabled', async () => {
        const user = user_event_1.default.setup();
        const handleComplete = vitest_1.vi.fn();
        (0, react_1.render)(<PinInput_1.PinInput length={4} type="number" onComplete={handleComplete} allowPaste/>);
        const inputs = react_1.screen.getAllByRole('textbox');
        inputs[0].focus();
        await user.paste('1234');
        (0, vitest_1.expect)(handleComplete).toHaveBeenCalledWith('1234');
    });
    (0, vitest_1.it)('filters non-numeric input when type is number', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<PinInput_1.PinInput length={4} type="number"/>);
        const inputs = react_1.screen.getAllByRole('textbox');
        await user.type(inputs[0], 'a');
        (0, vitest_1.expect)(inputs[0]).toHaveValue('');
    });
    (0, vitest_1.it)('accepts text input when type is text', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<PinInput_1.PinInput length={4} type="text"/>);
        const inputs = react_1.screen.getAllByRole('textbox');
        await user.type(inputs[0], 'A');
        (0, vitest_1.expect)(inputs[0]).toHaveValue('A');
    });
    (0, vitest_1.it)('masks input when mask is true', () => {
        (0, react_1.render)(<PinInput_1.PinInput length={4} mask/>);
        const inputs = react_1.screen.getAllByRole('textbox');
        inputs.forEach((input) => {
            (0, vitest_1.expect)(input).toHaveAttribute('type', 'password');
        });
    });
    (0, vitest_1.it)('respects disabled state', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<PinInput_1.PinInput length={4} disabled/>);
        const inputs = react_1.screen.getAllByRole('textbox');
        await user.type(inputs[0], '1');
        (0, vitest_1.expect)(inputs[0]).toBeDisabled();
        (0, vitest_1.expect)(inputs[0]).toHaveValue('');
    });
    (0, vitest_1.it)('supports arrow key navigation', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<PinInput_1.PinInput length={4}/>);
        const inputs = react_1.screen.getAllByRole('textbox');
        inputs[0].focus();
        await user.keyboard('{ArrowRight}');
        (0, vitest_1.expect)(inputs[1]).toHaveFocus();
        await user.keyboard('{ArrowLeft}');
        (0, vitest_1.expect)(inputs[0]).toHaveFocus();
    });
    (0, vitest_1.it)('applies variant styles', () => {
        const { rerender } = (0, react_1.render)(<PinInput_1.PinInput length={4} variant="outline"/>);
        let inputs = react_1.screen.getAllByRole('textbox');
        (0, vitest_1.expect)(inputs[0]).toHaveClass('border-input');
        rerender(<PinInput_1.PinInput length={4} variant="filled"/>);
        inputs = react_1.screen.getAllByRole('textbox');
        (0, vitest_1.expect)(inputs[0]).toHaveClass('bg-muted');
    });
    (0, vitest_1.it)('applies size variants', () => {
        const { rerender } = (0, react_1.render)(<PinInput_1.PinInput length={4} size="sm"/>);
        let inputs = react_1.screen.getAllByRole('textbox');
        (0, vitest_1.expect)(inputs[0]).toHaveClass('h-10', 'w-10');
        rerender(<PinInput_1.PinInput length={4} size="md"/>);
        inputs = react_1.screen.getAllByRole('textbox');
        (0, vitest_1.expect)(inputs[0]).toHaveClass('h-12', 'w-12');
        rerender(<PinInput_1.PinInput length={4} size="lg"/>);
        inputs = react_1.screen.getAllByRole('textbox');
        (0, vitest_1.expect)(inputs[0]).toHaveClass('h-14', 'w-14');
    });
    (0, vitest_1.it)('applies error state', () => {
        (0, react_1.render)(<PinInput_1.PinInput length={4} state="error"/>);
        const inputs = react_1.screen.getAllByRole('textbox');
        (0, vitest_1.expect)(inputs[0]).toHaveClass('border-destructive');
    });
});
//# sourceMappingURL=PinInput.test.jsx.map