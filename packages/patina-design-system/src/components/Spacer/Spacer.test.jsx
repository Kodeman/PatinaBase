"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const vitest_axe_1 = require("vitest-axe");
const Spacer_1 = require("./Spacer");
describe('Spacer', () => {
    it('renders correctly', () => {
        const { container } = (0, react_1.render)(<Spacer_1.Spacer />);
        expect(container.firstChild).toBeInTheDocument();
    });
    it('renders as div by default', () => {
        const { container } = (0, react_1.render)(<Spacer_1.Spacer />);
        expect(container.firstChild?.nodeName).toBe('DIV');
    });
    it('renders as different element when "as" prop is provided', () => {
        const { container } = (0, react_1.render)(<Spacer_1.Spacer as="span"/>);
        expect(container.firstChild?.nodeName).toBe('SPAN');
    });
    it('has aria-hidden attribute', () => {
        const { container } = (0, react_1.render)(<Spacer_1.Spacer />);
        expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    });
    it('applies vertical spacing by default', () => {
        const { container } = (0, react_1.render)(<Spacer_1.Spacer size="md"/>);
        const element = container.firstChild;
        expect(element.style.height).toBe('1rem');
        expect(element).toHaveClass('block');
    });
    it('applies horizontal spacing when axis is horizontal', () => {
        const { container } = (0, react_1.render)(<Spacer_1.Spacer axis="horizontal" size="md"/>);
        const element = container.firstChild;
        expect(element.style.width).toBe('1rem');
        expect(element).toHaveClass('inline-block');
    });
    it('applies correct size for xs', () => {
        const { container } = (0, react_1.render)(<Spacer_1.Spacer size="xs"/>);
        const element = container.firstChild;
        expect(element.style.height).toBe('0.25rem');
    });
    it('applies correct size for sm', () => {
        const { container } = (0, react_1.render)(<Spacer_1.Spacer size="sm"/>);
        const element = container.firstChild;
        expect(element.style.height).toBe('0.5rem');
    });
    it('applies correct size for md', () => {
        const { container } = (0, react_1.render)(<Spacer_1.Spacer size="md"/>);
        const element = container.firstChild;
        expect(element.style.height).toBe('1rem');
    });
    it('applies correct size for lg', () => {
        const { container } = (0, react_1.render)(<Spacer_1.Spacer size="lg"/>);
        const element = container.firstChild;
        expect(element.style.height).toBe('1.5rem');
    });
    it('applies correct size for xl', () => {
        const { container } = (0, react_1.render)(<Spacer_1.Spacer size="xl"/>);
        const element = container.firstChild;
        expect(element.style.height).toBe('2rem');
    });
    it('applies correct size for 2xl', () => {
        const { container } = (0, react_1.render)(<Spacer_1.Spacer size="2xl"/>);
        const element = container.firstChild;
        expect(element.style.height).toBe('3rem');
    });
    it('applies flexShrink: 0', () => {
        const { container } = (0, react_1.render)(<Spacer_1.Spacer />);
        const element = container.firstChild;
        expect(element.style.flexShrink).toBe('0');
    });
    it('applies custom className', () => {
        const { container } = (0, react_1.render)(<Spacer_1.Spacer className="custom-class"/>);
        expect(container.firstChild).toHaveClass('custom-class');
    });
    it('forwards ref correctly', () => {
        const ref = { current: null };
        (0, react_1.render)(<Spacer_1.Spacer ref={ref}/>);
        expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
    it('supports HTML attributes', () => {
        (0, react_1.render)(<Spacer_1.Spacer data-testid="test-spacer"/>);
        const spacer = react_1.screen.getByTestId('test-spacer');
        expect(spacer).toBeInTheDocument();
    });
    it('merges custom styles with component styles', () => {
        const { container } = (0, react_1.render)(<Spacer_1.Spacer size="lg" style={{ backgroundColor: 'red' }}/>);
        const element = container.firstChild;
        expect(element.style.height).toBe('1.5rem');
        expect(element.style.backgroundColor).toBe('red');
        expect(element.style.flexShrink).toBe('0');
    });
    it('works in vertical layout', () => {
        const { container } = (0, react_1.render)(<div>
        <div>Item 1</div>
        <Spacer_1.Spacer size="lg"/>
        <div>Item 2</div>
      </div>);
        const spacer = container.querySelector('div > div:nth-child(2)');
        expect(spacer.style.height).toBe('1.5rem');
    });
    it('works in horizontal layout', () => {
        const { container } = (0, react_1.render)(<div style={{ display: 'flex' }}>
        <div>Item 1</div>
        <Spacer_1.Spacer axis="horizontal" size="lg"/>
        <div>Item 2</div>
      </div>);
        const spacer = container.querySelector('div > div:nth-child(2)');
        expect(spacer.style.width).toBe('1.5rem');
    });
    it('has no accessibility violations', async () => {
        const { container } = (0, react_1.render)(<Spacer_1.Spacer size="lg"/>);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
});
//# sourceMappingURL=Spacer.test.jsx.map