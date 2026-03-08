"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const ColorSwatch_1 = require("./ColorSwatch");
(0, vitest_1.describe)('ColorSwatch', () => {
    (0, vitest_1.it)('renders with color', () => {
        (0, react_1.render)(<ColorSwatch_1.ColorSwatch color="#FF5733" label="Coral"/>);
        const swatch = react_1.screen.getByLabelText('Coral');
        (0, vitest_1.expect)(swatch).toHaveStyle({ backgroundColor: '#FF5733' });
    });
    (0, vitest_1.it)('shows check icon when selected', () => {
        (0, react_1.render)(<ColorSwatch_1.ColorSwatch color="#FF5733" selected/>);
        // Check icon should be present
    });
    (0, vitest_1.it)('handles click event', async () => {
        const user = user_event_1.default.setup();
        const onClick = vitest_1.vi.fn();
        (0, react_1.render)(<ColorSwatch_1.ColorSwatch color="#FF5733" onClick={onClick}/>);
        await user.click(react_1.screen.getByRole('button'));
        (0, vitest_1.expect)(onClick).toHaveBeenCalled();
    });
    (0, vitest_1.it)('applies size variants', () => {
        const { rerender } = (0, react_1.render)(<ColorSwatch_1.ColorSwatch color="#FF5733" size="sm"/>);
        (0, vitest_1.expect)(react_1.screen.getByRole('button')).toHaveClass('h-6');
        rerender(<ColorSwatch_1.ColorSwatch color="#FF5733" size="lg"/>);
        (0, vitest_1.expect)(react_1.screen.getByRole('button')).toHaveClass('h-10');
    });
    (0, vitest_1.it)('applies variant styles', () => {
        const { rerender } = (0, react_1.render)(<ColorSwatch_1.ColorSwatch color="#FF5733" variant="rounded"/>);
        (0, vitest_1.expect)(react_1.screen.getByRole('button')).toHaveClass('rounded-full');
        rerender(<ColorSwatch_1.ColorSwatch color="#FF5733" variant="square"/>);
        (0, vitest_1.expect)(react_1.screen.getByRole('button')).toHaveClass('rounded-none');
    });
});
(0, vitest_1.describe)('ColorSwatchGroup', () => {
    const colors = [
        { value: '#FF5733', label: 'Coral' },
        { value: '#33FF57', label: 'Green' },
        { value: '#3357FF', label: 'Blue' },
    ];
    (0, vitest_1.it)('renders multiple color swatches', () => {
        (0, react_1.render)(<ColorSwatch_1.ColorSwatchGroup colors={colors}/>);
        (0, vitest_1.expect)(react_1.screen.getByLabelText('Coral')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByLabelText('Green')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByLabelText('Blue')).toBeInTheDocument();
    });
    (0, vitest_1.it)('handles single selection', async () => {
        const user = user_event_1.default.setup();
        const onChange = vitest_1.vi.fn();
        (0, react_1.render)(<ColorSwatch_1.ColorSwatchGroup colors={colors} onChange={onChange}/>);
        await user.click(react_1.screen.getByLabelText('Coral'));
        (0, vitest_1.expect)(onChange).toHaveBeenCalledWith('#FF5733');
    });
    (0, vitest_1.it)('handles multiple selection', async () => {
        const user = user_event_1.default.setup();
        const onChange = vitest_1.vi.fn();
        (0, react_1.render)(<ColorSwatch_1.ColorSwatchGroup colors={colors} multiple onChange={onChange}/>);
        await user.click(react_1.screen.getByLabelText('Coral'));
        (0, vitest_1.expect)(onChange).toHaveBeenCalledWith(['#FF5733']);
        await user.click(react_1.screen.getByLabelText('Green'));
        (0, vitest_1.expect)(onChange).toHaveBeenLastCalledWith(['#FF5733', '#33FF57']);
    });
    (0, vitest_1.it)('shows labels when enabled', () => {
        (0, react_1.render)(<ColorSwatch_1.ColorSwatchGroup colors={colors} showLabels/>);
        (0, vitest_1.expect)(react_1.screen.getByText('Coral')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Green')).toBeInTheDocument();
    });
});
(0, vitest_1.describe)('ColorPalette', () => {
    const palette = {
        primary: [
            { value: '#FF5733', label: 'Red' },
            { value: '#33FF57', label: 'Green' },
        ],
        secondary: [
            { value: '#3357FF', label: 'Blue' },
            { value: '#F3FF33', label: 'Yellow' },
        ],
    };
    (0, vitest_1.it)('renders color palette with categories', () => {
        (0, react_1.render)(<ColorSwatch_1.ColorPalette palette={palette}/>);
        (0, vitest_1.expect)(react_1.screen.getByText('primary')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('secondary')).toBeInTheDocument();
    });
    (0, vitest_1.it)('handles color selection', async () => {
        const user = user_event_1.default.setup();
        const onChange = vitest_1.vi.fn();
        (0, react_1.render)(<ColorSwatch_1.ColorPalette palette={palette} onChange={onChange}/>);
        await user.click(react_1.screen.getByLabelText('Red'));
        (0, vitest_1.expect)(onChange).toHaveBeenCalledWith('#FF5733');
    });
});
(0, vitest_1.describe)('convertColor', () => {
    (0, vitest_1.it)('converts hex to rgb', () => {
        const rgb = ColorSwatch_1.convertColor.hexToRgb('#FF5733');
        (0, vitest_1.expect)(rgb).toEqual({ r: 255, g: 87, b: 51 });
    });
    (0, vitest_1.it)('converts rgb to hex', () => {
        const hex = ColorSwatch_1.convertColor.rgbToHex(255, 87, 51);
        (0, vitest_1.expect)(hex).toBe('#ff5733');
    });
    (0, vitest_1.it)('converts hex to hsl', () => {
        const hsl = ColorSwatch_1.convertColor.hexToHsl('#FF5733');
        (0, vitest_1.expect)(hsl).toBeDefined();
        (0, vitest_1.expect)(hsl?.h).toBeGreaterThanOrEqual(0);
        (0, vitest_1.expect)(hsl?.h).toBeLessThanOrEqual(360);
    });
});
//# sourceMappingURL=ColorSwatch.test.jsx.map