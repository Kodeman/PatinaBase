"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const vitest_1 = require("vitest");
const ContextMenu_1 = require("./ContextMenu");
(0, vitest_1.describe)('ContextMenu', () => {
    (0, vitest_1.it)('renders trigger area', () => {
        (0, react_1.render)(<ContextMenu_1.ContextMenu>
        <ContextMenu_1.ContextMenuTrigger>Right click me</ContextMenu_1.ContextMenuTrigger>
        <ContextMenu_1.ContextMenuContent>
          <ContextMenu_1.ContextMenuItem>Item 1</ContextMenu_1.ContextMenuItem>
        </ContextMenu_1.ContextMenuContent>
      </ContextMenu_1.ContextMenu>);
        (0, vitest_1.expect)(react_1.screen.getByText('Right click me')).toBeInTheDocument();
    });
    (0, vitest_1.it)('opens menu on right click', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<ContextMenu_1.ContextMenu>
        <ContextMenu_1.ContextMenuTrigger>Right click me</ContextMenu_1.ContextMenuTrigger>
        <ContextMenu_1.ContextMenuContent>
          <ContextMenu_1.ContextMenuItem>Copy</ContextMenu_1.ContextMenuItem>
          <ContextMenu_1.ContextMenuItem>Paste</ContextMenu_1.ContextMenuItem>
        </ContextMenu_1.ContextMenuContent>
      </ContextMenu_1.ContextMenu>);
        await user.pointer({
            keys: '[MouseRight]',
            target: react_1.screen.getByText('Right click me'),
        });
        (0, vitest_1.expect)(react_1.screen.getByText('Copy')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Paste')).toBeInTheDocument();
    });
    (0, vitest_1.it)('handles menu item clicks', async () => {
        const user = user_event_1.default.setup();
        const handleClick = vitest_1.vi.fn();
        (0, react_1.render)(<ContextMenu_1.ContextMenu>
        <ContextMenu_1.ContextMenuTrigger>Right click me</ContextMenu_1.ContextMenuTrigger>
        <ContextMenu_1.ContextMenuContent>
          <ContextMenu_1.ContextMenuItem onSelect={handleClick}>Action</ContextMenu_1.ContextMenuItem>
        </ContextMenu_1.ContextMenuContent>
      </ContextMenu_1.ContextMenu>);
        await user.pointer({
            keys: '[MouseRight]',
            target: react_1.screen.getByText('Right click me'),
        });
        await user.click(react_1.screen.getByText('Action'));
        (0, vitest_1.expect)(handleClick).toHaveBeenCalled();
    });
    (0, vitest_1.it)('renders separator', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<ContextMenu_1.ContextMenu>
        <ContextMenu_1.ContextMenuTrigger>Right click me</ContextMenu_1.ContextMenuTrigger>
        <ContextMenu_1.ContextMenuContent>
          <ContextMenu_1.ContextMenuItem>Item 1</ContextMenu_1.ContextMenuItem>
          <ContextMenu_1.ContextMenuSeparator />
          <ContextMenu_1.ContextMenuItem>Item 2</ContextMenu_1.ContextMenuItem>
        </ContextMenu_1.ContextMenuContent>
      </ContextMenu_1.ContextMenu>);
        await user.pointer({
            keys: '[MouseRight]',
            target: react_1.screen.getByText('Right click me'),
        });
        const separator = react_1.screen.getByRole('separator');
        (0, vitest_1.expect)(separator).toBeInTheDocument();
    });
    (0, vitest_1.it)('supports checkbox items', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<ContextMenu_1.ContextMenu>
        <ContextMenu_1.ContextMenuTrigger>Right click me</ContextMenu_1.ContextMenuTrigger>
        <ContextMenu_1.ContextMenuContent>
          <ContextMenu_1.ContextMenuCheckboxItem checked={false}>Option 1</ContextMenu_1.ContextMenuCheckboxItem>
          <ContextMenu_1.ContextMenuCheckboxItem checked={true}>Option 2</ContextMenu_1.ContextMenuCheckboxItem>
        </ContextMenu_1.ContextMenuContent>
      </ContextMenu_1.ContextMenu>);
        await user.pointer({
            keys: '[MouseRight]',
            target: react_1.screen.getByText('Right click me'),
        });
        (0, vitest_1.expect)(react_1.screen.getByText('Option 1')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Option 2')).toBeInTheDocument();
    });
    (0, vitest_1.it)('supports disabled items', async () => {
        const user = user_event_1.default.setup();
        const handleClick = vitest_1.vi.fn();
        (0, react_1.render)(<ContextMenu_1.ContextMenu>
        <ContextMenu_1.ContextMenuTrigger>Right click me</ContextMenu_1.ContextMenuTrigger>
        <ContextMenu_1.ContextMenuContent>
          <ContextMenu_1.ContextMenuItem disabled onSelect={handleClick}>
            Disabled Item
          </ContextMenu_1.ContextMenuItem>
        </ContextMenu_1.ContextMenuContent>
      </ContextMenu_1.ContextMenu>);
        await user.pointer({
            keys: '[MouseRight]',
            target: react_1.screen.getByText('Right click me'),
        });
        const disabledItem = react_1.screen.getByText('Disabled Item');
        (0, vitest_1.expect)(disabledItem).toHaveAttribute('data-disabled');
        await user.click(disabledItem);
        (0, vitest_1.expect)(handleClick).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=ContextMenu.test.jsx.map