"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const Stepper_1 = require("./Stepper");
const mockSteps = [
    { id: '1', label: 'Account', description: 'Create your account' },
    { id: '2', label: 'Profile', description: 'Setup your profile' },
    { id: '3', label: 'Complete', description: 'All done!' },
];
(0, vitest_1.describe)('Stepper', () => {
    (0, vitest_1.it)('renders all steps', () => {
        (0, react_1.render)(<Stepper_1.Stepper steps={mockSteps} currentStep={0}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Account')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Profile')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Complete')).toBeInTheDocument();
    });
    (0, vitest_1.it)('marks current step correctly', () => {
        (0, react_1.render)(<Stepper_1.Stepper steps={mockSteps} currentStep={1}/>);
        const profileButton = react_1.screen.getByRole('button', { name: /2/i });
        (0, vitest_1.expect)(profileButton).toHaveAttribute('aria-current', 'step');
    });
    (0, vitest_1.it)('shows checkmark for completed steps', () => {
        (0, react_1.render)(<Stepper_1.Stepper steps={mockSteps} currentStep={2}/>);
        // First two steps should be completed and show checkmarks
        const buttons = react_1.screen.getAllByRole('button');
        (0, vitest_1.expect)(buttons[0].querySelector('svg')).toBeInTheDocument();
        (0, vitest_1.expect)(buttons[1].querySelector('svg')).toBeInTheDocument();
    });
    (0, vitest_1.it)('calls onStepClick when clickable', async () => {
        const user = user_event_1.default.setup();
        const handleStepClick = vitest_1.vi.fn();
        (0, react_1.render)(<Stepper_1.Stepper steps={mockSteps} currentStep={1} clickable onStepClick={handleStepClick}/>);
        const firstStep = react_1.screen.getByRole('button', { name: /1/i });
        await user.click(firstStep);
        (0, vitest_1.expect)(handleStepClick).toHaveBeenCalledWith(0);
    });
    (0, vitest_1.it)('does not call onStepClick when not clickable', async () => {
        const user = user_event_1.default.setup();
        const handleStepClick = vitest_1.vi.fn();
        (0, react_1.render)(<Stepper_1.Stepper steps={mockSteps} currentStep={1} clickable={false} onStepClick={handleStepClick}/>);
        const firstStep = react_1.screen.getByRole('button', { name: /1/i });
        await user.click(firstStep);
        (0, vitest_1.expect)(handleStepClick).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('renders in vertical orientation', () => {
        const { container } = (0, react_1.render)(<Stepper_1.Stepper steps={mockSteps} currentStep={0} orientation="vertical"/>);
        const stepper = container.firstChild;
        (0, vitest_1.expect)(stepper).toHaveClass('flex-col');
    });
    (0, vitest_1.it)('shows optional indicator', () => {
        const stepsWithOptional = [
            ...mockSteps,
            { id: '4', label: 'Newsletter', optional: true },
        ];
        (0, react_1.render)(<Stepper_1.Stepper steps={stepsWithOptional} currentStep={0}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('(Optional)')).toBeInTheDocument();
    });
});
//# sourceMappingURL=Stepper.test.jsx.map