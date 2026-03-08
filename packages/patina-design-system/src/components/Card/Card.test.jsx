"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const Card_1 = require("./Card");
(0, vitest_1.describe)('Card', () => {
    (0, vitest_1.it)('renders card with content', () => {
        (0, react_1.render)(<Card_1.Card>Card Content</Card_1.Card>);
        (0, vitest_1.expect)(react_1.screen.getByText('Card Content')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders compound components', () => {
        (0, react_1.render)(<Card_1.Card>
        <Card_1.CardHeader>
          <Card_1.CardTitle>Card Title</Card_1.CardTitle>
          <Card_1.CardDescription>Card Description</Card_1.CardDescription>
        </Card_1.CardHeader>
        <Card_1.CardContent>Content</Card_1.CardContent>
        <Card_1.CardFooter>Footer</Card_1.CardFooter>
      </Card_1.Card>);
        (0, vitest_1.expect)(react_1.screen.getByText('Card Title')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Card Description')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Content')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Footer')).toBeInTheDocument();
    });
    (0, vitest_1.it)('applies variant styles', () => {
        const { rerender, container } = (0, react_1.render)(<Card_1.Card variant="outlined">Content</Card_1.Card>);
        (0, vitest_1.expect)(container.firstChild).toHaveClass('border-2');
        rerender(<Card_1.Card variant="elevated">Content</Card_1.Card>);
        (0, vitest_1.expect)(container.firstChild).toHaveClass('shadow-md');
    });
    (0, vitest_1.it)('applies hoverable styles', () => {
        const { container } = (0, react_1.render)(<Card_1.Card hoverable>Content</Card_1.Card>);
        (0, vitest_1.expect)(container.firstChild).toHaveClass('hover:shadow-md');
    });
    (0, vitest_1.it)('applies clickable styles', () => {
        const { container } = (0, react_1.render)(<Card_1.Card clickable>Content</Card_1.Card>);
        (0, vitest_1.expect)(container.firstChild).toHaveClass('cursor-pointer');
    });
    (0, vitest_1.it)('forwards ref correctly', () => {
        const ref = vitest_1.vi.fn();
        (0, react_1.render)(<Card_1.Card ref={ref}>Content</Card_1.Card>);
        (0, vitest_1.expect)(ref).toHaveBeenCalled();
    });
});
//# sourceMappingURL=Card.test.jsx.map