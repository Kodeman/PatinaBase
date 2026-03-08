"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const vitest_axe_1 = require("vitest-axe");
const Link_1 = require("./Link");
(0, vitest_1.describe)('Link', () => {
    (0, vitest_1.it)('renders children correctly', () => {
        (0, react_1.render)(<Link_1.Link href="/test">Click me</Link_1.Link>);
        (0, vitest_1.expect)(react_1.screen.getByText('Click me')).toBeInTheDocument();
    });
    (0, vitest_1.it)('applies href attribute', () => {
        (0, react_1.render)(<Link_1.Link href="/about">About</Link_1.Link>);
        const link = react_1.screen.getByRole('link');
        (0, vitest_1.expect)(link).toHaveAttribute('href', '/about');
    });
    (0, vitest_1.it)('applies variant styles', () => {
        (0, react_1.render)(<Link_1.Link variant="subtle" href="/test">Subtle Link</Link_1.Link>);
        const link = react_1.screen.getByRole('link');
        (0, vitest_1.expect)(link).toHaveClass('text-foreground');
    });
    (0, vitest_1.it)('applies size styles', () => {
        (0, react_1.render)(<Link_1.Link size="lg" href="/test">Large Link</Link_1.Link>);
        const link = react_1.screen.getByRole('link');
        (0, vitest_1.expect)(link).toHaveClass('text-lg');
    });
    (0, vitest_1.it)('sets target and rel for external links with isExternal', () => {
        (0, react_1.render)(<Link_1.Link href="https://example.com" isExternal>External</Link_1.Link>);
        const link = react_1.screen.getByRole('link');
        (0, vitest_1.expect)(link).toHaveAttribute('target', '_blank');
        (0, vitest_1.expect)(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
    (0, vitest_1.it)('auto-detects external links by URL', () => {
        (0, react_1.render)(<Link_1.Link href="https://example.com">Auto External</Link_1.Link>);
        const link = react_1.screen.getByRole('link');
        (0, vitest_1.expect)(link).toHaveAttribute('target', '_blank');
        (0, vitest_1.expect)(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
    (0, vitest_1.it)('does not set external attributes for internal links', () => {
        (0, react_1.render)(<Link_1.Link href="/internal">Internal</Link_1.Link>);
        const link = react_1.screen.getByRole('link');
        (0, vitest_1.expect)(link).not.toHaveAttribute('target', '_blank');
    });
    (0, vitest_1.it)('shows external icon when showExternalIcon is true', () => {
        const { container } = (0, react_1.render)(<Link_1.Link href="https://example.com" showExternalIcon>
        External with icon
      </Link_1.Link>);
        const svg = container.querySelector('svg');
        (0, vitest_1.expect)(svg).toBeInTheDocument();
    });
    (0, vitest_1.it)('does not show external icon for internal links', () => {
        const { container } = (0, react_1.render)(<Link_1.Link href="/internal" showExternalIcon>
        Internal link
      </Link_1.Link>);
        const svg = container.querySelector('svg');
        (0, vitest_1.expect)(svg).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('forwards ref correctly', () => {
        const ref = React.createRef();
        (0, react_1.render)(<Link_1.Link ref={ref} href="/test">Link with ref</Link_1.Link>);
        (0, vitest_1.expect)(ref.current).toBeInstanceOf(HTMLAnchorElement);
    });
    (0, vitest_1.it)('applies custom className', () => {
        (0, react_1.render)(<Link_1.Link className="custom-class" href="/test">Custom Link</Link_1.Link>);
        const link = react_1.screen.getByRole('link');
        (0, vitest_1.expect)(link).toHaveClass('custom-class');
    });
    (0, vitest_1.it)('allows custom target and rel attributes', () => {
        (0, react_1.render)(<Link_1.Link href="/test" target="_self" rel="nofollow">
        Custom attributes
      </Link_1.Link>);
        const link = react_1.screen.getByRole('link');
        (0, vitest_1.expect)(link).toHaveAttribute('target', '_self');
        (0, vitest_1.expect)(link).toHaveAttribute('rel', 'nofollow');
    });
    (0, vitest_1.it)('has no accessibility violations', async () => {
        const { container } = (0, react_1.render)(<Link_1.Link href="/test">Accessible link</Link_1.Link>);
        (0, vitest_1.expect)(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
    (0, vitest_1.it)('renders all variants correctly', () => {
        const variants = ['default', 'subtle', 'ghost', 'underline', 'unstyled'];
        variants.forEach((variant) => {
            (0, react_1.render)(<Link_1.Link variant={variant} href="/test">{variant} link</Link_1.Link>);
            const link = react_1.screen.getByText(`${variant} link`);
            (0, vitest_1.expect)(link).toBeInTheDocument();
        });
    });
    (0, vitest_1.it)('renders all sizes correctly', () => {
        const sizes = ['sm', 'md', 'lg'];
        sizes.forEach((size) => {
            (0, react_1.render)(<Link_1.Link size={size} href="/test">{size} link</Link_1.Link>);
            const link = react_1.screen.getByRole('link', { name: `${size} link` });
            (0, vitest_1.expect)(link).toHaveClass(`text-${size}`);
        });
    });
    (0, vitest_1.it)('supports http:// URLs as external', () => {
        (0, react_1.render)(<Link_1.Link href="http://example.com">HTTP Link</Link_1.Link>);
        const link = react_1.screen.getByRole('link');
        (0, vitest_1.expect)(link).toHaveAttribute('target', '_blank');
    });
});
//# sourceMappingURL=Link.test.jsx.map