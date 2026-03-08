"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const Select_1 = require("./Select");
(0, vitest_1.describe)('Select', () => {
    const options = [
        { value: 'apple', label: 'Apple' },
        { value: 'banana', label: 'Banana' },
        { value: 'orange', label: 'Orange' },
    ];
    (0, vitest_1.it)('renders with placeholder', () => {
        (0, react_1.render)(<Select_1.Select placeholder="Select a fruit" options={options}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Select a fruit')).toBeInTheDocument();
    });
    (0, vitest_1.it)('opens dropdown when clicked', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Select_1.Select placeholder="Select a fruit" options={options}/>);
        const trigger = react_1.screen.getByRole('combobox');
        await user.click(trigger);
        (0, vitest_1.expect)(react_1.screen.getByText('Apple')).toBeVisible();
        (0, vitest_1.expect)(react_1.screen.getByText('Banana')).toBeVisible();
        (0, vitest_1.expect)(react_1.screen.getByText('Orange')).toBeVisible();
    });
    (0, vitest_1.it)('selects an option', async () => {
        const user = user_event_1.default.setup();
        const handleChange = vitest_1.vi.fn();
        (0, react_1.render)(<Select_1.Select placeholder="Select a fruit" options={options} onValueChange={handleChange}/>);
        const trigger = react_1.screen.getByRole('combobox');
        await user.click(trigger);
        const appleOption = react_1.screen.getByText('Apple');
        await user.click(appleOption);
        (0, vitest_1.expect)(handleChange).toHaveBeenCalledWith('apple');
    });
    (0, vitest_1.it)('renders with default value', () => {
        (0, react_1.render)(<Select_1.Select placeholder="Select a fruit" options={options} defaultValue="banana"/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Banana')).toBeInTheDocument();
    });
    (0, vitest_1.it)('respects disabled options', async () => {
        const user = user_event_1.default.setup();
        const handleChange = vitest_1.vi.fn();
        const optionsWithDisabled = [
            { value: 'apple', label: 'Apple' },
            { value: 'banana', label: 'Banana', disabled: true },
        ];
        (0, react_1.render)(<Select_1.Select placeholder="Select a fruit" options={optionsWithDisabled} onValueChange={handleChange}/>);
        const trigger = react_1.screen.getByRole('combobox');
        await user.click(trigger);
        const bananaOption = react_1.screen.getByText('Banana');
        (0, vitest_1.expect)(bananaOption).toHaveAttribute('data-disabled', '');
    });
    (0, vitest_1.it)('applies variant styles', () => {
        const { rerender } = (0, react_1.render)(<Select_1.Select placeholder="Select" options={options} variant="outline"/>);
        let trigger = react_1.screen.getByRole('combobox');
        (0, vitest_1.expect)(trigger).toHaveClass('border-input');
        rerender(<Select_1.Select placeholder="Select" options={options} variant="filled"/>);
        trigger = react_1.screen.getByRole('combobox');
        (0, vitest_1.expect)(trigger).toHaveClass('bg-muted');
        rerender(<Select_1.Select placeholder="Select" options={options} variant="flushed"/>);
        trigger = react_1.screen.getByRole('combobox');
        (0, vitest_1.expect)(trigger).toHaveClass('border-b-2');
    });
    (0, vitest_1.it)('applies size variants', () => {
        const { rerender } = (0, react_1.render)(<Select_1.Select placeholder="Select" options={options} size="sm"/>);
        let trigger = react_1.screen.getByRole('combobox');
        (0, vitest_1.expect)(trigger).toHaveClass('h-8');
        rerender(<Select_1.Select placeholder="Select" options={options} size="md"/>);
        trigger = react_1.screen.getByRole('combobox');
        (0, vitest_1.expect)(trigger).toHaveClass('h-10');
        rerender(<Select_1.Select placeholder="Select" options={options} size="lg"/>);
        trigger = react_1.screen.getByRole('combobox');
        (0, vitest_1.expect)(trigger).toHaveClass('h-12');
    });
    (0, vitest_1.it)('applies error state', () => {
        (0, react_1.render)(<Select_1.Select placeholder="Select" options={options} state="error"/>);
        const trigger = react_1.screen.getByRole('combobox');
        (0, vitest_1.expect)(trigger).toHaveClass('border-destructive');
    });
    (0, vitest_1.it)('applies success state', () => {
        (0, react_1.render)(<Select_1.Select placeholder="Select" options={options} state="success"/>);
        const trigger = react_1.screen.getByRole('combobox');
        (0, vitest_1.expect)(trigger).toHaveClass('border-green-500');
    });
    (0, vitest_1.it)('supports keyboard navigation', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Select_1.Select placeholder="Select a fruit" options={options}/>);
        const trigger = react_1.screen.getByRole('combobox');
        trigger.focus();
        await user.keyboard('{Enter}');
        (0, vitest_1.expect)(react_1.screen.getByText('Apple')).toBeVisible();
        await user.keyboard('{ArrowDown}');
        await user.keyboard('{Enter}');
    });
});
//# sourceMappingURL=Select.test.jsx.map