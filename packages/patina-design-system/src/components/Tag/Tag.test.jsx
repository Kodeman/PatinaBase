"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const Tag_1 = require("./Tag");
(0, vitest_1.describe)('Tag', () => {
    (0, vitest_1.it)('renders correctly', () => {
        (0, react_1.render)(<Tag_1.Tag>Test Tag</Tag_1.Tag>);
        (0, vitest_1.expect)(react_1.screen.getByText('Test Tag')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders with different variants', () => {
        const { rerender } = (0, react_1.render)(<Tag_1.Tag variant="success">Success</Tag_1.Tag>);
        (0, vitest_1.expect)(react_1.screen.getByText('Success')).toHaveClass('bg-green-100');
        rerender(<Tag_1.Tag variant="error">Error</Tag_1.Tag>);
        (0, vitest_1.expect)(react_1.screen.getByText('Error')).toHaveClass('bg-red-100');
        rerender(<Tag_1.Tag variant="warning">Warning</Tag_1.Tag>);
        (0, vitest_1.expect)(react_1.screen.getByText('Warning')).toHaveClass('bg-yellow-100');
    });
    (0, vitest_1.it)('renders with remove button when onRemove is provided', () => {
        const handleRemove = vitest_1.vi.fn();
        (0, react_1.render)(<Tag_1.Tag onRemove={handleRemove}>Removable</Tag_1.Tag>);
        const removeButton = react_1.screen.getByRole('button', { name: /remove tag/i });
        (0, vitest_1.expect)(removeButton).toBeInTheDocument();
    });
    (0, vitest_1.it)('calls onRemove when remove button is clicked', async () => {
        const user = user_event_1.default.setup();
        const handleRemove = vitest_1.vi.fn();
        (0, react_1.render)(<Tag_1.Tag onRemove={handleRemove}>Removable</Tag_1.Tag>);
        const removeButton = react_1.screen.getByRole('button', { name: /remove tag/i });
        await user.click(removeButton);
        (0, vitest_1.expect)(handleRemove).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)('does not show remove button when onRemove is not provided', () => {
        (0, react_1.render)(<Tag_1.Tag>Not Removable</Tag_1.Tag>);
        const removeButton = react_1.screen.queryByRole('button', { name: /remove tag/i });
        (0, vitest_1.expect)(removeButton).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('renders with icon', () => {
        (0, react_1.render)(<Tag_1.Tag icon={<span>🔥</span>}>With Icon</Tag_1.Tag>);
        (0, vitest_1.expect)(react_1.screen.getByText('🔥')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('With Icon')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders TagGroup with multiple tags', () => {
        (0, react_1.render)(<Tag_1.TagGroup>
        <Tag_1.Tag>Tag 1</Tag_1.Tag>
        <Tag_1.Tag>Tag 2</Tag_1.Tag>
        <Tag_1.Tag>Tag 3</Tag_1.Tag>
      </Tag_1.TagGroup>);
        (0, vitest_1.expect)(react_1.screen.getByText('Tag 1')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Tag 2')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Tag 3')).toBeInTheDocument();
    });
});
//# sourceMappingURL=Tag.test.jsx.map