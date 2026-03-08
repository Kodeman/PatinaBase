"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const vitest_axe_1 = require("vitest-axe");
const Divider_1 = require("./Divider");
describe('Divider', () => {
    it('renders correctly', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider />);
        const divider = container.querySelector('hr');
        expect(divider).toBeInTheDocument();
    });
    it('has separator role', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider />);
        const divider = container.querySelector('[role="separator"]');
        expect(divider).toBeInTheDocument();
    });
    it('applies horizontal orientation by default', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider />);
        const divider = container.querySelector('hr');
        expect(divider).toHaveClass('w-full', 'border-t');
        expect(divider).toHaveAttribute('aria-orientation', 'horizontal');
    });
    it('applies vertical orientation correctly', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider orientation="vertical"/>);
        const divider = container.querySelector('hr');
        expect(divider).toHaveClass('h-full', 'border-l');
        expect(divider).toHaveAttribute('aria-orientation', 'vertical');
    });
    it('applies solid variant by default', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider />);
        const divider = container.querySelector('hr');
        expect(divider).toHaveClass('border-solid');
    });
    it('applies dashed variant correctly', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider variant="dashed"/>);
        const divider = container.querySelector('hr');
        expect(divider).toHaveClass('border-dashed');
    });
    it('applies dotted variant correctly', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider variant="dotted"/>);
        const divider = container.querySelector('hr');
        expect(divider).toHaveClass('border-dotted');
    });
    it('applies thin thickness by default', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider />);
        const divider = container.querySelector('hr');
        expect(divider).toHaveClass('border-t');
    });
    it('applies medium thickness correctly', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider thickness="medium"/>);
        const divider = container.querySelector('hr');
        expect(divider).toHaveClass('border-t-2');
    });
    it('applies thick thickness correctly', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider thickness="thick"/>);
        const divider = container.querySelector('hr');
        expect(divider).toHaveClass('border-t-4');
    });
    it('applies vertical medium thickness correctly', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider orientation="vertical" thickness="medium"/>);
        const divider = container.querySelector('hr');
        expect(divider).toHaveClass('border-l-2');
    });
    it('applies spacing correctly for horizontal', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider spacing="md"/>);
        const divider = container.querySelector('hr');
        expect(divider).toHaveClass('my-4');
    });
    it('applies spacing correctly for vertical', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider orientation="vertical" spacing="md"/>);
        const divider = container.querySelector('hr');
        expect(divider).toHaveClass('mx-4');
    });
    it('applies custom className', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider className="custom-class"/>);
        const divider = container.querySelector('hr');
        expect(divider).toHaveClass('custom-class');
    });
    it('forwards ref correctly', () => {
        const ref = { current: null };
        (0, react_1.render)(<Divider_1.Divider ref={ref}/>);
        expect(ref.current).toBeInstanceOf(HTMLHRElement);
    });
    it('supports HTML attributes', () => {
        (0, react_1.render)(<Divider_1.Divider data-testid="test-divider"/>);
        const divider = react_1.screen.getByTestId('test-divider');
        expect(divider).toBeInTheDocument();
    });
    it('renders label in center by default', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider label="OR"/>);
        expect(react_1.screen.getByText('OR')).toBeInTheDocument();
        const wrapper = container.querySelector('[role="separator"]');
        expect(wrapper).toHaveClass('justify-center');
    });
    it('renders label on left when specified', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider label="Start" labelPosition="left"/>);
        expect(react_1.screen.getByText('Start')).toBeInTheDocument();
        const wrapper = container.querySelector('[role="separator"]');
        expect(wrapper).toHaveClass('justify-start');
    });
    it('renders label on right when specified', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider label="End" labelPosition="right"/>);
        expect(react_1.screen.getByText('End')).toBeInTheDocument();
        const wrapper = container.querySelector('[role="separator"]');
        expect(wrapper).toHaveClass('justify-end');
    });
    it('renders two hr elements when label is centered', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider label="OR"/>);
        const hrs = container.querySelectorAll('hr');
        expect(hrs).toHaveLength(2);
    });
    it('renders one hr element when label is on left', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider label="Start" labelPosition="left"/>);
        const hrs = container.querySelectorAll('hr');
        expect(hrs).toHaveLength(1);
    });
    it('renders one hr element when label is on right', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider label="End" labelPosition="right"/>);
        const hrs = container.querySelectorAll('hr');
        expect(hrs).toHaveLength(1);
    });
    it('applies label styling correctly', () => {
        (0, react_1.render)(<Divider_1.Divider label="OR"/>);
        const label = react_1.screen.getByText('OR');
        expect(label).toHaveClass('px-3', 'text-sm', 'text-muted-foreground', 'whitespace-nowrap');
    });
    it('ignores label for vertical dividers', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider orientation="vertical" label="Should not appear"/>);
        expect(react_1.screen.queryByText('Should not appear')).not.toBeInTheDocument();
        const hr = container.querySelector('hr');
        expect(hr).toBeInTheDocument();
    });
    it('combines multiple variants correctly', () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider variant="dashed" thickness="medium" spacing="lg"/>);
        const divider = container.querySelector('hr');
        expect(divider).toHaveClass('border-dashed', 'border-t-2', 'my-6');
    });
    it('has no accessibility violations', async () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider />);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
    it('has no accessibility violations with label', async () => {
        const { container } = (0, react_1.render)(<Divider_1.Divider label="OR"/>);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
});
//# sourceMappingURL=Divider.test.jsx.map