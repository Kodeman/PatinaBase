"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const DropdownMenu_1 = require("./DropdownMenu");
(0, vitest_1.describe)('DropdownMenu', () => {
    (0, vitest_1.it)('opens dropdown on click', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<DropdownMenu_1.DropdownMenu>
        <DropdownMenu_1.DropdownMenuTrigger>Open</DropdownMenu_1.DropdownMenuTrigger>
        <DropdownMenu_1.DropdownMenuContent>
          <DropdownMenu_1.DropdownMenuItem>Item 1</DropdownMenu_1.DropdownMenuItem>
          <DropdownMenu_1.DropdownMenuItem>Item 2</DropdownMenu_1.DropdownMenuItem>
        </DropdownMenu_1.DropdownMenuContent>
      </DropdownMenu_1.DropdownMenu>);
        await user.click(react_1.screen.getByText('Open'));
        (0, vitest_1.expect)(await react_1.screen.findByText('Item 1')).toBeInTheDocument();
        (0, vitest_1.expect)(await react_1.screen.findByText('Item 2')).toBeInTheDocument();
    });
});
//# sourceMappingURL=DropdownMenu.test.jsx.map