"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const vitest_axe_1 = require("vitest-axe");
const Stack_1 = require("./Stack");
describe('Stack', () => {
    it('renders children correctly', () => {
        (0, react_1.render)(<Stack_1.Stack>
        <div>Child 1</div>
        <div>Child 2</div>
      </Stack_1.Stack>);
        expect(react_1.screen.getByText('Child 1')).toBeInTheDocument();
        expect(react_1.screen.getByText('Child 2')).toBeInTheDocument();
    });
    it('applies default direction (column)', () => {
        const { container } = (0, react_1.render)(<Stack_1.Stack>Content</Stack_1.Stack>);
        expect(container.firstChild).toHaveClass('flex-col');
    });
    it('applies row direction', () => {
        const { container } = (0, react_1.render)(<Stack_1.Stack direction="row">Content</Stack_1.Stack>);
        expect(container.firstChild).toHaveClass('flex-row');
    });
    it('applies spacing', () => {
        const { container } = (0, react_1.render)(<Stack_1.Stack spacing="lg">Content</Stack_1.Stack>);
        expect(container.firstChild).toHaveClass('gap-6');
    });
    it('applies alignment', () => {
        const { container } = (0, react_1.render)(<Stack_1.Stack align="center">Content</Stack_1.Stack>);
        expect(container.firstChild).toHaveClass('items-center');
    });
    it('applies justification', () => {
        const { container } = (0, react_1.render)(<Stack_1.Stack justify="between">Content</Stack_1.Stack>);
        expect(container.firstChild).toHaveClass('justify-between');
    });
    it('forwards ref correctly', () => {
        const ref = { current: null };
        (0, react_1.render)(<Stack_1.Stack ref={ref}>Content</Stack_1.Stack>);
        expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
    it('has no accessibility violations', async () => {
        const { container } = (0, react_1.render)(<Stack_1.Stack>Content</Stack_1.Stack>);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
});
describe('VStack', () => {
    it('renders as vertical stack', () => {
        const { container } = (0, react_1.render)(<Stack_1.VStack>Content</Stack_1.VStack>);
        expect(container.firstChild).toHaveClass('flex-col');
    });
});
describe('HStack', () => {
    it('renders as horizontal stack', () => {
        const { container } = (0, react_1.render)(<Stack_1.HStack>Content</Stack_1.HStack>);
        expect(container.firstChild).toHaveClass('flex-row');
    });
});
//# sourceMappingURL=Stack.test.jsx.map