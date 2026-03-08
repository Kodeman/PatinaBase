"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const Popover_1 = require("./Popover");
(0, vitest_1.describe)('Popover', () => {
    (0, vitest_1.it)('opens popover on click', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Popover_1.Popover>
        <Popover_1.PopoverTrigger>Open</Popover_1.PopoverTrigger>
        <Popover_1.PopoverContent>Popover content</Popover_1.PopoverContent>
      </Popover_1.Popover>);
        await user.click(react_1.screen.getByText('Open'));
        (0, vitest_1.expect)(await react_1.screen.findByText('Popover content')).toBeInTheDocument();
    });
});
//# sourceMappingURL=Popover.test.jsx.map