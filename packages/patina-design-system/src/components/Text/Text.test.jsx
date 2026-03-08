"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const vitest_axe_1 = require("vitest-axe");
const Text_1 = require("./Text");
describe('Text', () => {
    it('renders children correctly', () => {
        (0, react_1.render)(<Text_1.Text>Test text</Text_1.Text>);
        expect(react_1.screen.getByText('Test text')).toBeInTheDocument();
    });
    it('renders as p by default', () => {
        const { container } = (0, react_1.render)(<Text_1.Text>Text</Text_1.Text>);
        expect(container.firstChild?.nodeName).toBe('P');
    });
    it('renders as span when specified', () => {
        const { container } = (0, react_1.render)(<Text_1.Text as="span">Text</Text_1.Text>);
        expect(container.firstChild?.nodeName).toBe('SPAN');
    });
    it('renders as div when specified', () => {
        const { container } = (0, react_1.render)(<Text_1.Text as="div">Text</Text_1.Text>);
        expect(container.firstChild?.nodeName).toBe('DIV');
    });
    it('applies body variant by default', () => {
        const { container } = (0, react_1.render)(<Text_1.Text>Text</Text_1.Text>);
        expect(container.firstChild).toHaveClass('leading-relaxed');
    });
    it('applies caption variant correctly', () => {
        const { container } = (0, react_1.render)(<Text_1.Text variant="caption">Text</Text_1.Text>);
        expect(container.firstChild).toHaveClass('text-muted-foreground');
    });
    it('applies overline variant correctly', () => {
        const { container } = (0, react_1.render)(<Text_1.Text variant="overline">Text</Text_1.Text>);
        expect(container.firstChild).toHaveClass('uppercase', 'tracking-wider', 'text-muted-foreground');
    });
    it('applies label variant correctly', () => {
        const { container } = (0, react_1.render)(<Text_1.Text variant="label">Text</Text_1.Text>);
        expect(container.firstChild).toHaveClass('font-medium');
    });
    it('applies default size (md)', () => {
        const { container } = (0, react_1.render)(<Text_1.Text>Text</Text_1.Text>);
        expect(container.firstChild).toHaveClass('text-base');
    });
    it('applies custom size correctly', () => {
        const { container } = (0, react_1.render)(<Text_1.Text size="lg">Text</Text_1.Text>);
        expect(container.firstChild).toHaveClass('text-lg');
    });
    it('applies normal weight by default', () => {
        const { container } = (0, react_1.render)(<Text_1.Text>Text</Text_1.Text>);
        expect(container.firstChild).toHaveClass('font-normal');
    });
    it('applies custom weight correctly', () => {
        const { container } = (0, react_1.render)(<Text_1.Text weight="bold">Text</Text_1.Text>);
        expect(container.firstChild).toHaveClass('font-bold');
    });
    it('applies left align by default', () => {
        const { container } = (0, react_1.render)(<Text_1.Text>Text</Text_1.Text>);
        expect(container.firstChild).toHaveClass('text-left');
    });
    it('applies custom align correctly', () => {
        const { container } = (0, react_1.render)(<Text_1.Text align="center">Text</Text_1.Text>);
        expect(container.firstChild).toHaveClass('text-center');
    });
    it('does not truncate by default', () => {
        const { container } = (0, react_1.render)(<Text_1.Text>Text</Text_1.Text>);
        expect(container.firstChild).not.toHaveClass('truncate');
    });
    it('applies truncate when specified', () => {
        const { container } = (0, react_1.render)(<Text_1.Text truncate>Text</Text_1.Text>);
        expect(container.firstChild).toHaveClass('truncate');
    });
    it('applies line clamp styles when lineClamp is specified', () => {
        const { container } = (0, react_1.render)(<Text_1.Text lineClamp={3}>Text</Text_1.Text>);
        const element = container.firstChild;
        expect(element.style.display).toBe('-webkit-box');
        expect(element.style.WebkitLineClamp).toBe('3');
        expect(element.style.WebkitBoxOrient).toBe('vertical');
        expect(element.style.overflow).toBe('hidden');
    });
    it('applies different line clamp values correctly', () => {
        const clampValues = [1, 2, 3, 4, 5, 6];
        clampValues.forEach((clamp) => {
            const { container } = (0, react_1.render)(<Text_1.Text lineClamp={clamp}>Text</Text_1.Text>);
            const element = container.firstChild;
            expect(element.style.WebkitLineClamp).toBe(String(clamp));
        });
    });
    it('applies custom className', () => {
        const { container } = (0, react_1.render)(<Text_1.Text className="custom-class">Text</Text_1.Text>);
        expect(container.firstChild).toHaveClass('custom-class');
    });
    it('forwards ref correctly', () => {
        const ref = { current: null };
        (0, react_1.render)(<Text_1.Text ref={ref}>Text</Text_1.Text>);
        expect(ref.current).toBeInstanceOf(HTMLParagraphElement);
    });
    it('supports HTML attributes', () => {
        (0, react_1.render)(<Text_1.Text data-testid="test-text" id="text-id">
        Text
      </Text_1.Text>);
        const text = react_1.screen.getByTestId('test-text');
        expect(text).toHaveAttribute('id', 'text-id');
    });
    it('uses asChild to compose with child element', () => {
        const { container } = (0, react_1.render)(<Text_1.Text asChild>
        <a href="/test">Link</a>
      </Text_1.Text>);
        const link = container.querySelector('a');
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/test');
    });
    it('merges classNames correctly when using asChild', () => {
        const { container } = (0, react_1.render)(<Text_1.Text asChild className="text-class" variant="caption">
        <a href="/test" className="link-class">
          Link
        </a>
      </Text_1.Text>);
        const link = container.querySelector('a');
        expect(link).toHaveClass('text-class');
        expect(link).toHaveClass('link-class');
        expect(link).toHaveClass('text-muted-foreground');
    });
    it('combines multiple variants correctly', () => {
        const { container } = (0, react_1.render)(<Text_1.Text variant="caption" size="sm" weight="medium" align="center">
        Text
      </Text_1.Text>);
        expect(container.firstChild).toHaveClass('text-muted-foreground', 'text-sm', 'font-medium', 'text-center');
    });
    it('merges custom styles with line clamp styles', () => {
        const { container } = (0, react_1.render)(<Text_1.Text lineClamp={2} style={{ color: 'red' }}>
        Text
      </Text_1.Text>);
        const element = container.firstChild;
        expect(element.style.WebkitLineClamp).toBe('2');
        expect(element.style.color).toBe('red');
    });
    it('supports all size values', () => {
        const sizes = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
        const sizeClasses = {
            xs: 'text-xs',
            sm: 'text-sm',
            md: 'text-base',
            lg: 'text-lg',
            xl: 'text-xl',
            '2xl': 'text-2xl',
        };
        sizes.forEach((size) => {
            const { container } = (0, react_1.render)(<Text_1.Text size={size}>Text</Text_1.Text>);
            expect(container.firstChild).toHaveClass(sizeClasses[size]);
        });
    });
    it('has no accessibility violations', async () => {
        const { container } = (0, react_1.render)(<Text_1.Text>Accessible text content</Text_1.Text>);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
    it('has no accessibility violations with all variants', async () => {
        const { container } = (0, react_1.render)(<div>
        <Text_1.Text variant="body">Body text</Text_1.Text>
        <Text_1.Text variant="caption">Caption text</Text_1.Text>
        <Text_1.Text variant="overline">Overline text</Text_1.Text>
        <Text_1.Text variant="label">Label text</Text_1.Text>
      </div>);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
});
//# sourceMappingURL=Text.test.jsx.map