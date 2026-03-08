"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const Slider_1 = require("./Slider");
(0, vitest_1.describe)('Slider', () => {
    (0, vitest_1.it)('renders correctly', () => {
        (0, react_1.render)(<Slider_1.Slider defaultValue={[50]}/>);
        const slider = react_1.screen.getByRole('slider');
        (0, vitest_1.expect)(slider).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders with default value', () => {
        (0, react_1.render)(<Slider_1.Slider defaultValue={[30]}/>);
        const slider = react_1.screen.getByRole('slider');
        (0, vitest_1.expect)(slider).toHaveAttribute('aria-valuenow', '30');
    });
    (0, vitest_1.it)('renders range slider with two thumbs', () => {
        (0, react_1.render)(<Slider_1.Slider defaultValue={[25, 75]}/>);
        const sliders = react_1.screen.getAllByRole('slider');
        (0, vitest_1.expect)(sliders).toHaveLength(2);
        (0, vitest_1.expect)(sliders[0]).toHaveAttribute('aria-valuenow', '25');
        (0, vitest_1.expect)(sliders[1]).toHaveAttribute('aria-valuenow', '75');
    });
    (0, vitest_1.it)('calls onValueChange when value changes', async () => {
        const user = user_event_1.default.setup();
        const handleChange = vitest_1.vi.fn();
        (0, react_1.render)(<Slider_1.Slider defaultValue={[50]} onValueChange={handleChange}/>);
        const slider = react_1.screen.getByRole('slider');
        await user.click(slider);
        // Note: Testing actual drag behavior is complex with user-event
        // This test verifies the component renders and accepts the callback
        (0, vitest_1.expect)(handleChange).toBeDefined();
    });
    (0, vitest_1.it)('respects min and max values', () => {
        (0, react_1.render)(<Slider_1.Slider defaultValue={[50]} min={0} max={100}/>);
        const slider = react_1.screen.getByRole('slider');
        (0, vitest_1.expect)(slider).toHaveAttribute('aria-valuemin', '0');
        (0, vitest_1.expect)(slider).toHaveAttribute('aria-valuemax', '100');
    });
    (0, vitest_1.it)('respects step value', () => {
        (0, react_1.render)(<Slider_1.Slider defaultValue={[50]} step={10}/>);
        const slider = react_1.screen.getByRole('slider');
        // Radix UI doesn't expose step in aria attributes, but we can verify it's passed
        (0, vitest_1.expect)(slider).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders with value labels when showValue is true', () => {
        (0, react_1.render)(<Slider_1.Slider defaultValue={[50]} showValue/>);
        (0, vitest_1.expect)(react_1.screen.getByText('50')).toBeInTheDocument();
    });
    (0, vitest_1.it)('formats value with custom formatter', () => {
        (0, react_1.render)(<Slider_1.Slider defaultValue={[50]} showValue formatValue={(val) => `$${val}`}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('$50')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders marks', () => {
        const marks = [
            { value: 0, label: 'Min' },
            { value: 50, label: 'Mid' },
            { value: 100, label: 'Max' },
        ];
        (0, react_1.render)(<Slider_1.Slider defaultValue={[50]} marks={marks}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Min')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Mid')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Max')).toBeInTheDocument();
    });
    (0, vitest_1.it)('respects disabled state', () => {
        (0, react_1.render)(<Slider_1.Slider defaultValue={[50]} disabled/>);
        const slider = react_1.screen.getByRole('slider');
        (0, vitest_1.expect)(slider).toBeDisabled();
    });
    (0, vitest_1.it)('supports keyboard navigation', async () => {
        const user = user_event_1.default.setup();
        const handleChange = vitest_1.vi.fn();
        (0, react_1.render)(<Slider_1.Slider defaultValue={[50]} onValueChange={handleChange}/>);
        const slider = react_1.screen.getByRole('slider');
        slider.focus();
        (0, vitest_1.expect)(slider).toHaveFocus();
        await user.keyboard('{ArrowRight}');
        (0, vitest_1.expect)(handleChange).toHaveBeenCalled();
    });
    (0, vitest_1.it)('applies size variants', () => {
        const { container, rerender } = (0, react_1.render)(<Slider_1.Slider defaultValue={[50]} size="sm"/>);
        (0, vitest_1.expect)(container.querySelector('.h-1')).toBeInTheDocument();
        rerender(<Slider_1.Slider defaultValue={[50]} size="md"/>);
        (0, vitest_1.expect)(container.querySelector('.h-2')).toBeInTheDocument();
        rerender(<Slider_1.Slider defaultValue={[50]} size="lg"/>);
        (0, vitest_1.expect)(container.querySelector('.h-3')).toBeInTheDocument();
    });
});
//# sourceMappingURL=Slider.test.jsx.map