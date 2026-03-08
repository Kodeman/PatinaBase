"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const Toast_1 = require("./Toast");
(0, vitest_1.describe)('Toast', () => {
    (0, vitest_1.it)('renders toast with title and description', () => {
        (0, react_1.render)(<Toast_1.ToastProvider>
        <Toast_1.Toast open={true}>
          <Toast_1.ToastTitle>Test Title</Toast_1.ToastTitle>
          <Toast_1.ToastDescription>Test Description</Toast_1.ToastDescription>
        </Toast_1.Toast>
        <Toast_1.ToastViewport />
      </Toast_1.ToastProvider>);
        (0, vitest_1.expect)(react_1.screen.getByText('Test Title')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Test Description')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders different variants', () => {
        const { rerender } = (0, react_1.render)(<Toast_1.ToastProvider>
        <Toast_1.Toast variant="info" open={true}>
          <Toast_1.ToastTitle>Info</Toast_1.ToastTitle>
        </Toast_1.Toast>
        <Toast_1.ToastViewport />
      </Toast_1.ToastProvider>);
        (0, vitest_1.expect)(react_1.screen.getByText('Info')).toBeInTheDocument();
        rerender(<Toast_1.ToastProvider>
        <Toast_1.Toast variant="success" open={true}>
          <Toast_1.ToastTitle>Success</Toast_1.ToastTitle>
        </Toast_1.Toast>
        <Toast_1.ToastViewport />
      </Toast_1.ToastProvider>);
        (0, vitest_1.expect)(react_1.screen.getByText('Success')).toBeInTheDocument();
    });
    (0, vitest_1.it)('calls onOpenChange when duration expires', async () => {
        const onOpenChange = vitest_1.vi.fn();
        (0, react_1.render)(<Toast_1.ToastProvider duration={100}>
        <Toast_1.Toast open={true} onOpenChange={onOpenChange}>
          <Toast_1.ToastTitle>Auto Close</Toast_1.ToastTitle>
        </Toast_1.Toast>
        <Toast_1.ToastViewport />
      </Toast_1.ToastProvider>);
        await (0, react_1.waitFor)(() => (0, vitest_1.expect)(onOpenChange).toHaveBeenCalledWith(false), {
            timeout: 200,
        });
    });
});
(0, vitest_1.describe)('ToastTitle', () => {
    (0, vitest_1.it)('renders title text', () => {
        (0, react_1.render)(<Toast_1.ToastProvider>
        <Toast_1.Toast open={true}>
          <Toast_1.ToastTitle>My Title</Toast_1.ToastTitle>
        </Toast_1.Toast>
        <Toast_1.ToastViewport />
      </Toast_1.ToastProvider>);
        (0, vitest_1.expect)(react_1.screen.getByText('My Title')).toBeInTheDocument();
    });
});
(0, vitest_1.describe)('ToastDescription', () => {
    (0, vitest_1.it)('renders description text', () => {
        (0, react_1.render)(<Toast_1.ToastProvider>
        <Toast_1.Toast open={true}>
          <Toast_1.ToastDescription>My Description</Toast_1.ToastDescription>
        </Toast_1.Toast>
        <Toast_1.ToastViewport />
      </Toast_1.ToastProvider>);
        (0, vitest_1.expect)(react_1.screen.getByText('My Description')).toBeInTheDocument();
    });
});
//# sourceMappingURL=Toast.test.jsx.map