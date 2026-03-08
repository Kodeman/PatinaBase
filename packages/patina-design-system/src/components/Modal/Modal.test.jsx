"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const Modal_1 = require("./Modal");
(0, vitest_1.describe)('Modal', () => {
    (0, vitest_1.it)('renders trigger and opens modal', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Modal_1.Modal>
        <Modal_1.ModalTrigger>Open Modal</Modal_1.ModalTrigger>
        <Modal_1.ModalContent>
          <Modal_1.ModalHeader>
            <Modal_1.ModalTitle>Test Modal</Modal_1.ModalTitle>
            <Modal_1.ModalDescription>This is a test modal</Modal_1.ModalDescription>
          </Modal_1.ModalHeader>
        </Modal_1.ModalContent>
      </Modal_1.Modal>);
        const trigger = react_1.screen.getByText('Open Modal');
        await user.click(trigger);
        (0, vitest_1.expect)(react_1.screen.getByText('Test Modal')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('This is a test modal')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders different sizes', async () => {
        const user = user_event_1.default.setup();
        const { rerender } = (0, react_1.render)(<Modal_1.Modal defaultOpen>
        <Modal_1.ModalContent size="sm">
          <Modal_1.ModalTitle>Small Modal</Modal_1.ModalTitle>
        </Modal_1.ModalContent>
      </Modal_1.Modal>);
        (0, vitest_1.expect)(react_1.screen.getByText('Small Modal')).toBeInTheDocument();
        rerender(<Modal_1.Modal defaultOpen>
        <Modal_1.ModalContent size="lg">
          <Modal_1.ModalTitle>Large Modal</Modal_1.ModalTitle>
        </Modal_1.ModalContent>
      </Modal_1.Modal>);
        (0, vitest_1.expect)(react_1.screen.getByText('Large Modal')).toBeInTheDocument();
    });
});
//# sourceMappingURL=Modal.test.jsx.map