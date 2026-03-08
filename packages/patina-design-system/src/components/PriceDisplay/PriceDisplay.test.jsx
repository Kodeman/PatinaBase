"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const PriceDisplay_1 = require("./PriceDisplay");
(0, vitest_1.describe)('PriceDisplay', () => {
    (0, vitest_1.it)('renders price in USD by default', () => {
        (0, react_1.render)(<PriceDisplay_1.PriceDisplay amount={9999}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('$99.99')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders price in different currency', () => {
        (0, react_1.render)(<PriceDisplay_1.PriceDisplay amount={9999} currency="EUR" locale="de-DE"/>);
        const text = react_1.screen.getByText(/99,99/);
        (0, vitest_1.expect)(text).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders sale price with strikethrough original', () => {
        (0, react_1.render)(<PriceDisplay_1.PriceDisplay amount={5999} originalPrice={9999} showSale/>);
        (0, vitest_1.expect)(react_1.screen.getByText('$59.99')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('$99.99')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('$99.99')).toHaveClass('line-through');
    });
    (0, vitest_1.it)('does not show sale if original price is lower', () => {
        (0, react_1.render)(<PriceDisplay_1.PriceDisplay amount={9999} originalPrice={5999} showSale/>);
        (0, vitest_1.expect)(react_1.screen.getByText('$99.99')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.queryByText('$59.99')).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('hides currency symbol when showCurrency is false', () => {
        (0, react_1.render)(<PriceDisplay_1.PriceDisplay amount={9999} showCurrency={false}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('99.99')).toBeInTheDocument();
    });
    (0, vitest_1.it)('hides decimals when showDecimals is false', () => {
        (0, react_1.render)(<PriceDisplay_1.PriceDisplay amount={9999} showDecimals={false}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('$100')).toBeInTheDocument();
    });
    (0, vitest_1.it)('applies size variant', () => {
        const { container } = (0, react_1.render)(<PriceDisplay_1.PriceDisplay amount={9999} size="lg"/>);
        const span = container.querySelector('span');
        (0, vitest_1.expect)(span).toHaveClass('text-lg');
    });
    (0, vitest_1.it)('applies variant styling', () => {
        const { container } = (0, react_1.render)(<PriceDisplay_1.PriceDisplay amount={9999} variant="primary"/>);
        const span = container.querySelector('span');
        (0, vitest_1.expect)(span).toHaveClass('text-primary');
    });
    (0, vitest_1.it)('applies custom className', () => {
        const { container } = (0, react_1.render)(<PriceDisplay_1.PriceDisplay amount={9999} className="custom-class"/>);
        const span = container.querySelector('span');
        (0, vitest_1.expect)(span).toHaveClass('custom-class');
    });
});
(0, vitest_1.describe)('calculateDiscount', () => {
    (0, vitest_1.it)('calculates discount percentage correctly', () => {
        (0, vitest_1.expect)((0, PriceDisplay_1.calculateDiscount)(10000, 7500)).toBe(25);
        (0, vitest_1.expect)((0, PriceDisplay_1.calculateDiscount)(10000, 5000)).toBe(50);
        (0, vitest_1.expect)((0, PriceDisplay_1.calculateDiscount)(10000, 9000)).toBe(10);
    });
    (0, vitest_1.it)('returns 0 for invalid prices', () => {
        (0, vitest_1.expect)((0, PriceDisplay_1.calculateDiscount)(0, 5000)).toBe(0);
        (0, vitest_1.expect)((0, PriceDisplay_1.calculateDiscount)(-1000, 5000)).toBe(0);
    });
    (0, vitest_1.it)('rounds to nearest integer', () => {
        (0, vitest_1.expect)((0, PriceDisplay_1.calculateDiscount)(10000, 6666)).toBe(33);
    });
});
(0, vitest_1.describe)('formatPriceRange', () => {
    (0, vitest_1.it)('formats price range correctly', () => {
        const range = (0, PriceDisplay_1.formatPriceRange)(5000, 15000);
        (0, vitest_1.expect)(range).toBe('$50.00 - $150.00');
    });
    (0, vitest_1.it)('formats price range with different currency', () => {
        const range = (0, PriceDisplay_1.formatPriceRange)(5000, 15000, 'EUR', 'de-DE');
        (0, vitest_1.expect)(range).toContain('50');
        (0, vitest_1.expect)(range).toContain('150');
    });
});
//# sourceMappingURL=PriceDisplay.test.jsx.map