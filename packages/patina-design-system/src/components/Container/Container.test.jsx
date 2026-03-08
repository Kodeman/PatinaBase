"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const vitest_axe_1 = require("vitest-axe");
const Container_1 = require("./Container");
describe('Container', () => {
    it('renders children correctly', () => {
        (0, react_1.render)(<Container_1.Container>Test content</Container_1.Container>);
        expect(react_1.screen.getByText('Test content')).toBeInTheDocument();
    });
    it('applies default size variant', () => {
        const { container } = (0, react_1.render)(<Container_1.Container>Content</Container_1.Container>);
        expect(container.firstChild).toHaveClass('max-w-screen-xl');
    });
    it('applies custom size variant', () => {
        const { container } = (0, react_1.render)(<Container_1.Container size="md">Content</Container_1.Container>);
        expect(container.firstChild).toHaveClass('max-w-screen-md');
    });
    it('applies centering by default', () => {
        const { container } = (0, react_1.render)(<Container_1.Container>Content</Container_1.Container>);
        expect(container.firstChild).toHaveClass('mx-auto');
    });
    it('can disable centering', () => {
        const { container } = (0, react_1.render)(<Container_1.Container centered={false}>Content</Container_1.Container>);
        expect(container.firstChild).not.toHaveClass('mx-auto');
    });
    it('renders as different element when "as" prop is provided', () => {
        const { container } = (0, react_1.render)(<Container_1.Container as="section">Content</Container_1.Container>);
        expect(container.firstChild?.nodeName).toBe('SECTION');
    });
    it('applies custom className', () => {
        const { container } = (0, react_1.render)(<Container_1.Container className="custom-class">Content</Container_1.Container>);
        expect(container.firstChild).toHaveClass('custom-class');
    });
    it('forwards ref correctly', () => {
        const ref = { current: null };
        (0, react_1.render)(<Container_1.Container ref={ref}>Content</Container_1.Container>);
        expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
    it('has no accessibility violations', async () => {
        const { container } = (0, react_1.render)(<Container_1.Container>Accessible content</Container_1.Container>);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
});
//# sourceMappingURL=Container.test.jsx.map