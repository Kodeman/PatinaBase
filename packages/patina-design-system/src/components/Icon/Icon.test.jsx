"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const Icon_1 = require("./Icon");
(0, vitest_1.describe)('Icon', () => {
    (0, vitest_1.it)('renders a lucide icon', () => {
        const { container } = (0, react_1.render)(<Icon_1.Icon name="Heart" data-testid="heart-icon"/>);
        const svg = container.querySelector('svg');
        (0, vitest_1.expect)(svg).toBeInTheDocument();
    });
    (0, vitest_1.it)('applies size prop', () => {
        const { container } = (0, react_1.render)(<Icon_1.Icon name="Heart" size={32}/>);
        const svg = container.querySelector('svg');
        (0, vitest_1.expect)(svg).toHaveAttribute('width', '32');
        (0, vitest_1.expect)(svg).toHaveAttribute('height', '32');
    });
    (0, vitest_1.it)('applies color prop', () => {
        const { container } = (0, react_1.render)(<Icon_1.Icon name="Heart" color="red"/>);
        const svg = container.querySelector('svg');
        (0, vitest_1.expect)(svg).toHaveAttribute('color', 'red');
    });
    (0, vitest_1.it)('applies strokeWidth prop', () => {
        const { container } = (0, react_1.render)(<Icon_1.Icon name="Heart" strokeWidth={3}/>);
        const svg = container.querySelector('svg');
        (0, vitest_1.expect)(svg).toHaveAttribute('stroke-width', '3');
    });
    (0, vitest_1.it)('applies className', () => {
        const { container } = (0, react_1.render)(<Icon_1.Icon name="Heart" className="custom-class"/>);
        const svg = container.querySelector('svg');
        (0, vitest_1.expect)(svg).toHaveClass('custom-class');
    });
    (0, vitest_1.it)('returns null for invalid icon name', () => {
        const { container } = (0, react_1.render)(<Icon_1.Icon name={'InvalidIcon'}/>);
        (0, vitest_1.expect)(container.firstChild).toBeNull();
    });
});
(0, vitest_1.describe)('CustomIcon', () => {
    (0, vitest_1.it)('renders custom SVG icon', () => {
        const { container } = (0, react_1.render)(<Icon_1.CustomIcon data-testid="custom-icon">
        <circle cx="12" cy="12" r="10"/>
      </Icon_1.CustomIcon>);
        const svg = container.querySelector('svg');
        const circle = container.querySelector('circle');
        (0, vitest_1.expect)(svg).toBeInTheDocument();
        (0, vitest_1.expect)(circle).toBeInTheDocument();
    });
    (0, vitest_1.it)('applies size prop', () => {
        const { container } = (0, react_1.render)(<Icon_1.CustomIcon size={48}>
        <circle cx="12" cy="12" r="10"/>
      </Icon_1.CustomIcon>);
        const svg = container.querySelector('svg');
        (0, vitest_1.expect)(svg).toHaveAttribute('width', '48');
        (0, vitest_1.expect)(svg).toHaveAttribute('height', '48');
    });
    (0, vitest_1.it)('applies custom viewBox', () => {
        const { container } = (0, react_1.render)(<Icon_1.CustomIcon viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40"/>
      </Icon_1.CustomIcon>);
        const svg = container.querySelector('svg');
        (0, vitest_1.expect)(svg).toHaveAttribute('viewBox', '0 0 100 100');
    });
    (0, vitest_1.it)('applies className', () => {
        const { container } = (0, react_1.render)(<Icon_1.CustomIcon className="custom-svg-class">
        <circle cx="12" cy="12" r="10"/>
      </Icon_1.CustomIcon>);
        const svg = container.querySelector('svg');
        (0, vitest_1.expect)(svg).toHaveClass('custom-svg-class');
    });
});
(0, vitest_1.describe)('Icon Registry', () => {
    (0, vitest_1.it)('registers and retrieves custom icons', () => {
        const BrandIcon = () => (<Icon_1.CustomIcon>
        <rect width="24" height="24"/>
      </Icon_1.CustomIcon>);
        (0, Icon_1.registerIcon)('BrandLogo', BrandIcon);
        (0, vitest_1.expect)((0, Icon_1.hasCustomIcon)('BrandLogo')).toBe(true);
        (0, vitest_1.expect)((0, Icon_1.getCustomIcon)('BrandLogo')).toBe(BrandIcon);
    });
    (0, vitest_1.it)('returns undefined for unregistered icons', () => {
        (0, vitest_1.expect)((0, Icon_1.hasCustomIcon)('NonExistent')).toBe(false);
        (0, vitest_1.expect)((0, Icon_1.getCustomIcon)('NonExistent')).toBeUndefined();
    });
});
//# sourceMappingURL=Icon.test.jsx.map