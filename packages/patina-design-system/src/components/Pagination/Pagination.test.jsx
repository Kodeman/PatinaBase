"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const vitest_axe_1 = require("vitest-axe");
const Pagination_1 = require("./Pagination");
describe('Pagination', () => {
    it('renders pagination correctly', () => {
        (0, react_1.render)(<Pagination_1.Pagination total={100} currentPage={5} pageSize={10} onPageChange={() => { }}/>);
        expect(react_1.screen.getByLabelText('Pagination')).toBeInTheDocument();
    });
    it('shows correct page numbers', () => {
        (0, react_1.render)(<Pagination_1.Pagination total={50} currentPage={3} pageSize={10} onPageChange={() => { }}/>);
        expect(react_1.screen.getByLabelText('Page 1')).toBeInTheDocument();
        expect(react_1.screen.getByLabelText('Page 2')).toBeInTheDocument();
        expect(react_1.screen.getByLabelText('Page 3')).toBeInTheDocument();
        expect(react_1.screen.getByLabelText('Page 4')).toBeInTheDocument();
        expect(react_1.screen.getByLabelText('Page 5')).toBeInTheDocument();
    });
    it('marks current page correctly', () => {
        (0, react_1.render)(<Pagination_1.Pagination total={50} currentPage={3} pageSize={10} onPageChange={() => { }}/>);
        const currentPage = react_1.screen.getByLabelText('Page 3');
        expect(currentPage).toHaveAttribute('aria-current', 'page');
        expect(currentPage).toHaveAttribute('data-active', 'true');
    });
    it('calls onPageChange when page is clicked', async () => {
        const onPageChange = vi.fn();
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Pagination_1.Pagination total={50} currentPage={1} pageSize={10} onPageChange={onPageChange}/>);
        await user.click(react_1.screen.getByLabelText('Page 3'));
        expect(onPageChange).toHaveBeenCalledWith(3);
    });
    it('navigates to previous page', async () => {
        const onPageChange = vi.fn();
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Pagination_1.Pagination total={50} currentPage={3} pageSize={10} onPageChange={onPageChange}/>);
        await user.click(react_1.screen.getByLabelText('Previous page'));
        expect(onPageChange).toHaveBeenCalledWith(2);
    });
    it('navigates to next page', async () => {
        const onPageChange = vi.fn();
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Pagination_1.Pagination total={50} currentPage={3} pageSize={10} onPageChange={onPageChange}/>);
        await user.click(react_1.screen.getByLabelText('Next page'));
        expect(onPageChange).toHaveBeenCalledWith(4);
    });
    it('navigates to first page', async () => {
        const onPageChange = vi.fn();
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Pagination_1.Pagination total={100} currentPage={5} pageSize={10} onPageChange={onPageChange}/>);
        await user.click(react_1.screen.getByLabelText('First page'));
        expect(onPageChange).toHaveBeenCalledWith(1);
    });
    it('navigates to last page', async () => {
        const onPageChange = vi.fn();
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Pagination_1.Pagination total={100} currentPage={5} pageSize={10} onPageChange={onPageChange}/>);
        await user.click(react_1.screen.getByLabelText('Last page'));
        expect(onPageChange).toHaveBeenCalledWith(10);
    });
    it('disables previous button on first page', () => {
        (0, react_1.render)(<Pagination_1.Pagination total={50} currentPage={1} pageSize={10} onPageChange={() => { }}/>);
        expect(react_1.screen.getByLabelText('Previous page')).toBeDisabled();
        expect(react_1.screen.getByLabelText('First page')).toBeDisabled();
    });
    it('disables next button on last page', () => {
        (0, react_1.render)(<Pagination_1.Pagination total={50} currentPage={5} pageSize={10} onPageChange={() => { }}/>);
        expect(react_1.screen.getByLabelText('Next page')).toBeDisabled();
        expect(react_1.screen.getByLabelText('Last page')).toBeDisabled();
    });
    it('shows ellipsis for many pages', () => {
        (0, react_1.render)(<Pagination_1.Pagination total={100} currentPage={5} pageSize={10} onPageChange={() => { }}/>);
        const ellipses = react_1.screen.getAllByText('...');
        expect(ellipses.length).toBeGreaterThan(0);
    });
    it('renders compact variant', () => {
        (0, react_1.render)(<Pagination_1.Pagination total={100} currentPage={5} pageSize={10} compact onPageChange={() => { }}/>);
        expect(react_1.screen.getByText(/Page 5 of 10/)).toBeInTheDocument();
        expect(react_1.screen.queryByLabelText('Page 1')).not.toBeInTheDocument();
    });
    it('hides first/last buttons when showFirstLast is false', () => {
        (0, react_1.render)(<Pagination_1.Pagination total={100} currentPage={5} pageSize={10} showFirstLast={false} onPageChange={() => { }}/>);
        expect(react_1.screen.queryByLabelText('First page')).not.toBeInTheDocument();
        expect(react_1.screen.queryByLabelText('Last page')).not.toBeInTheDocument();
    });
    it('supports custom siblings count', () => {
        const { rerender } = (0, react_1.render)(<Pagination_1.Pagination total={100} currentPage={5} pageSize={10} siblings={1} onPageChange={() => { }}/>);
        const withOneSibling = react_1.screen.getAllByRole('button').length;
        rerender(<Pagination_1.Pagination total={100} currentPage={5} pageSize={10} siblings={2} onPageChange={() => { }}/>);
        const withTwoSiblings = react_1.screen.getAllByRole('button').length;
        expect(withTwoSiblings).toBeGreaterThan(withOneSibling);
    });
    it('applies size variants', () => {
        const { container } = (0, react_1.render)(<Pagination_1.Pagination total={50} currentPage={1} pageSize={10} size="lg" onPageChange={() => { }}/>);
        expect(container.querySelector('button')).toHaveClass('h-11');
    });
    it('applies variant styles', () => {
        const { container } = (0, react_1.render)(<Pagination_1.Pagination total={50} currentPage={1} pageSize={10} variant="outline" onPageChange={() => { }}/>);
        expect(container.querySelector('button')).toHaveClass('border');
    });
    it('has no accessibility violations', async () => {
        const { container } = (0, react_1.render)(<Pagination_1.Pagination total={100} currentPage={5} pageSize={10} onPageChange={() => { }}/>);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
});
//# sourceMappingURL=Pagination.test.jsx.map