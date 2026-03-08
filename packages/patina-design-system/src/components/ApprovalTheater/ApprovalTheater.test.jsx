"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const ApprovalTheater_1 = require("./ApprovalTheater");
const vitest_1 = require("vitest");
const mockApproval = {
    id: 'test-approval',
    title: 'Test Approval',
    description: 'Test description',
    type: 'design',
    status: 'pending',
    costImpact: {
        amount: 5000,
        currency: '$',
    },
    designerNote: 'Test designer note',
};
(0, vitest_1.describe)('ApprovalTheater', () => {
    (0, vitest_1.it)('renders when open', () => {
        (0, react_1.render)(<ApprovalTheater_1.ApprovalTheater open={true} onOpenChange={() => { }} approval={mockApproval}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Test Approval')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Test description')).toBeInTheDocument();
    });
    (0, vitest_1.it)('does not render when closed', () => {
        const { container } = (0, react_1.render)(<ApprovalTheater_1.ApprovalTheater open={false} onOpenChange={() => { }} approval={mockApproval}/>);
        (0, vitest_1.expect)(container.firstChild).toBeNull();
    });
    (0, vitest_1.it)('calls onApprove when approve button is clicked', async () => {
        const onApprove = vitest_1.vi.fn();
        (0, react_1.render)(<ApprovalTheater_1.ApprovalTheater open={true} onOpenChange={() => { }} approval={mockApproval} onApprove={onApprove}/>);
        const approveButton = react_1.screen.getByRole('button', { name: /approve/i });
        react_1.fireEvent.click(approveButton);
        await (0, react_1.waitFor)(() => {
            (0, vitest_1.expect)(react_1.screen.getByText(/confirm & sign/i)).toBeInTheDocument();
        });
    });
    (0, vitest_1.it)('shows designer note when provided', () => {
        (0, react_1.render)(<ApprovalTheater_1.ApprovalTheater open={true} onOpenChange={() => { }} approval={mockApproval}/>);
        (0, vitest_1.expect)(react_1.screen.getByText("Designer's Note")).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Test designer note')).toBeInTheDocument();
    });
    (0, vitest_1.it)('displays cost impact', () => {
        (0, react_1.render)(<ApprovalTheater_1.ApprovalTheater open={true} onOpenChange={() => { }} approval={mockApproval}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Cost Impact')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('$5,000')).toBeInTheDocument();
    });
    (0, vitest_1.it)('calls onStartDiscussion when discussion button is clicked', () => {
        const onStartDiscussion = vitest_1.vi.fn();
        (0, react_1.render)(<ApprovalTheater_1.ApprovalTheater open={true} onOpenChange={() => { }} approval={mockApproval} onStartDiscussion={onStartDiscussion}/>);
        const discussionButton = react_1.screen.getByRole('button', { name: /start discussion/i });
        react_1.fireEvent.click(discussionButton);
        (0, vitest_1.expect)(onStartDiscussion).toHaveBeenCalledWith(mockApproval.id);
    });
    (0, vitest_1.it)('shows recommended action indicator', () => {
        (0, react_1.render)(<ApprovalTheater_1.ApprovalTheater open={true} onOpenChange={() => { }} approval={{
                ...mockApproval,
                recommendedAction: 'approve',
            }}/>);
        (0, vitest_1.expect)(react_1.screen.getByText(/recommended/i)).toBeInTheDocument();
    });
    (0, vitest_1.it)('switches between view tabs', () => {
        (0, react_1.render)(<ApprovalTheater_1.ApprovalTheater open={true} onOpenChange={() => { }} approval={mockApproval}/>);
        const costTab = react_1.screen.getByRole('button', { name: /cost impact/i });
        react_1.fireEvent.click(costTab);
        // Should show cost impact view
        (0, vitest_1.expect)(react_1.screen.getByText('Cost Impact')).toBeInTheDocument();
    });
});
//# sourceMappingURL=ApprovalTheater.test.jsx.map