"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const Calendar_1 = require("./Calendar");
(0, vitest_1.describe)('Calendar', () => {
    (0, vitest_1.it)('renders calendar', () => {
        const { container } = (0, react_1.render)(<Calendar_1.Calendar mode="single"/>);
        (0, vitest_1.expect)(container.querySelector('.rdp')).toBeInTheDocument();
    });
    (0, vitest_1.it)('handles date selection', async () => {
        const onSelect = vitest_1.vi.fn();
        const { container } = (0, react_1.render)(<Calendar_1.Calendar mode="single" onSelect={onSelect}/>);
        const days = container.querySelectorAll('[role="gridcell"]');
        if (days.length > 0) {
            await user_event_1.default.click(days[15]);
            (0, vitest_1.expect)(onSelect).toHaveBeenCalled();
        }
    });
    (0, vitest_1.it)('renders with selected date', () => {
        const date = new Date(2024, 0, 15);
        (0, react_1.render)(<Calendar_1.Calendar mode="single" selected={date}/>);
        // Selected date should be marked in the calendar
    });
});
(0, vitest_1.describe)('DatePicker', () => {
    (0, vitest_1.it)('renders date picker with placeholder', () => {
        (0, react_1.render)(<Calendar_1.DatePicker placeholder="Select date"/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Select date')).toBeInTheDocument();
    });
    (0, vitest_1.it)('shows selected date', () => {
        const date = new Date(2024, 0, 15);
        (0, react_1.render)(<Calendar_1.DatePicker value={date}/>);
        (0, vitest_1.expect)(react_1.screen.getByText(/January 15, 2024/i)).toBeInTheDocument();
    });
    (0, vitest_1.it)('opens calendar on click', async () => {
        const user = user_event_1.default.setup();
        const { container } = (0, react_1.render)(<Calendar_1.DatePicker />);
        const button = react_1.screen.getByRole('button');
        await user.click(button);
        // Calendar should be visible
        (0, vitest_1.expect)(container.querySelector('.rdp')).toBeInTheDocument();
    });
    (0, vitest_1.it)('handles disabled state', () => {
        (0, react_1.render)(<Calendar_1.DatePicker disabled/>);
        const button = react_1.screen.getByRole('button');
        (0, vitest_1.expect)(button).toBeDisabled();
    });
});
(0, vitest_1.describe)('DateRangePicker', () => {
    (0, vitest_1.it)('renders date range picker with placeholder', () => {
        (0, react_1.render)(<Calendar_1.DateRangePicker placeholder="Select range"/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Select range')).toBeInTheDocument();
    });
    (0, vitest_1.it)('shows selected range', () => {
        const range = {
            from: new Date(2024, 0, 15),
            to: new Date(2024, 0, 20),
        };
        (0, react_1.render)(<Calendar_1.DateRangePicker value={range}/>);
        (0, vitest_1.expect)(react_1.screen.getByText(/Jan 15 - Jan 20/i)).toBeInTheDocument();
    });
    (0, vitest_1.it)('opens calendar on click', async () => {
        const user = user_event_1.default.setup();
        const { container } = (0, react_1.render)(<Calendar_1.DateRangePicker />);
        const button = react_1.screen.getByRole('button');
        await user.click(button);
        // Calendar should be visible
        (0, vitest_1.expect)(container.querySelector('.rdp')).toBeInTheDocument();
    });
});
//# sourceMappingURL=Calendar.test.jsx.map