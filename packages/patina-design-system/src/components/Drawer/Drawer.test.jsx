"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const vitest_1 = require("vitest");
const Drawer_1 = require("./Drawer");
(0, vitest_1.describe)('Drawer', () => {
    (0, vitest_1.it)('renders trigger button', () => {
        (0, react_1.render)(<Drawer_1.Drawer>
        <Drawer_1.DrawerTrigger>Open Drawer</Drawer_1.DrawerTrigger>
        <Drawer_1.DrawerContent>
          <Drawer_1.DrawerHeader>
            <Drawer_1.DrawerTitle>Drawer Title</Drawer_1.DrawerTitle>
          </Drawer_1.DrawerHeader>
        </Drawer_1.DrawerContent>
      </Drawer_1.Drawer>);
        (0, vitest_1.expect)(react_1.screen.getByText('Open Drawer')).toBeInTheDocument();
    });
    (0, vitest_1.it)('opens drawer when trigger is clicked', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Drawer_1.Drawer>
        <Drawer_1.DrawerTrigger>Open Drawer</Drawer_1.DrawerTrigger>
        <Drawer_1.DrawerContent>
          <Drawer_1.DrawerHeader>
            <Drawer_1.DrawerTitle>Drawer Title</Drawer_1.DrawerTitle>
            <Drawer_1.DrawerDescription>Drawer description</Drawer_1.DrawerDescription>
          </Drawer_1.DrawerHeader>
        </Drawer_1.DrawerContent>
      </Drawer_1.Drawer>);
        await user.click(react_1.screen.getByText('Open Drawer'));
        (0, vitest_1.expect)(react_1.screen.getByText('Drawer Title')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Drawer description')).toBeInTheDocument();
    });
    (0, vitest_1.it)('closes drawer when close button is clicked', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Drawer_1.Drawer>
        <Drawer_1.DrawerTrigger>Open Drawer</Drawer_1.DrawerTrigger>
        <Drawer_1.DrawerContent>
          <Drawer_1.DrawerHeader>
            <Drawer_1.DrawerTitle>Drawer Title</Drawer_1.DrawerTitle>
          </Drawer_1.DrawerHeader>
        </Drawer_1.DrawerContent>
      </Drawer_1.Drawer>);
        await user.click(react_1.screen.getByText('Open Drawer'));
        (0, vitest_1.expect)(react_1.screen.getByText('Drawer Title')).toBeInTheDocument();
        const closeButton = react_1.screen.getByRole('button', { name: /close/i });
        await user.click(closeButton);
        await vitest_1.vi.waitFor(() => {
            (0, vitest_1.expect)(react_1.screen.queryByText('Drawer Title')).not.toBeInTheDocument();
        });
    });
    (0, vitest_1.it)('supports different sides', async () => {
        const user = user_event_1.default.setup();
        const { rerender } = (0, react_1.render)(<Drawer_1.Drawer>
        <Drawer_1.DrawerTrigger>Open Drawer</Drawer_1.DrawerTrigger>
        <Drawer_1.DrawerContent side="left">
          <Drawer_1.DrawerTitle>Left Drawer</Drawer_1.DrawerTitle>
        </Drawer_1.DrawerContent>
      </Drawer_1.Drawer>);
        await user.click(react_1.screen.getByText('Open Drawer'));
        (0, vitest_1.expect)(react_1.screen.getByText('Left Drawer')).toBeInTheDocument();
        rerender(<Drawer_1.Drawer>
        <Drawer_1.DrawerTrigger>Open Drawer</Drawer_1.DrawerTrigger>
        <Drawer_1.DrawerContent side="right">
          <Drawer_1.DrawerTitle>Right Drawer</Drawer_1.DrawerTitle>
        </Drawer_1.DrawerContent>
      </Drawer_1.Drawer>);
    });
    (0, vitest_1.it)('renders footer content', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Drawer_1.Drawer>
        <Drawer_1.DrawerTrigger>Open Drawer</Drawer_1.DrawerTrigger>
        <Drawer_1.DrawerContent>
          <Drawer_1.DrawerHeader>
            <Drawer_1.DrawerTitle>Drawer Title</Drawer_1.DrawerTitle>
          </Drawer_1.DrawerHeader>
          <Drawer_1.DrawerFooter>
            <button>Cancel</button>
            <button>Save</button>
          </Drawer_1.DrawerFooter>
        </Drawer_1.DrawerContent>
      </Drawer_1.Drawer>);
        await user.click(react_1.screen.getByText('Open Drawer'));
        (0, vitest_1.expect)(react_1.screen.getByText('Cancel')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Save')).toBeInTheDocument();
    });
});
//# sourceMappingURL=Drawer.test.jsx.map