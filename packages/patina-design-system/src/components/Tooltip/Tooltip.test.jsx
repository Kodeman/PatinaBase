"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const Tooltip_1 = require("./Tooltip");
(0, vitest_1.describe)('Tooltip', () => {
    (0, vitest_1.it)('shows tooltip on hover', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Tooltip_1.TooltipProvider>
        <Tooltip_1.Tooltip>
          <Tooltip_1.TooltipTrigger>Hover me</Tooltip_1.TooltipTrigger>
          <Tooltip_1.TooltipContent>Tooltip text</Tooltip_1.TooltipContent>
        </Tooltip_1.Tooltip>
      </Tooltip_1.TooltipProvider>);
        const trigger = react_1.screen.getByText('Hover me');
        await user.hover(trigger);
        (0, vitest_1.expect)(await react_1.screen.findByText('Tooltip text')).toBeInTheDocument();
    });
});
//# sourceMappingURL=Tooltip.test.jsx.map