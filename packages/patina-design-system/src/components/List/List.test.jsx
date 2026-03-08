"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const vitest_axe_1 = require("vitest-axe");
const List_1 = require("./List");
describe('List', () => {
    it('renders unordered list by default', () => {
        const { container } = (0, react_1.render)(<List_1.List>
        <List_1.ListItem>Item 1</List_1.ListItem>
        <List_1.ListItem>Item 2</List_1.ListItem>
      </List_1.List>);
        expect(container.querySelector('ul')).toBeInTheDocument();
    });
    it('renders ordered list when variant is ordered', () => {
        const { container } = (0, react_1.render)(<List_1.List variant="ordered">
        <List_1.ListItem>Item 1</List_1.ListItem>
        <List_1.ListItem>Item 2</List_1.ListItem>
      </List_1.List>);
        expect(container.querySelector('ol')).toBeInTheDocument();
    });
    it('renders list items correctly', () => {
        (0, react_1.render)(<List_1.List>
        <List_1.ListItem>First item</List_1.ListItem>
        <List_1.ListItem>Second item</List_1.ListItem>
      </List_1.List>);
        expect(react_1.screen.getByText('First item')).toBeInTheDocument();
        expect(react_1.screen.getByText('Second item')).toBeInTheDocument();
    });
    it('applies spacing correctly', () => {
        const { container } = (0, react_1.render)(<List_1.List spacing="lg">
        <List_1.ListItem>Item 1</List_1.ListItem>
      </List_1.List>);
        expect(container.firstChild).toHaveClass('space-y-3');
    });
    it('renders icons in list items', () => {
        (0, react_1.render)(<List_1.List variant="none">
        <List_1.ListItem icon={<span data-testid="icon">✓</span>}>Item with icon</List_1.ListItem>
      </List_1.List>);
        expect(react_1.screen.getByTestId('icon')).toBeInTheDocument();
    });
    it('supports custom className', () => {
        const { container } = (0, react_1.render)(<List_1.List className="custom-class">
        <List_1.ListItem>Item</List_1.ListItem>
      </List_1.List>);
        expect(container.firstChild).toHaveClass('custom-class');
    });
    it('has no accessibility violations', async () => {
        const { container } = (0, react_1.render)(<List_1.List>
        <List_1.ListItem>Item 1</List_1.ListItem>
        <List_1.ListItem>Item 2</List_1.ListItem>
      </List_1.List>);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
});
//# sourceMappingURL=List.test.jsx.map