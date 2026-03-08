"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const Radio_1 = require("./Radio");
(0, vitest_1.describe)('RadioGroup', () => {
    (0, vitest_1.it)('renders correctly', () => {
        const { container } = (0, react_1.render)(<Radio_1.RadioGroup>
        <Radio_1.Radio value="option1" id="option1"/>
        <Radio_1.Radio value="option2" id="option2"/>
      </Radio_1.RadioGroup>);
        (0, vitest_1.expect)(container.querySelector('[role="radiogroup"]')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders radio items', () => {
        const { container } = (0, react_1.render)(<Radio_1.RadioGroup>
        <Radio_1.Radio value="option1" id="option1"/>
        <Radio_1.Radio value="option2" id="option2"/>
      </Radio_1.RadioGroup>);
        const radios = container.querySelectorAll('[role="radio"]');
        (0, vitest_1.expect)(radios).toHaveLength(2);
    });
    (0, vitest_1.it)('handles value change', async () => {
        const user = user_event_1.default.setup();
        const handleChange = vitest_1.vi.fn();
        const { container } = (0, react_1.render)(<Radio_1.RadioGroup onValueChange={handleChange}>
        <Radio_1.Radio value="option1" id="option1"/>
        <Radio_1.Radio value="option2" id="option2"/>
      </Radio_1.RadioGroup>);
        const radio = container.querySelectorAll('[role="radio"]')[0];
        await user.click(radio);
        (0, vitest_1.expect)(handleChange).toHaveBeenCalledWith('option1');
    });
    (0, vitest_1.it)('handles controlled value', () => {
        const { container, rerender } = (0, react_1.render)(<Radio_1.RadioGroup value="option1">
        <Radio_1.Radio value="option1" id="option1"/>
        <Radio_1.Radio value="option2" id="option2"/>
      </Radio_1.RadioGroup>);
        const radios = container.querySelectorAll('[role="radio"]');
        (0, vitest_1.expect)(radios[0]).toHaveAttribute('data-state', 'checked');
        (0, vitest_1.expect)(radios[1]).toHaveAttribute('data-state', 'unchecked');
        rerender(<Radio_1.RadioGroup value="option2">
        <Radio_1.Radio value="option1" id="option1"/>
        <Radio_1.Radio value="option2" id="option2"/>
      </Radio_1.RadioGroup>);
        (0, vitest_1.expect)(radios[0]).toHaveAttribute('data-state', 'unchecked');
        (0, vitest_1.expect)(radios[1]).toHaveAttribute('data-state', 'checked');
    });
    (0, vitest_1.it)('applies vertical orientation by default', () => {
        const { container } = (0, react_1.render)(<Radio_1.RadioGroup>
        <Radio_1.Radio value="option1"/>
      </Radio_1.RadioGroup>);
        const group = container.querySelector('[role="radiogroup"]');
        (0, vitest_1.expect)(group).toHaveClass('grid-flow-row');
    });
    (0, vitest_1.it)('applies horizontal orientation', () => {
        const { container } = (0, react_1.render)(<Radio_1.RadioGroup orientation="horizontal">
        <Radio_1.Radio value="option1"/>
      </Radio_1.RadioGroup>);
        const group = container.querySelector('[role="radiogroup"]');
        (0, vitest_1.expect)(group).toHaveClass('grid-flow-col');
    });
    (0, vitest_1.it)('applies size variants to radio items', () => {
        const { container: smContainer } = (0, react_1.render)(<Radio_1.RadioGroup>
        <Radio_1.Radio value="option1" size="sm"/>
      </Radio_1.RadioGroup>);
        const { container: mdContainer } = (0, react_1.render)(<Radio_1.RadioGroup>
        <Radio_1.Radio value="option1" size="md"/>
      </Radio_1.RadioGroup>);
        const { container: lgContainer } = (0, react_1.render)(<Radio_1.RadioGroup>
        <Radio_1.Radio value="option1" size="lg"/>
      </Radio_1.RadioGroup>);
        (0, vitest_1.expect)(smContainer.querySelector('[role="radio"]')).toHaveClass('h-4 w-4');
        (0, vitest_1.expect)(mdContainer.querySelector('[role="radio"]')).toHaveClass('h-5 w-5');
        (0, vitest_1.expect)(lgContainer.querySelector('[role="radio"]')).toHaveClass('h-6 w-6');
    });
    (0, vitest_1.it)('disables radio when disabled prop is set', () => {
        const { container } = (0, react_1.render)(<Radio_1.RadioGroup>
        <Radio_1.Radio value="option1" disabled/>
      </Radio_1.RadioGroup>);
        const radio = container.querySelector('[role="radio"]');
        (0, vitest_1.expect)(radio).toBeDisabled();
    });
    (0, vitest_1.it)('does not trigger onChange when disabled', async () => {
        const user = user_event_1.default.setup();
        const handleChange = vitest_1.vi.fn();
        const { container } = (0, react_1.render)(<Radio_1.RadioGroup onValueChange={handleChange}>
        <Radio_1.Radio value="option1" disabled/>
      </Radio_1.RadioGroup>);
        const radio = container.querySelector('[role="radio"]');
        await user.click(radio);
        (0, vitest_1.expect)(handleChange).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('can be used with labels', async () => {
        const user = user_event_1.default.setup();
        const handleChange = vitest_1.vi.fn();
        (0, react_1.render)(<Radio_1.RadioGroup onValueChange={handleChange}>
        <div>
          <Radio_1.Radio value="option1" id="option1"/>
          <label htmlFor="option1">Option 1</label>
        </div>
      </Radio_1.RadioGroup>);
        const label = react_1.screen.getByText('Option 1');
        await user.click(label);
        (0, vitest_1.expect)(handleChange).toHaveBeenCalledWith('option1');
    });
    (0, vitest_1.it)('only allows one radio to be selected', async () => {
        const user = user_event_1.default.setup();
        const { container } = (0, react_1.render)(<Radio_1.RadioGroup>
        <Radio_1.Radio value="option1" id="option1"/>
        <Radio_1.Radio value="option2" id="option2"/>
      </Radio_1.RadioGroup>);
        const radios = container.querySelectorAll('[role="radio"]');
        await user.click(radios[0]);
        (0, vitest_1.expect)(radios[0]).toHaveAttribute('data-state', 'checked');
        (0, vitest_1.expect)(radios[1]).toHaveAttribute('data-state', 'unchecked');
        await user.click(radios[1]);
        (0, vitest_1.expect)(radios[0]).toHaveAttribute('data-state', 'unchecked');
        (0, vitest_1.expect)(radios[1]).toHaveAttribute('data-state', 'checked');
    });
    (0, vitest_1.it)('applies custom className to RadioGroup', () => {
        const { container } = (0, react_1.render)(<Radio_1.RadioGroup className="custom-class">
        <Radio_1.Radio value="option1"/>
      </Radio_1.RadioGroup>);
        const group = container.querySelector('[role="radiogroup"]');
        (0, vitest_1.expect)(group).toHaveClass('custom-class');
    });
    (0, vitest_1.it)('applies custom className to Radio', () => {
        const { container } = (0, react_1.render)(<Radio_1.RadioGroup>
        <Radio_1.Radio value="option1" className="custom-radio"/>
      </Radio_1.RadioGroup>);
        const radio = container.querySelector('[role="radio"]');
        (0, vitest_1.expect)(radio).toHaveClass('custom-radio');
    });
    (0, vitest_1.it)('forwards ref correctly for RadioGroup', () => {
        const ref = vitest_1.vi.fn();
        (0, react_1.render)(<Radio_1.RadioGroup ref={ref}>
        <Radio_1.Radio value="option1"/>
      </Radio_1.RadioGroup>);
        (0, vitest_1.expect)(ref).toHaveBeenCalled();
    });
    (0, vitest_1.it)('forwards ref correctly for Radio', () => {
        const ref = vitest_1.vi.fn();
        (0, react_1.render)(<Radio_1.RadioGroup>
        <Radio_1.Radio value="option1" ref={ref}/>
      </Radio_1.RadioGroup>);
        (0, vitest_1.expect)(ref).toHaveBeenCalled();
    });
    (0, vitest_1.it)('supports required attribute', () => {
        const { container } = (0, react_1.render)(<Radio_1.RadioGroup required>
        <Radio_1.Radio value="option1"/>
      </Radio_1.RadioGroup>);
        const group = container.querySelector('[role="radiogroup"]');
        // Radix UI's RadioGroup supports 'required' but it's applied as aria-required
        // The HTML 'required' attribute is not standard for radiogroup elements
        (0, vitest_1.expect)(group).toHaveAttribute('aria-required', 'true');
    });
    (0, vitest_1.it)('has proper ARIA attributes', () => {
        const { container } = (0, react_1.render)(<Radio_1.RadioGroup aria-label="Choose an option">
        <Radio_1.Radio value="option1"/>
      </Radio_1.RadioGroup>);
        const group = container.querySelector('[role="radiogroup"]');
        (0, vitest_1.expect)(group).toHaveAttribute('aria-label', 'Choose an option');
    });
});
//# sourceMappingURL=Radio.test.jsx.map