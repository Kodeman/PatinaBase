"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const Label_1 = require("./Label");
(0, vitest_1.describe)('Label', () => {
    (0, vitest_1.it)('renders correctly', () => {
        (0, react_1.render)(<Label_1.Label>Test Label</Label_1.Label>);
        (0, vitest_1.expect)(react_1.screen.getByText('Test Label')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders with htmlFor attribute', () => {
        (0, react_1.render)(<Label_1.Label htmlFor="input-id">Test Label</Label_1.Label>);
        const label = react_1.screen.getByText('Test Label');
        (0, vitest_1.expect)(label).toHaveAttribute('for', 'input-id');
    });
    (0, vitest_1.it)('shows required indicator when required is true', () => {
        const { container } = (0, react_1.render)(<Label_1.Label required>Required Field</Label_1.Label>);
        const label = container.querySelector('label');
        (0, vitest_1.expect)(label).toHaveClass("after:content-['*']");
    });
    (0, vitest_1.it)('shows optional indicator when optional is true', () => {
        const { container } = (0, react_1.render)(<Label_1.Label optional>Optional Field</Label_1.Label>);
        const label = container.querySelector('label');
        (0, vitest_1.expect)(label).toHaveClass("after:content-['(optional)']");
    });
    (0, vitest_1.it)('does not show required indicator by default', () => {
        const { container } = (0, react_1.render)(<Label_1.Label>Default Label</Label_1.Label>);
        const label = container.querySelector('label');
        (0, vitest_1.expect)(label).not.toHaveClass("after:content-['*']");
    });
    (0, vitest_1.it)('applies custom className', () => {
        (0, react_1.render)(<Label_1.Label className="custom-class">Test Label</Label_1.Label>);
        const label = react_1.screen.getByText('Test Label');
        (0, vitest_1.expect)(label).toHaveClass('custom-class');
    });
    (0, vitest_1.it)('forwards all props to underlying element', () => {
        (0, react_1.render)(<Label_1.Label data-testid="label" id="custom-id">
        Test Label
      </Label_1.Label>);
        const label = react_1.screen.getByTestId('label');
        (0, vitest_1.expect)(label).toHaveAttribute('id', 'custom-id');
    });
    (0, vitest_1.it)('renders as label element', () => {
        const { container } = (0, react_1.render)(<Label_1.Label>Test Label</Label_1.Label>);
        const label = container.querySelector('label');
        (0, vitest_1.expect)(label).toBeInTheDocument();
    });
    (0, vitest_1.it)('maintains accessibility with htmlFor', () => {
        const { container } = (0, react_1.render)(<div>
        <Label_1.Label htmlFor="test-input">Test Label</Label_1.Label>
        <input id="test-input"/>
      </div>);
        const label = container.querySelector('label');
        const input = container.querySelector('input');
        (0, vitest_1.expect)(label).toHaveAttribute('for', 'test-input');
        (0, vitest_1.expect)(input).toHaveAttribute('id', 'test-input');
    });
});
//# sourceMappingURL=Label.test.jsx.map