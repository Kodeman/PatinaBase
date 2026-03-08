"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const vitest_axe_1 = require("vitest-axe");
const Avatar_1 = require("./Avatar");
describe('Avatar', () => {
    it('renders image when src is provided', async () => {
        (0, react_1.render)(<Avatar_1.Avatar src="/avatar.jpg" alt="John Doe"/>);
        await (0, react_1.waitFor)(() => {
            const img = react_1.screen.getByRole('img');
            expect(img).toBeInTheDocument();
            expect(img).toHaveAttribute('src', '/avatar.jpg');
            expect(img).toHaveAttribute('alt', 'John Doe');
        });
    });
    it('renders fallback initials from name', async () => {
        (0, react_1.render)(<Avatar_1.Avatar name="John Doe" fallbackDelay={0}/>);
        await (0, react_1.waitFor)(() => {
            expect(react_1.screen.getByText('JD')).toBeInTheDocument();
        });
    });
    it('renders single letter initials for single word names', async () => {
        (0, react_1.render)(<Avatar_1.Avatar name="Madonna" fallbackDelay={0}/>);
        await (0, react_1.waitFor)(() => {
            expect(react_1.screen.getByText('MA')).toBeInTheDocument();
        });
    });
    it('renders question mark when no name is provided', async () => {
        (0, react_1.render)(<Avatar_1.Avatar fallbackDelay={0}/>);
        await (0, react_1.waitFor)(() => {
            expect(react_1.screen.getByText('?')).toBeInTheDocument();
        });
    });
    it('applies size variants correctly', () => {
        const { container } = (0, react_1.render)(<Avatar_1.Avatar name="John" size="lg"/>);
        expect(container.firstChild).toHaveClass('h-12', 'w-12');
    });
    it('applies shape variants correctly', () => {
        const { container: circleContainer } = (0, react_1.render)(<Avatar_1.Avatar name="John" shape="circle"/>);
        expect(circleContainer.firstChild).toHaveClass('rounded-full');
        const { container: squareContainer } = (0, react_1.render)(<Avatar_1.Avatar name="John" shape="square"/>);
        expect(squareContainer.firstChild).toHaveClass('rounded-md');
    });
    it('renders status indicator when status is provided', () => {
        (0, react_1.render)(<Avatar_1.Avatar name="John Doe" status="online"/>);
        expect(react_1.screen.getByLabelText('Status: online')).toBeInTheDocument();
    });
    it('applies correct status color', () => {
        const { rerender } = (0, react_1.render)(<Avatar_1.Avatar name="John" status="online"/>);
        expect(react_1.screen.getByLabelText('Status: online')).toHaveClass('bg-green-500');
        rerender(<Avatar_1.Avatar name="John" status="offline"/>);
        expect(react_1.screen.getByLabelText('Status: offline')).toHaveClass('bg-gray-400');
        rerender(<Avatar_1.Avatar name="John" status="busy"/>);
        expect(react_1.screen.getByLabelText('Status: busy')).toHaveClass('bg-red-500');
        rerender(<Avatar_1.Avatar name="John" status="away"/>);
        expect(react_1.screen.getByLabelText('Status: away')).toHaveClass('bg-yellow-500');
    });
    it('uses alt as fallback when name is not provided', async () => {
        (0, react_1.render)(<Avatar_1.Avatar src="/avatar.jpg" alt="Jane Smith"/>);
        const img = await react_1.screen.findByRole('img');
        expect(img).toHaveAttribute('alt', 'Jane Smith');
    });
    it('applies custom className', () => {
        const { container } = (0, react_1.render)(<Avatar_1.Avatar name="John" className="custom-class"/>);
        expect(container.firstChild).toHaveClass('custom-class');
    });
    it('handles extra long names gracefully', async () => {
        (0, react_1.render)(<Avatar_1.Avatar name="Jean-Baptiste Emmanuel Zorg" fallbackDelay={0}/>);
        await (0, react_1.waitFor)(() => {
            expect(react_1.screen.getByText('JZ')).toBeInTheDocument();
        });
    });
    it('has no accessibility violations', async () => {
        const { container } = (0, react_1.render)(<Avatar_1.Avatar name="John Doe" status="online"/>);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
});
//# sourceMappingURL=Avatar.test.jsx.map