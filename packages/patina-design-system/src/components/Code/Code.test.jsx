"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const vitest_axe_1 = require("vitest-axe");
const react_2 = __importDefault(require("react"));
const Code_1 = require("./Code");
(0, vitest_1.describe)('Code', () => {
    (0, vitest_1.it)('renders children correctly', () => {
        (0, react_1.render)(<Code_1.Code>const x = 5;</Code_1.Code>);
        (0, vitest_1.expect)(react_1.screen.getByText('const x = 5;')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders inline variant by default', () => {
        const { container } = (0, react_1.render)(<Code_1.Code>inline code</Code_1.Code>);
        const code = container.querySelector('code');
        (0, vitest_1.expect)(code).toBeInTheDocument();
        (0, vitest_1.expect)(code).toHaveClass('rounded');
    });
    (0, vitest_1.it)('renders block variant', () => {
        const { container } = (0, react_1.render)(<Code_1.Code variant="block">block code</Code_1.Code>);
        const pre = container.querySelector('pre');
        (0, vitest_1.expect)(pre).toBeInTheDocument();
        (0, vitest_1.expect)(pre).toHaveClass('block');
    });
    (0, vitest_1.it)('applies color scheme styles', () => {
        const { container } = (0, react_1.render)(<Code_1.Code colorScheme="primary">primary code</Code_1.Code>);
        const code = container.querySelector('code');
        (0, vitest_1.expect)(code).toHaveClass('bg-primary/10', 'text-primary');
    });
    (0, vitest_1.it)('applies success color scheme', () => {
        const { container } = (0, react_1.render)(<Code_1.Code colorScheme="success">success code</Code_1.Code>);
        const code = container.querySelector('code');
        (0, vitest_1.expect)(code).toHaveClass('bg-green-500/10');
    });
    (0, vitest_1.it)('applies warning color scheme', () => {
        const { container } = (0, react_1.render)(<Code_1.Code colorScheme="warning">warning code</Code_1.Code>);
        const code = container.querySelector('code');
        (0, vitest_1.expect)(code).toHaveClass('bg-yellow-500/10');
    });
    (0, vitest_1.it)('applies error color scheme', () => {
        const { container } = (0, react_1.render)(<Code_1.Code colorScheme="error">error code</Code_1.Code>);
        const code = container.querySelector('code');
        (0, vitest_1.expect)(code).toHaveClass('bg-red-500/10');
    });
    (0, vitest_1.it)('shows copy button when showCopy is true', () => {
        (0, react_1.render)(<Code_1.Code variant="block" showCopy>
        copyable code
      </Code_1.Code>);
        (0, vitest_1.expect)(react_1.screen.getByRole('button', { name: /copy code/i })).toBeInTheDocument();
    });
    (0, vitest_1.it)('does not show copy button for inline variant', () => {
        (0, react_1.render)(<Code_1.Code variant="inline" showCopy>
        inline code
      </Code_1.Code>);
        (0, vitest_1.expect)(react_1.screen.queryByRole('button')).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('copies code to clipboard when copy button is clicked', async () => {
        const user = user_event_1.default.setup();
        const writeText = vitest_1.vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            writable: true,
            configurable: true,
        });
        (0, react_1.render)(<Code_1.Code variant="block" showCopy>
        code to copy
      </Code_1.Code>);
        const copyButton = react_1.screen.getByRole('button', { name: /copy code/i });
        await user.click(copyButton);
        (0, vitest_1.expect)(writeText).toHaveBeenCalledWith('code to copy');
    });
    (0, vitest_1.it)('shows "Copied!" message after copying', async () => {
        const user = user_event_1.default.setup();
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: vitest_1.vi.fn().mockResolvedValue(undefined) },
            writable: true,
            configurable: true,
        });
        (0, react_1.render)(<Code_1.Code variant="block" showCopy>
        code to copy
      </Code_1.Code>);
        const copyButton = react_1.screen.getByRole('button', { name: /copy code/i });
        await user.click(copyButton);
        await (0, react_1.waitFor)(() => {
            (0, vitest_1.expect)(react_1.screen.getByText('Copied!')).toBeInTheDocument();
        });
    });
    (0, vitest_1.it)('calls onCopy callback when code is copied', async () => {
        const user = user_event_1.default.setup();
        const onCopy = vitest_1.vi.fn();
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: vitest_1.vi.fn().mockResolvedValue(undefined) },
            writable: true,
            configurable: true,
        });
        (0, react_1.render)(<Code_1.Code variant="block" showCopy onCopy={onCopy}>
        code to copy
      </Code_1.Code>);
        const copyButton = react_1.screen.getByRole('button', { name: /copy code/i });
        await user.click(copyButton);
        await (0, react_1.waitFor)(() => {
            (0, vitest_1.expect)(onCopy).toHaveBeenCalled();
        });
    });
    (0, vitest_1.it)('sets language data attribute', () => {
        const { container } = (0, react_1.render)(<Code_1.Code variant="block" language="javascript">
        const x = 5;
      </Code_1.Code>);
        const pre = container.querySelector('pre');
        (0, vitest_1.expect)(pre).toHaveAttribute('data-language', 'javascript');
    });
    (0, vitest_1.it)('forwards ref correctly for inline variant', () => {
        const ref = react_2.default.createRef();
        (0, react_1.render)(<Code_1.Code ref={ref}>inline code</Code_1.Code>);
        (0, vitest_1.expect)(ref.current).toBeInstanceOf(HTMLElement);
        (0, vitest_1.expect)(ref.current?.tagName).toBe('CODE');
    });
    (0, vitest_1.it)('forwards ref correctly for block variant', () => {
        const ref = react_2.default.createRef();
        (0, react_1.render)(<Code_1.Code ref={ref} variant="block">
        block code
      </Code_1.Code>);
        (0, vitest_1.expect)(ref.current).toBeInstanceOf(HTMLPreElement);
    });
    (0, vitest_1.it)('applies custom className', () => {
        const { container } = (0, react_1.render)(<Code_1.Code className="custom-class">code</Code_1.Code>);
        const code = container.querySelector('code');
        (0, vitest_1.expect)(code).toHaveClass('custom-class');
    });
    (0, vitest_1.it)('has no accessibility violations for inline variant', async () => {
        const { container } = (0, react_1.render)(<Code_1.Code>inline code</Code_1.Code>);
        (0, vitest_1.expect)(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
    (0, vitest_1.it)('has no accessibility violations for block variant', async () => {
        const { container } = (0, react_1.render)(<Code_1.Code variant="block">block code</Code_1.Code>);
        (0, vitest_1.expect)(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
    (0, vitest_1.it)('has no accessibility violations with copy button', async () => {
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: vitest_1.vi.fn().mockResolvedValue(undefined) },
            writable: true,
            configurable: true,
        });
        const { container } = (0, react_1.render)(<Code_1.Code variant="block" showCopy>
        code
      </Code_1.Code>);
        (0, vitest_1.expect)(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
    (0, vitest_1.it)('renders all color schemes correctly', () => {
        const schemes = ['default', 'primary', 'secondary', 'success', 'warning', 'error'];
        schemes.forEach((scheme) => {
            const { container } = (0, react_1.render)(<Code_1.Code colorScheme={scheme}>{scheme} code</Code_1.Code>);
            const code = container.querySelector('code');
            (0, vitest_1.expect)(code).toBeInTheDocument();
        });
    });
    (0, vitest_1.it)('wraps block code in pre and code elements', () => {
        const { container } = (0, react_1.render)(<Code_1.Code variant="block">const x = 5;</Code_1.Code>);
        const pre = container.querySelector('pre');
        const code = container.querySelector('code');
        (0, vitest_1.expect)(pre).toBeInTheDocument();
        (0, vitest_1.expect)(code).toBeInTheDocument();
        (0, vitest_1.expect)(pre?.contains(code)).toBe(true);
    });
    (0, vitest_1.it)('hides copy button initially and shows on hover', () => {
        const { container } = (0, react_1.render)(<Code_1.Code variant="block" showCopy>
        code
      </Code_1.Code>);
        const button = container.querySelector('button');
        (0, vitest_1.expect)(button).toHaveClass('opacity-0', 'group-hover:opacity-100');
    });
    (0, vitest_1.it)('handles multiline code in block variant', () => {
        const multilineCode = `function hello() {
  console.log("Hello");
}`;
        const { container } = (0, react_1.render)(<Code_1.Code variant="block">{multilineCode}</Code_1.Code>);
        const code = container.querySelector('code');
        (0, vitest_1.expect)(code?.textContent).toBe(multilineCode);
    });
});
//# sourceMappingURL=Code.test.jsx.map