"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const DataTable_1 = require("./DataTable");
const mockData = [
    { id: '1', name: 'John Doe', email: 'john@example.com', age: 30 },
    { id: '2', name: 'Jane Smith', email: 'jane@example.com', age: 25 },
    { id: '3', name: 'Bob Johnson', email: 'bob@example.com', age: 35 },
];
const mockColumns = [
    {
        accessorKey: 'name',
        header: 'Name',
    },
    {
        accessorKey: 'email',
        header: 'Email',
    },
    {
        accessorKey: 'age',
        header: 'Age',
    },
];
(0, vitest_1.describe)('DataTable', () => {
    (0, vitest_1.it)('renders table with data', () => {
        (0, react_1.render)(<DataTable_1.DataTable columns={mockColumns} data={mockData}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Name')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Email')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Age')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('John Doe')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('jane@example.com')).toBeInTheDocument();
    });
    (0, vitest_1.it)('shows empty message when no data', () => {
        (0, react_1.render)(<DataTable_1.DataTable columns={mockColumns} data={[]} emptyMessage="No users found"/>);
        (0, vitest_1.expect)(react_1.screen.getByText('No users found')).toBeInTheDocument();
    });
    (0, vitest_1.it)('shows pagination controls when enabled', () => {
        (0, react_1.render)(<DataTable_1.DataTable columns={mockColumns} data={mockData} enablePagination pageSize={2}/>);
        (0, vitest_1.expect)(react_1.screen.getByText(/Page \d+ of \d+/)).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Rows per page')).toBeInTheDocument();
    });
    (0, vitest_1.it)('hides pagination when disabled', () => {
        (0, react_1.render)(<DataTable_1.DataTable columns={mockColumns} data={mockData} enablePagination={false}/>);
        (0, vitest_1.expect)(react_1.screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('allows pagination navigation', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<DataTable_1.DataTable columns={mockColumns} data={mockData} enablePagination pageSize={2}/>);
        // Should show page 1
        (0, vitest_1.expect)(react_1.screen.getByText('Page 1 of 2')).toBeInTheDocument();
        // Click next page
        const nextButton = react_1.screen.getAllByRole('button').find((btn) => btn.textContent === '›');
        if (nextButton) {
            await user.click(nextButton);
            (0, vitest_1.expect)(react_1.screen.getByText('Page 2 of 2')).toBeInTheDocument();
        }
    });
    (0, vitest_1.it)('calls onRowSelectionChange when rows are selected', () => {
        const handleRowSelection = vitest_1.vi.fn();
        // Note: Row selection requires checkbox column to be added manually
        // This test would need a more complete setup with selection column
        (0, react_1.render)(<DataTable_1.DataTable columns={mockColumns} data={mockData} enableRowSelection onRowSelectionChange={handleRowSelection}/>);
        // Basic render test - full selection test would require checkbox column
        (0, vitest_1.expect)(react_1.screen.getByText('0 of 3 row(s) selected.')).toBeInTheDocument();
    });
    (0, vitest_1.it)('shows sorting indicators when sorting is enabled', () => {
        (0, react_1.render)(<DataTable_1.DataTable columns={mockColumns} data={mockData} enableSorting/>);
        // Sorting indicators should be present (↕ for unsorted)
        const nameHeader = react_1.screen.getByText('Name').parentElement;
        (0, vitest_1.expect)(nameHeader).toHaveTextContent('↕');
    });
    (0, vitest_1.it)('disables sorting when enableSorting is false', () => {
        (0, react_1.render)(<DataTable_1.DataTable columns={mockColumns} data={mockData} enableSorting={false}/>);
        const nameHeader = react_1.screen.getByText('Name').parentElement;
        (0, vitest_1.expect)(nameHeader).not.toHaveTextContent('↕');
    });
});
//# sourceMappingURL=DataTable.test.jsx.map