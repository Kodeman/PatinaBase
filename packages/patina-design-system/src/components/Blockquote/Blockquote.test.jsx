"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const vitest_axe_1 = require("vitest-axe");
const Blockquote_1 = require("./Blockquote");
(0, vitest_1.describe)('Blockquote', () => {
    (0, vitest_1.it)('renders children correctly', () => {
        (0, react_1.render)(<Blockquote_1.Blockquote>This is a quote</Blockquote_1.Blockquote>);
        (0, vitest_1.expect)(react_1.screen.getByText('This is a quote')).toBeInTheDocument();
    });
    (0, vitest_1.it)('applies variant styles', () => {
        const { container } = (0, react_1.render)(<Blockquote_1.Blockquote variant="primary">Primary quote</Blockquote_1.Blockquote>);
        const blockquote = container.querySelector('blockquote');
        (0, vitest_1.expect)(blockquote).toHaveClass('border-primary');
    });
    (0, vitest_1.it)('applies size styles', () => {
        const { container } = (0, react_1.render)(<Blockquote_1.Blockquote size="lg">Large quote</Blockquote_1.Blockquote>);
        const blockquote = container.querySelector('blockquote');
        (0, vitest_1.expect)(blockquote).toHaveClass('text-lg');
    });
    (0, vitest_1.it)('renders with citation attribute', () => {
        const { container } = (0, react_1.render)(<Blockquote_1.Blockquote cite="Steve Jobs">Innovation quote</Blockquote_1.Blockquote>);
        const blockquote = container.querySelector('blockquote');
        (0, vitest_1.expect)(blockquote).toHaveAttribute('cite', 'Steve Jobs');
    });
    (0, vitest_1.it)('shows citation when showCite is true', () => {
        (0, react_1.render)(<Blockquote_1.Blockquote cite="Steve Jobs" showCite>
        Innovation quote
      </Blockquote_1.Blockquote>);
        (0, vitest_1.expect)(react_1.screen.getByText(/— Steve Jobs/)).toBeInTheDocument();
    });
    (0, vitest_1.it)('does not show citation when showCite is false', () => {
        (0, react_1.render)(<Blockquote_1.Blockquote cite="Steve Jobs">
        Innovation quote
      </Blockquote_1.Blockquote>);
        (0, vitest_1.expect)(react_1.screen.queryByText(/— Steve Jobs/)).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('forwards ref correctly', () => {
        const ref = React.createRef();
        (0, react_1.render)(<Blockquote_1.Blockquote ref={ref}>Quote with ref</Blockquote_1.Blockquote>);
        (0, vitest_1.expect)(ref.current).toBeInstanceOf(HTMLQuoteElement);
    });
    (0, vitest_1.it)('applies custom className', () => {
        const { container } = (0, react_1.render)(<Blockquote_1.Blockquote className="custom-class">Custom quote</Blockquote_1.Blockquote>);
        const figure = container.querySelector('figure');
        (0, vitest_1.expect)(figure).toHaveClass('custom-class');
    });
    (0, vitest_1.it)('has no accessibility violations', async () => {
        const { container } = (0, react_1.render)(<Blockquote_1.Blockquote cite="Author" showCite>
        Accessible quote
      </Blockquote_1.Blockquote>);
        (0, vitest_1.expect)(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
    (0, vitest_1.it)('renders all variants correctly', () => {
        const variants = ['default', 'primary', 'success', 'warning', 'error'];
        variants.forEach((variant) => {
            const { container } = (0, react_1.render)(<Blockquote_1.Blockquote variant={variant}>{variant} quote</Blockquote_1.Blockquote>);
            const blockquote = container.querySelector('blockquote');
            (0, vitest_1.expect)(blockquote).toBeInTheDocument();
        });
    });
    (0, vitest_1.it)('renders all sizes correctly', () => {
        const sizes = ['sm', 'md', 'lg', 'xl'];
        sizes.forEach((size) => {
            const { container } = (0, react_1.render)(<Blockquote_1.Blockquote size={size}>{size} quote</Blockquote_1.Blockquote>);
            const blockquote = container.querySelector('blockquote');
            (0, vitest_1.expect)(blockquote).toHaveClass(`text-${size}`);
        });
    });
});
//# sourceMappingURL=Blockquote.test.jsx.map