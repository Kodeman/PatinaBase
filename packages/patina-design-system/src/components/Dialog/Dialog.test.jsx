"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const vitest_1 = require("vitest");
const Dialog_1 = require("./Dialog");
(0, vitest_1.describe)('Dialog', () => {
    (0, vitest_1.it)('renders trigger button', () => {
        (0, react_1.render)(<Dialog_1.Dialog>
        <Dialog_1.DialogTrigger>Open Dialog</Dialog_1.DialogTrigger>
        <Dialog_1.DialogContent>
          <Dialog_1.DialogHeader>
            <Dialog_1.DialogTitle>Dialog Title</Dialog_1.DialogTitle>
          </Dialog_1.DialogHeader>
        </Dialog_1.DialogContent>
      </Dialog_1.Dialog>);
        (0, vitest_1.expect)(react_1.screen.getByText('Open Dialog')).toBeInTheDocument();
    });
    (0, vitest_1.it)('opens dialog when trigger is clicked', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Dialog_1.Dialog>
        <Dialog_1.DialogTrigger>Open Dialog</Dialog_1.DialogTrigger>
        <Dialog_1.DialogContent>
          <Dialog_1.DialogHeader>
            <Dialog_1.DialogTitle>Dialog Title</Dialog_1.DialogTitle>
            <Dialog_1.DialogDescription>Dialog description text</Dialog_1.DialogDescription>
          </Dialog_1.DialogHeader>
        </Dialog_1.DialogContent>
      </Dialog_1.Dialog>);
        await user.click(react_1.screen.getByText('Open Dialog'));
        (0, vitest_1.expect)(react_1.screen.getByText('Dialog Title')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Dialog description text')).toBeInTheDocument();
    });
    (0, vitest_1.it)('closes dialog when close button is clicked', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Dialog_1.Dialog>
        <Dialog_1.DialogTrigger>Open Dialog</Dialog_1.DialogTrigger>
        <Dialog_1.DialogContent>
          <Dialog_1.DialogHeader>
            <Dialog_1.DialogTitle>Dialog Title</Dialog_1.DialogTitle>
          </Dialog_1.DialogHeader>
        </Dialog_1.DialogContent>
      </Dialog_1.Dialog>);
        await user.click(react_1.screen.getByText('Open Dialog'));
        (0, vitest_1.expect)(react_1.screen.getByText('Dialog Title')).toBeInTheDocument();
        const closeButton = react_1.screen.getByRole('button', { name: /close/i });
        await user.click(closeButton);
        // Wait for dialog to close
        await vitest_1.vi.waitFor(() => {
            (0, vitest_1.expect)(react_1.screen.queryByText('Dialog Title')).not.toBeInTheDocument();
        });
    });
    (0, vitest_1.it)('renders footer content', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Dialog_1.Dialog>
        <Dialog_1.DialogTrigger>Open Dialog</Dialog_1.DialogTrigger>
        <Dialog_1.DialogContent>
          <Dialog_1.DialogHeader>
            <Dialog_1.DialogTitle>Dialog Title</Dialog_1.DialogTitle>
          </Dialog_1.DialogHeader>
          <Dialog_1.DialogFooter>
            <button>Cancel</button>
            <button>Confirm</button>
          </Dialog_1.DialogFooter>
        </Dialog_1.DialogContent>
      </Dialog_1.Dialog>);
        await user.click(react_1.screen.getByText('Open Dialog'));
        (0, vitest_1.expect)(react_1.screen.getByText('Cancel')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Confirm')).toBeInTheDocument();
    });
    (0, vitest_1.it)('handles controlled state', async () => {
        const user = user_event_1.default.setup();
        const onOpenChange = vitest_1.vi.fn();
        const ControlledDialog = () => {
            const [open, setOpen] = React.useState(false);
            return (<Dialog_1.Dialog open={open} onOpenChange={(isOpen) => {
                    setOpen(isOpen);
                    onOpenChange(isOpen);
                }}>
          <Dialog_1.DialogTrigger>Open Dialog</Dialog_1.DialogTrigger>
          <Dialog_1.DialogContent>
            <Dialog_1.DialogHeader>
              <Dialog_1.DialogTitle>Controlled Dialog</Dialog_1.DialogTitle>
            </Dialog_1.DialogHeader>
          </Dialog_1.DialogContent>
        </Dialog_1.Dialog>);
        };
        (0, react_1.render)(<ControlledDialog />);
        await user.click(react_1.screen.getByText('Open Dialog'));
        (0, vitest_1.expect)(onOpenChange).toHaveBeenCalledWith(true);
        (0, vitest_1.expect)(react_1.screen.getByText('Controlled Dialog')).toBeInTheDocument();
    });
});
//# sourceMappingURL=Dialog.test.jsx.map