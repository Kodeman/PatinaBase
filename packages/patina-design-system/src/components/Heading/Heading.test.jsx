"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const vitest_axe_1 = require("vitest-axe");
const Heading_1 = require("./Heading");
describe('Heading', () => {
    it('renders children correctly', () => {
        (0, react_1.render)(<Heading_1.Heading>Test Heading</Heading_1.Heading>);
        expect(react_1.screen.getByText('Test Heading')).toBeInTheDocument();
    });
    it('renders as h2 by default', () => {
        const { container } = (0, react_1.render)(<Heading_1.Heading>Heading</Heading_1.Heading>);
        expect(container.firstChild?.nodeName).toBe('H2');
    });
    it('renders as h1 when specified', () => {
        const { container } = (0, react_1.render)(<Heading_1.Heading as="h1">Heading</Heading_1.Heading>);
        expect(container.firstChild?.nodeName).toBe('H1');
    });
    it('renders as h3 when specified', () => {
        const { container } = (0, react_1.render)(<Heading_1.Heading as="h3">Heading</Heading_1.Heading>);
        expect(container.firstChild?.nodeName).toBe('H3');
    });
    it('applies default h2 size when size is not specified', () => {
        const { container } = (0, react_1.render)(<Heading_1.Heading>Heading</Heading_1.Heading>);
        expect(container.firstChild).toHaveClass('text-3xl');
    });
    it('applies default h1 size when as="h1" and size is not specified', () => {
        const { container } = (0, react_1.render)(<Heading_1.Heading as="h1">Heading</Heading_1.Heading>);
        expect(container.firstChild).toHaveClass('text-4xl');
    });
    it('applies custom size when specified', () => {
        const { container } = (0, react_1.render)(<Heading_1.Heading size="6xl">Heading</Heading_1.Heading>);
        expect(container.firstChild).toHaveClass('text-6xl');
    });
    it('applies headline variant by default', () => {
        const { container } = (0, react_1.render)(<Heading_1.Heading>Heading</Heading_1.Heading>);
        expect(container.firstChild).toHaveClass('font-bold');
    });
    it('applies display variant correctly', () => {
        const { container } = (0, react_1.render)(<Heading_1.Heading variant="display">Heading</Heading_1.Heading>);
        expect(container.firstChild).toHaveClass('font-extrabold');
    });
    it('applies title variant correctly', () => {
        const { container } = (0, react_1.render)(<Heading_1.Heading variant="title">Heading</Heading_1.Heading>);
        expect(container.firstChild).toHaveClass('font-semibold');
    });
    it('applies subtitle variant correctly', () => {
        const { container } = (0, react_1.render)(<Heading_1.Heading variant="subtitle">Heading</Heading_1.Heading>);
        expect(container.firstChild).toHaveClass('font-medium');
    });
    it('applies weight override', () => {
        const { container } = (0, react_1.render)(<Heading_1.Heading weight="extrabold">Heading</Heading_1.Heading>);
        expect(container.firstChild).toHaveClass('font-extrabold');
    });
    it('applies left align by default', () => {
        const { container } = (0, react_1.render)(<Heading_1.Heading>Heading</Heading_1.Heading>);
        expect(container.firstChild).toHaveClass('text-left');
    });
    it('applies center align correctly', () => {
        const { container } = (0, react_1.render)(<Heading_1.Heading align="center">Heading</Heading_1.Heading>);
        expect(container.firstChild).toHaveClass('text-center');
    });
    it('applies right align correctly', () => {
        const { container } = (0, react_1.render)(<Heading_1.Heading align="right">Heading</Heading_1.Heading>);
        expect(container.firstChild).toHaveClass('text-right');
    });
    it('applies tracking-tight class', () => {
        const { container } = (0, react_1.render)(<Heading_1.Heading>Heading</Heading_1.Heading>);
        expect(container.firstChild).toHaveClass('tracking-tight');
    });
    it('applies custom className', () => {
        const { container } = (0, react_1.render)(<Heading_1.Heading className="custom-class">Heading</Heading_1.Heading>);
        expect(container.firstChild).toHaveClass('custom-class');
        expect(container.firstChild).toHaveClass('font-bold');
    });
    it('forwards ref correctly', () => {
        const ref = { current: null };
        (0, react_1.render)(<Heading_1.Heading ref={ref}>Heading</Heading_1.Heading>);
        expect(ref.current).toBeInstanceOf(HTMLHeadingElement);
    });
    it('supports HTML attributes', () => {
        (0, react_1.render)(<Heading_1.Heading data-testid="test-heading" id="main-title">
        Heading
      </Heading_1.Heading>);
        const heading = react_1.screen.getByTestId('test-heading');
        expect(heading).toHaveAttribute('id', 'main-title');
    });
    it('combines multiple variants correctly', () => {
        const { container } = (0, react_1.render)(<Heading_1.Heading as="h1" variant="display" size="6xl" align="center" weight="black">
        Heading
      </Heading_1.Heading>);
        expect(container.firstChild?.nodeName).toBe('H1');
        expect(container.firstChild).toHaveClass('text-6xl', 'font-black', 'text-center');
    });
    it('applies all heading levels with default sizes', () => {
        const levels = [
            { as: 'h1', expectedSize: 'text-4xl' },
            { as: 'h2', expectedSize: 'text-3xl' },
            { as: 'h3', expectedSize: 'text-2xl' },
            { as: 'h4', expectedSize: 'text-xl' },
            { as: 'h5', expectedSize: 'text-lg' },
            { as: 'h6', expectedSize: 'text-md' },
        ];
        levels.forEach(({ as, expectedSize }) => {
            const { container } = (0, react_1.render)(<Heading_1.Heading as={as}>Heading</Heading_1.Heading>);
            expect(container.firstChild).toHaveClass(expectedSize);
        });
    });
    it('supports all size values', () => {
        const sizes = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl'];
        const sizeClasses = {
            xs: 'text-xs',
            sm: 'text-sm',
            md: 'text-md',
            lg: 'text-lg',
            xl: 'text-xl',
            '2xl': 'text-2xl',
            '3xl': 'text-3xl',
            '4xl': 'text-4xl',
            '5xl': 'text-5xl',
            '6xl': 'text-6xl',
            '7xl': 'text-7xl',
            '8xl': 'text-8xl',
            '9xl': 'text-9xl',
        };
        sizes.forEach((size) => {
            const { container } = (0, react_1.render)(<Heading_1.Heading size={size}>Heading</Heading_1.Heading>);
            expect(container.firstChild).toHaveClass(sizeClasses[size]);
        });
    });
    it('supports all weight values', () => {
        const weights = ['normal', 'medium', 'semibold', 'bold', 'extrabold', 'black'];
        const weightClasses = {
            normal: 'font-normal',
            medium: 'font-medium',
            semibold: 'font-semibold',
            bold: 'font-bold',
            extrabold: 'font-extrabold',
            black: 'font-black',
        };
        weights.forEach((weight) => {
            const { container } = (0, react_1.render)(<Heading_1.Heading weight={weight}>Heading</Heading_1.Heading>);
            expect(container.firstChild).toHaveClass(weightClasses[weight]);
        });
    });
    it('has no accessibility violations', async () => {
        const { container } = (0, react_1.render)(<Heading_1.Heading as="h1" variant="display">
        Page Title
      </Heading_1.Heading>);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
    it('has no accessibility violations with all variants', async () => {
        const { container } = (0, react_1.render)(<div>
        <Heading_1.Heading as="h1">Heading 1</Heading_1.Heading>
        <Heading_1.Heading as="h2">Heading 2</Heading_1.Heading>
        <Heading_1.Heading as="h3">Heading 3</Heading_1.Heading>
        <Heading_1.Heading as="h4">Heading 4</Heading_1.Heading>
        <Heading_1.Heading as="h5">Heading 5</Heading_1.Heading>
        <Heading_1.Heading as="h6">Heading 6</Heading_1.Heading>
      </div>);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
});
//# sourceMappingURL=Heading.test.jsx.map