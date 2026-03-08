"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const VirtualList_1 = require("./VirtualList");
(0, vitest_1.describe)('VirtualList', () => {
    const mockItems = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
    }));
    (0, vitest_1.it)('renders virtual list', () => {
        (0, react_1.render)(<VirtualList_1.VirtualList items={mockItems} renderItem={(item) => <div key={item.id}>{item.name}</div>} height={400}/>);
        // Virtual list only renders visible items
        (0, vitest_1.expect)(react_1.screen.queryByText('Item 0')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders empty state when no items', () => {
        (0, react_1.render)(<VirtualList_1.VirtualList items={[]} renderItem={(item) => <div>{item}</div>} emptyComponent={<div>No items</div>}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('No items')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders loading state', () => {
        (0, react_1.render)(<VirtualList_1.VirtualList items={mockItems} renderItem={(item) => <div>{item.name}</div>} isLoading loadingComponent={<div>Loading...</div>}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Loading...')).toBeInTheDocument();
    });
    (0, vitest_1.it)('uses custom key extractor', () => {
        const getItemKey = vitest_1.vi.fn((item) => item.id);
        (0, react_1.render)(<VirtualList_1.VirtualList items={mockItems} renderItem={(item) => <div>{item.name}</div>} getItemKey={getItemKey}/>);
        (0, vitest_1.expect)(getItemKey).toHaveBeenCalled();
    });
});
(0, vitest_1.describe)('VirtualGrid', () => {
    const mockItems = Array.from({ length: 20 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
    }));
    (0, vitest_1.it)('renders virtual grid', () => {
        (0, react_1.render)(<VirtualList_1.VirtualGrid items={mockItems} renderItem={(item) => <div key={item.id}>{item.name}</div>} columns={3} height={400}/>);
        (0, vitest_1.expect)(react_1.screen.queryByText('Item 0')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders with custom column count', () => {
        const { container } = (0, react_1.render)(<VirtualList_1.VirtualGrid items={mockItems} renderItem={(item) => <div key={item.id}>{item.name}</div>} columns={4}/>);
        (0, vitest_1.expect)(container).toBeInTheDocument();
    });
});
//# sourceMappingURL=VirtualList.test.jsx.map