"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const vitest_axe_1 = require("vitest-axe");
const Center_1 = require("./Center");
describe('Center', () => {
    it('renders children correctly', () => {
        (0, react_1.render)(<Center_1.Center>Centered content</Center_1.Center>);
        expect(react_1.screen.getByText('Centered content')).toBeInTheDocument();
    });
    it('renders as div by default', () => {
        const { container } = (0, react_1.render)(<Center_1.Center>Content</Center_1.Center>);
        expect(container.firstChild?.nodeName).toBe('DIV');
    });
    it('renders as different element when "as" prop is provided', () => {
        const { container } = (0, react_1.render)(<Center_1.Center as="section">Content</Center_1.Center>);
        expect(container.firstChild?.nodeName).toBe('SECTION');
    });
    it('applies flex centering classes by default', () => {
        const { container } = (0, react_1.render)(<Center_1.Center>Content</Center_1.Center>);
        expect(container.firstChild).toHaveClass('flex', 'items-center', 'justify-center');
    });
    it('applies inline-flex when inline is true', () => {
        const { container } = (0, react_1.render)(<Center_1.Center inline>Content</Center_1.Center>);
        expect(container.firstChild).toHaveClass('inline-flex', 'items-center', 'justify-center');
    });
    it('applies custom className', () => {
        const { container } = (0, react_1.render)(<Center_1.Center className="custom-class">Content</Center_1.Center>);
        expect(container.firstChild).toHaveClass('custom-class');
        expect(container.firstChild).toHaveClass('flex', 'items-center', 'justify-center');
    });
    it('forwards ref correctly', () => {
        const ref = { current: null };
        (0, react_1.render)(<Center_1.Center ref={ref}>Content</Center_1.Center>);
        expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
    it('supports HTML attributes', () => {
        (0, react_1.render)(<Center_1.Center data-testid="test-center" aria-label="Centered container">
        Content
      </Center_1.Center>);
        const center = react_1.screen.getByTestId('test-center');
        expect(center).toHaveAttribute('aria-label', 'Centered container');
    });
    it('centers content properly with height constraint', () => {
        const { container } = (0, react_1.render)(<Center_1.Center className="h-screen">
        <div>Vertically centered</div>
      </Center_1.Center>);
        expect(container.firstChild).toHaveClass('h-screen');
        expect(container.firstChild).toHaveClass('items-center');
        expect(react_1.screen.getByText('Vertically centered')).toBeInTheDocument();
    });
    it('works with inline content', () => {
        const { container } = (0, react_1.render)(<div>
        Text before <Center_1.Center inline className="w-20 h-20">Icon</Center_1.Center> text after
      </div>);
        const center = container.querySelector('.inline-flex');
        expect(center).toBeInTheDocument();
        expect(center).toHaveClass('w-20', 'h-20');
    });
    it('supports style prop', () => {
        const { container } = (0, react_1.render)(<Center_1.Center style={{ backgroundColor: 'red', width: '100px', height: '100px' }}>
        Content
      </Center_1.Center>);
        const element = container.firstChild;
        expect(element.style.backgroundColor).toBe('red');
        expect(element.style.width).toBe('100px');
        expect(element.style.height).toBe('100px');
    });
    it('has no accessibility violations', async () => {
        const { container } = (0, react_1.render)(<Center_1.Center>
        <button>Centered Button</button>
      </Center_1.Center>);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
    it('has no accessibility violations with inline', async () => {
        const { container } = (0, react_1.render)(<Center_1.Center inline>
        <span>Centered Span</span>
      </Center_1.Center>);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
});
//# sourceMappingURL=Center.test.jsx.map