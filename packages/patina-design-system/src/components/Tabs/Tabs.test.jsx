"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const vitest_axe_1 = require("vitest-axe");
const Tabs_1 = require("./Tabs");
describe('Tabs', () => {
    const TabsExample = () => (<Tabs_1.Tabs defaultValue="tab1">
      <Tabs_1.TabsList>
        <Tabs_1.TabsTrigger value="tab1">Tab 1</Tabs_1.TabsTrigger>
        <Tabs_1.TabsTrigger value="tab2">Tab 2</Tabs_1.TabsTrigger>
        <Tabs_1.TabsTrigger value="tab3" disabled>
          Tab 3
        </Tabs_1.TabsTrigger>
      </Tabs_1.TabsList>
      <Tabs_1.TabsContent value="tab1">Content 1</Tabs_1.TabsContent>
      <Tabs_1.TabsContent value="tab2">Content 2</Tabs_1.TabsContent>
      <Tabs_1.TabsContent value="tab3">Content 3</Tabs_1.TabsContent>
    </Tabs_1.Tabs>);
    it('renders tabs correctly', () => {
        (0, react_1.render)(<TabsExample />);
        expect(react_1.screen.getByRole('tab', { name: 'Tab 1' })).toBeInTheDocument();
        expect(react_1.screen.getByRole('tab', { name: 'Tab 2' })).toBeInTheDocument();
        expect(react_1.screen.getByRole('tab', { name: 'Tab 3' })).toBeInTheDocument();
    });
    it('shows default tab content', () => {
        (0, react_1.render)(<TabsExample />);
        expect(react_1.screen.getByText('Content 1')).toBeVisible();
        expect(react_1.screen.queryByText('Content 2')).not.toBeVisible();
    });
    it('switches tabs on click', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<TabsExample />);
        await user.click(react_1.screen.getByRole('tab', { name: 'Tab 2' }));
        expect(react_1.screen.getByText('Content 2')).toBeVisible();
        expect(react_1.screen.queryByText('Content 1')).not.toBeVisible();
    });
    it('supports keyboard navigation', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<TabsExample />);
        const firstTab = react_1.screen.getByRole('tab', { name: 'Tab 1' });
        firstTab.focus();
        await user.keyboard('{ArrowRight}');
        expect(react_1.screen.getByRole('tab', { name: 'Tab 2' })).toHaveFocus();
    });
    it('disables tabs when disabled prop is set', () => {
        (0, react_1.render)(<TabsExample />);
        const disabledTab = react_1.screen.getByRole('tab', { name: 'Tab 3' });
        expect(disabledTab).toBeDisabled();
    });
    it('applies variant styles correctly', () => {
        const { container } = (0, react_1.render)(<Tabs_1.Tabs defaultValue="tab1" variant="enclosed">
        <Tabs_1.TabsList variant="enclosed">
          <Tabs_1.TabsTrigger value="tab1" variant="enclosed">
            Tab 1
          </Tabs_1.TabsTrigger>
        </Tabs_1.TabsList>
        <Tabs_1.TabsContent value="tab1" variant="enclosed">
          Content
        </Tabs_1.TabsContent>
      </Tabs_1.Tabs>);
        expect(container.firstChild).toHaveClass('border');
    });
    it('supports icons in triggers', () => {
        (0, react_1.render)(<Tabs_1.Tabs defaultValue="tab1">
        <Tabs_1.TabsList>
          <Tabs_1.TabsTrigger value="tab1" icon={<span data-testid="icon">🏠</span>}>
            Home
          </Tabs_1.TabsTrigger>
        </Tabs_1.TabsList>
        <Tabs_1.TabsContent value="tab1">Content</Tabs_1.TabsContent>
      </Tabs_1.Tabs>);
        expect(react_1.screen.getByTestId('icon')).toBeInTheDocument();
    });
    it('supports lazy loading of content', () => {
        (0, react_1.render)(<Tabs_1.Tabs defaultValue="tab1">
        <Tabs_1.TabsList>
          <Tabs_1.TabsTrigger value="tab1">Tab 1</Tabs_1.TabsTrigger>
          <Tabs_1.TabsTrigger value="tab2">Tab 2</Tabs_1.TabsTrigger>
        </Tabs_1.TabsList>
        <Tabs_1.TabsContent value="tab1">Content 1</Tabs_1.TabsContent>
        <Tabs_1.TabsContent value="tab2" lazy>
          Content 2
        </Tabs_1.TabsContent>
      </Tabs_1.Tabs>);
        // Lazy content should not be in DOM initially
        expect(react_1.screen.queryByText('Content 2')).not.toBeInTheDocument();
    });
    it('supports vertical orientation', () => {
        const { container } = (0, react_1.render)(<Tabs_1.Tabs defaultValue="tab1" orientation="vertical">
        <Tabs_1.TabsList orientation="vertical">
          <Tabs_1.TabsTrigger value="tab1">Tab 1</Tabs_1.TabsTrigger>
        </Tabs_1.TabsList>
        <Tabs_1.TabsContent value="tab1">Content</Tabs_1.TabsContent>
      </Tabs_1.Tabs>);
        expect(container.querySelector('[role="tablist"]')).toHaveClass('flex-col');
    });
    it('has no accessibility violations', async () => {
        const { container } = (0, react_1.render)(<TabsExample />);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
});
//# sourceMappingURL=Tabs.test.jsx.map