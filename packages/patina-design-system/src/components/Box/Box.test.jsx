"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const vitest_axe_1 = require("vitest-axe");
const Box_1 = require("./Box");
describe('Box', () => {
    it('renders children correctly', () => {
        (0, react_1.render)(<Box_1.Box>Test content</Box_1.Box>);
        expect(react_1.screen.getByText('Test content')).toBeInTheDocument();
    });
    it('renders as div by default', () => {
        const { container } = (0, react_1.render)(<Box_1.Box>Content</Box_1.Box>);
        expect(container.firstChild?.nodeName).toBe('DIV');
    });
    it('renders as different element when "as" prop is provided', () => {
        const { container } = (0, react_1.render)(<Box_1.Box as="section">Content</Box_1.Box>);
        expect(container.firstChild?.nodeName).toBe('SECTION');
    });
    it('applies custom className', () => {
        const { container } = (0, react_1.render)(<Box_1.Box className="custom-class">Content</Box_1.Box>);
        expect(container.firstChild).toHaveClass('custom-class');
    });
    it('forwards ref correctly', () => {
        const ref = { current: null };
        (0, react_1.render)(<Box_1.Box ref={ref}>Content</Box_1.Box>);
        expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
    it('supports HTML attributes', () => {
        (0, react_1.render)(<Box_1.Box data-testid="test-box" aria-label="Test label">
        Content
      </Box_1.Box>);
        const box = react_1.screen.getByTestId('test-box');
        expect(box).toHaveAttribute('aria-label', 'Test label');
    });
    it('has no accessibility violations', async () => {
        const { container } = (0, react_1.render)(<Box_1.Box>Accessible content</Box_1.Box>);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
    it('uses asChild to compose with child element', () => {
        const { container } = (0, react_1.render)(<Box_1.Box asChild>
        <a href="/test">Link</a>
      </Box_1.Box>);
        const link = container.querySelector('a');
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/test');
    });
    it('merges classNames correctly when using asChild', () => {
        const { container } = (0, react_1.render)(<Box_1.Box asChild className="box-class">
        <a href="/test" className="link-class">
          Link
        </a>
      </Box_1.Box>);
        const link = container.querySelector('a');
        expect(link).toHaveClass('box-class');
        expect(link).toHaveClass('link-class');
    });
});
//# sourceMappingURL=Box.test.jsx.map