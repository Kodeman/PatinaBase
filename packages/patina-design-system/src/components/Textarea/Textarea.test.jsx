"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const Textarea_1 = require("./Textarea");
(0, vitest_1.describe)('Textarea', () => {
    (0, vitest_1.it)('renders correctly', () => {
        (0, react_1.render)(<Textarea_1.Textarea placeholder="Enter text"/>);
        (0, vitest_1.expect)(react_1.screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
    });
    (0, vitest_1.it)('applies variant classes', () => {
        const { container } = (0, react_1.render)(<Textarea_1.Textarea variant="filled"/>);
        const textarea = container.querySelector('textarea');
        (0, vitest_1.expect)(textarea).toHaveClass('bg-muted');
    });
    (0, vitest_1.it)('applies size classes', () => {
        const { container } = (0, react_1.render)(<Textarea_1.Textarea size="lg"/>);
        const textarea = container.querySelector('textarea');
        (0, vitest_1.expect)(textarea).toHaveClass('text-base');
    });
    (0, vitest_1.it)('applies resize classes', () => {
        const { container } = (0, react_1.render)(<Textarea_1.Textarea resize="horizontal"/>);
        const textarea = container.querySelector('textarea');
        (0, vitest_1.expect)(textarea).toHaveClass('resize-x');
    });
    (0, vitest_1.it)('applies state classes', () => {
        const { container } = (0, react_1.render)(<Textarea_1.Textarea state="error"/>);
        const textarea = container.querySelector('textarea');
        (0, vitest_1.expect)(textarea).toHaveClass('border-destructive');
    });
    (0, vitest_1.it)('shows character counter when enabled', () => {
        (0, react_1.render)(<Textarea_1.Textarea showCount maxLength={100} defaultValue="test"/>);
        (0, vitest_1.expect)(react_1.screen.getByText('4/100')).toBeInTheDocument();
    });
    (0, vitest_1.it)('updates character counter on input', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Textarea_1.Textarea showCount maxLength={100} data-testid="textarea"/>);
        const textarea = react_1.screen.getByTestId('textarea');
        await user.type(textarea, 'hello world');
        (0, vitest_1.expect)(react_1.screen.getByText('11/100')).toBeInTheDocument();
    });
    (0, vitest_1.it)('handles auto-resize', async () => {
        const user = user_event_1.default.setup();
        const { container } = (0, react_1.render)(<Textarea_1.Textarea autoResize data-testid="textarea"/>);
        const textarea = container.querySelector('textarea');
        const initialHeight = textarea.style.height;
        await user.type(textarea, 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
        // Height should be set (not empty)
        (0, vitest_1.expect)(textarea.style.height).toBeTruthy();
    });
    (0, vitest_1.it)('disables resize when autoResize is enabled', () => {
        const { container } = (0, react_1.render)(<Textarea_1.Textarea autoResize/>);
        const textarea = container.querySelector('textarea');
        (0, vitest_1.expect)(textarea).toHaveClass('resize-none');
    });
    (0, vitest_1.it)('is disabled when disabled prop is set', () => {
        const { container } = (0, react_1.render)(<Textarea_1.Textarea disabled/>);
        const textarea = container.querySelector('textarea');
        (0, vitest_1.expect)(textarea).toBeDisabled();
    });
    (0, vitest_1.it)('is readonly when readonly prop is set', () => {
        const { container } = (0, react_1.render)(<Textarea_1.Textarea readOnly/>);
        const textarea = container.querySelector('textarea');
        (0, vitest_1.expect)(textarea).toHaveAttribute('readonly');
    });
    (0, vitest_1.it)('respects maxLength attribute', () => {
        const { container } = (0, react_1.render)(<Textarea_1.Textarea maxLength={500}/>);
        const textarea = container.querySelector('textarea');
        (0, vitest_1.expect)(textarea).toHaveAttribute('maxLength', '500');
    });
    (0, vitest_1.it)('forwards ref correctly', () => {
        const ref = vitest_1.vi.fn();
        (0, react_1.render)(<Textarea_1.Textarea ref={ref}/>);
        (0, vitest_1.expect)(ref).toHaveBeenCalled();
    });
    (0, vitest_1.it)('handles onChange event', async () => {
        const user = user_event_1.default.setup();
        const handleChange = vitest_1.vi.fn();
        (0, react_1.render)(<Textarea_1.Textarea onChange={handleChange} data-testid="textarea"/>);
        const textarea = react_1.screen.getByTestId('textarea');
        await user.type(textarea, 'test');
        (0, vitest_1.expect)(handleChange).toHaveBeenCalled();
    });
    (0, vitest_1.it)('applies custom className', () => {
        const { container } = (0, react_1.render)(<Textarea_1.Textarea className="custom-class"/>);
        const textarea = container.querySelector('textarea');
        (0, vitest_1.expect)(textarea).toHaveClass('custom-class');
    });
    (0, vitest_1.it)('applies wrapperClassName when showCount is enabled', () => {
        const { container } = (0, react_1.render)(<Textarea_1.Textarea showCount maxLength={10} wrapperClassName="custom-wrapper"/>);
        const wrapper = container.querySelector('.custom-wrapper');
        (0, vitest_1.expect)(wrapper).toBeInTheDocument();
    });
    (0, vitest_1.it)('handles controlled value', async () => {
        const user = user_event_1.default.setup();
        const { rerender } = (0, react_1.render)(<Textarea_1.Textarea value="initial" onChange={() => { }}/>);
        (0, vitest_1.expect)(react_1.screen.getByDisplayValue('initial')).toBeInTheDocument();
        rerender(<Textarea_1.Textarea value="updated" onChange={() => { }}/>);
        (0, vitest_1.expect)(react_1.screen.getByDisplayValue('updated')).toBeInTheDocument();
    });
    (0, vitest_1.it)('combines showCount and autoResize', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Textarea_1.Textarea autoResize showCount maxLength={100} data-testid="textarea"/>);
        const textarea = react_1.screen.getByTestId('textarea');
        await user.type(textarea, 'test');
        (0, vitest_1.expect)(react_1.screen.getByText('4/100')).toBeInTheDocument();
        (0, vitest_1.expect)(textarea).toHaveClass('resize-none');
    });
});
//# sourceMappingURL=Textarea.test.jsx.map