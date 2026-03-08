"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const vitest_axe_1 = require("vitest-axe");
const Breadcrumbs_1 = require("./Breadcrumbs");
describe('Breadcrumbs', () => {
    const items = [
        { label: 'Home', href: '/' },
        { label: 'Products', href: '/products' },
        { label: 'Shoes', href: '/products/shoes' },
        { label: 'Nike Air Max', current: true },
    ];
    it('renders breadcrumb items correctly', () => {
        (0, react_1.render)(<Breadcrumbs_1.Breadcrumbs items={items}/>);
        expect(react_1.screen.getByText('Home')).toBeInTheDocument();
        expect(react_1.screen.getByText('Products')).toBeInTheDocument();
        expect(react_1.screen.getByText('Shoes')).toBeInTheDocument();
        expect(react_1.screen.getByText('Nike Air Max')).toBeInTheDocument();
    });
    it('renders default separator', () => {
        const { container } = (0, react_1.render)(<Breadcrumbs_1.Breadcrumbs items={items}/>);
        const separators = container.querySelectorAll('[aria-hidden="true"]');
        expect(separators).toHaveLength(3); // 4 items = 3 separators
        expect(separators[0]).toHaveTextContent('/');
    });
    it('renders custom separator', () => {
        const { container } = (0, react_1.render)(<Breadcrumbs_1.Breadcrumbs items={items} separator=">"/>);
        const separators = container.querySelectorAll('[aria-hidden="true"]');
        expect(separators[0]).toHaveTextContent('>');
    });
    it('marks current page with aria-current', () => {
        (0, react_1.render)(<Breadcrumbs_1.Breadcrumbs items={items}/>);
        const currentItem = react_1.screen.getByText('Nike Air Max');
        expect(currentItem).toHaveAttribute('aria-current', 'page');
    });
    it('renders links for non-current items', () => {
        (0, react_1.render)(<Breadcrumbs_1.Breadcrumbs items={items}/>);
        const homeLink = react_1.screen.getByRole('link', { name: 'Home' });
        expect(homeLink).toHaveAttribute('href', '/');
    });
    it('calls onItemClick when link is clicked', async () => {
        const onItemClick = vi.fn();
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Breadcrumbs_1.Breadcrumbs items={items} onItemClick={onItemClick}/>);
        await user.click(react_1.screen.getByRole('link', { name: 'Home' }));
        expect(onItemClick).toHaveBeenCalledWith(items[0], 0);
    });
    it('supports icons in items', () => {
        const itemsWithIcons = [
            { label: 'Home', href: '/', icon: <span data-testid="home-icon">🏠</span> },
            { label: 'Products', current: true },
        ];
        (0, react_1.render)(<Breadcrumbs_1.Breadcrumbs items={itemsWithIcons}/>);
        expect(react_1.screen.getByTestId('home-icon')).toBeInTheDocument();
    });
    it('collapses items when maxItems is exceeded', () => {
        const manyItems = [
            { label: 'Home', href: '/' },
            { label: 'Category', href: '/category' },
            { label: 'Subcategory', href: '/category/sub' },
            { label: 'Product Type', href: '/category/sub/type' },
            { label: 'Product', current: true },
        ];
        (0, react_1.render)(<Breadcrumbs_1.Breadcrumbs items={manyItems} maxItems={3} itemsBeforeCollapse={1} itemsAfterCollapse={1}/>);
        expect(react_1.screen.getByText('Home')).toBeInTheDocument();
        expect(react_1.screen.getByText('...')).toBeInTheDocument();
        expect(react_1.screen.getByText('Product')).toBeInTheDocument();
        expect(react_1.screen.queryByText('Category')).not.toBeInTheDocument();
        expect(react_1.screen.queryByText('Subcategory')).not.toBeInTheDocument();
    });
    it('does not collapse when items are within maxItems', () => {
        (0, react_1.render)(<Breadcrumbs_1.Breadcrumbs items={items} maxItems={10}/>);
        expect(react_1.screen.queryByText('...')).not.toBeInTheDocument();
    });
    it('renders only current item when no href is provided', () => {
        const itemsWithoutHref = [
            { label: 'Home', href: '/' },
            { label: 'Current Page' },
        ];
        (0, react_1.render)(<Breadcrumbs_1.Breadcrumbs items={itemsWithoutHref}/>);
        const currentItem = react_1.screen.getByText('Current Page');
        expect(currentItem.tagName).toBe('SPAN');
    });
    it('applies custom className', () => {
        const { container } = (0, react_1.render)(<Breadcrumbs_1.Breadcrumbs items={items} className="custom-class"/>);
        expect(container.querySelector('nav')).toHaveClass('custom-class');
    });
    it('has no accessibility violations', async () => {
        const { container } = (0, react_1.render)(<Breadcrumbs_1.Breadcrumbs items={items}/>);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
    it('has correct aria-label', () => {
        (0, react_1.render)(<Breadcrumbs_1.Breadcrumbs items={items}/>);
        expect(react_1.screen.getByLabelText('Breadcrumb')).toBeInTheDocument();
    });
});
//# sourceMappingURL=Breadcrumbs.test.jsx.map